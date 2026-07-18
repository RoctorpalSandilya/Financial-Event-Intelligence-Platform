from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.responses import JSONResponse
from typing import Annotated
from pydantic import BaseModel, EmailStr, Field
import os
from dotenv import load_dotenv
from fastapi.security import OAuth2PasswordBearer
from passlib.context import CryptContext
from db_models import get_db_connection, create_user_table, insert_user, create_blacklist_table, insert_blacklist_token
from datetime import datetime, timedelta
from jose import JWTError, jwt

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM")
TOKEN_EXPIRE_MINUTES = int(os.getenv("TOKEN_EXPIRE_MINUTES", 30))

router = APIRouter(prefix="/auth", tags=["auth"])

bcrypt_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_bearer = OAuth2PasswordBearer(tokenUrl="auth/login")

def blacklist_token(token: str, expires_at: datetime):
    conn, cursor = get_db_connection()
    create_blacklist_table(cursor)
    try:
        insert_blacklist_token(cursor, token, expires_at)
        conn.commit()
    finally:
        cursor.close()
        conn.close()


def is_token_blacklisted(token: str) -> bool:
    conn, cursor = get_db_connection()
    try:
        cursor.execute("SELECT 1 FROM token_blacklist WHERE token = %s AND expires_at > NOW()", (token,))
        return cursor.fetchone() is not None
    finally:
        cursor.close()
        conn.close()

def hash_password(password: str) -> str:
    return bcrypt_context.hash(password)


def create_access_token(username: str, expires_delta: timedelta = None):
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=TOKEN_EXPIRE_MINUTES))
    encode = {"sub": username, "exp": expire}
    return jwt.encode(encode, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(token: Annotated[str, Depends(oauth2_bearer)]):
    if is_token_blacklisted(token):
        raise HTTPException(status_code=401, detail="Token has been revoked")

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return username
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


class CreateUserRequest(BaseModel):
    username: str = Field(...)
    password: str = Field(...)
    email: EmailStr = Field(...)

class LoginRequest(BaseModel):
    username: str = Field(...)
    password: str = Field(...)

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
        if not result or not bcrypt_context.verify(user.password, result[0]):
            raise HTTPException(status_code=401, detail="Invalid username or password")
        
        access_token = create_access_token(user.username)
        return {"access_token": access_token, "token_type": "bearer"}
    finally:
        cursor.close()
        conn.close()


@router.post("/signup")
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


@router.post("/logout")
async def logout(token: Annotated[str, Depends(oauth2_bearer)]):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        expires_at = datetime.fromtimestamp(payload.get("exp"))
        
        blacklist_token(token, expires_at)
        
        return JSONResponse(content={"message": "Successfully logged out"}, status_code=200)
    except Exception:
        raise HTTPException(status_code=400, detail="Logout failed")


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