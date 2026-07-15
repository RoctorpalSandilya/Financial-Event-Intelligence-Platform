from fastapi import FastAPI 
from ML_model import predict_new_article

app= FastAPI()

@app.post("/login")


@app.post("/signup")


@app.post("/logout")


@app.get("/predict/{token}")
def predict(token: str):
    return predict_new_article(token)

@app.post("/change_password")
def change_password(token: str, new_password: str):
    return {"message": "Password changed successfully."}