from fastapi import FastAPI 
from ML_results import predict_new_article, prepare_features_for_new_article
from news_ingest import get_current_news

app= FastAPI()

@app.post("/login")


@app.post("/signup")


@app.post("/logout")


@app.get("/features/{ticker}")
def get_features(ticker: str):
    news= get_current_news(ticker)
    if not news:
        return {"message": f"No current news found for {ticker}."}
    return prepare_features_for_new_article(ticker, news[0]["headline"], news[0]["summary"]) 

@app.get("/news/{ticker}")
def get_news(ticker: str):
    return get_current_news(ticker)

@app.get("/predict/{token}")
def predict(token: str):
    news= get_current_news(token)
    if not news:
        return {"message": f"No current news found for {token}."}
    return predict_new_article(token, news[0]["headline"], news[0]["summary"])

@app.post("/change_password")
def change_password(token: str, new_password: str):
    return {"message": "Password changed successfully."}