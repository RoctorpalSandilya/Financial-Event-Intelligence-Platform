from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse
from langchain_protocol import Annotated
from pydantic import BaseModel, EmailStr, Field
import os
from dotenv import load_dotenv
from fastapi.security import OAuth2PasswordBearer
from passlib.context import CryptContext
from db_models import get_db_connection, create_user_table, insert_user
from datetime import datetime, timedelta
from jose import JWTError, jwt
load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM")
TOKEN_EXPIRE_MINUTES = int(os.getenv("TOKEN_EXPIRE_MINUTES"))
bcrypt_salt = int(os.getenv("BCRYPT_SALT"))

router= APIRouter(prefix="/auth", tags=["auth"])
bcrypt_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_bearer= OAuth2PasswordBearer(tokenUrl="auth/login")

def hash_password(password: str) -> str:
    return bcrypt_context.hash(password)

def create_access_token(username:str, expires_delta: timedelta = None):
    encode= {"sub": username}
    if expires_delta:
        expire= datetime.now() + expires_delta
        encode["exp"] = expire
    return jwt.encode(encode, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(token: str = Annotated[str, Depends(oauth2_bearer)]):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return username
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

class CreateUserRequest(BaseModel):
    username: Annotated[str, Field(...)]    
    password: Annotated[str, Field(...)]
    email: EmailStr = Annotated[str, Field(...)]

class LoginRequest(BaseModel):
    username: Annotated[str, Field(...)]    
    password: Annotated[str, Field(...)]

class Token(BaseModel):
    access_token: str
    token_type: str

@router.post("/login", response_model=Token)
def login(user: LoginRequest):
    conn, cursor = get_db_connection()
    create_user_table(cursor)
    try:
        cursor.execute("SELECT password_hash FROM users WHERE username = %s", (user.username,))
        result = cursor.fetchone()
        if not result:
            raise HTTPException(status_code=401, detail="Invalid username or password")
        
        stored_password_hash = result[0]
        if not bcrypt_context.verify(user.password, stored_password_hash):
            raise HTTPException(status_code=401, detail="Invalid username or password")
        
        access_token = create_access_token(user.username, expires_delta=timedelta(minutes=TOKEN_EXPIRE_MINUTES))
        return {"access_token": access_token, "token_type": "bearer"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error during login: {e}")
    finally:
        cursor.close()
        conn.close()

@router.post("/signup", response_model=Token)
def signup(user: CreateUserRequest):
    conn, cursor = get_db_connection()
    create_user_table(cursor)
    password_hash = hash_password(user.password) 
    try:
        insert_user(cursor, user.username, password_hash, user.email)
        conn.commit()
        return JSONResponse(content={"message": "User registered successfully."}, status_code=201)
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=f"Error registering user: {e}")
    finally:
        cursor.close()
        conn.close()

@router.put("/change_password/{username}")
def change_password(username: str, new_password: str):
    conn, cursor = get_db_connection()
    create_user_table(cursor)
    new_password_hash = hash_password(new_password)
    try:
        cursor.execute("UPDATE users SET password_hash = %s WHERE username = %s", (new_password_hash, username))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="User not found.")
        conn.commit()
        return JSONResponse(content={"message": "Password changed successfully."}, status_code=200)
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=f"Error changing password: {e}")
    finally:
        cursor.close()
        conn.close()