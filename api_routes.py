from fastapi import Depends, FastAPI, HTTPException
from langchain_protocol import Annotated
from ML_results import predict_new_article, prepare_features_for_new_article
import auth
from auth import get_current_user
from news_ingest import get_current_news

app= FastAPI()
app.include_router(auth.router)  
user_dependency= Annotated[str, Depends(get_current_user)]

@app.get("/features/{ticker}")
def get_features(ticker: str, user: user_dependency):
    if user is None:
        raise HTTPException(status_code=401, detail="Unauthorized")
    news= get_current_news(ticker)
    if not news:
        raise HTTPException(status_code=404, detail=f"No current news found for {ticker}.")
    return prepare_features_for_new_article(ticker, news[0]["headline"], news[0]["summary"]) 

@app.get("/news/{ticker}")
def get_news(ticker: str, user: user_dependency):
    if user is None:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return get_current_news(ticker)

@app.get("/predict/{token}")
def predict(token: str, user: user_dependency):
    if user is None:
        raise HTTPException(status_code=401, detail="Unauthorized")
    news= get_current_news(token)
    if not news:
        raise HTTPException(status_code=404, detail=f"No current news found for {token}.")
    return predict_new_article(token, news[0]["headline"], news[0]["summary"])
