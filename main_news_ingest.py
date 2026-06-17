from datetime import datetime, timedelta
import time

import news_ingest

tickers = [
    # Mega-cap platforms
    "AAPL", "MSFT", "GOOGL", "META", "AMZN",
    # Semiconductors
    "NVDA", "AMD", "INTC", "QCOM", "AVGO", "AMAT", "MU", "ARM",
    # Cloud & enterprise software
    "CRM", "ORCL", "NOW", "SNOW", "WDAY", "ADBE",
    # Cybersecurity
    "CRWD", "PANW", "FTNT", "ZS",
    # AI & data
    "PLTR", "AI", "SOUN", "PATH",
    # Hardware & networking
    "CSCO", "IBM", "HPQ", "DELL"
]

start = datetime.strptime("2024-07-01", "%Y-%m-%d")
end   = datetime.strptime("2025-06-30", "%Y-%m-%d")

for ticker in tickers:
    print(f"\nFetching news for {ticker}...")
    news = news_ingest.get_news_for_date_range(ticker, "2023-07-01", "2024-06-30")
    try:
        if news and not isinstance(news, str):
            news_ingest.ingest(news)
            print(f"  {len(news)} articles stored")
        else:
            print("  No articles")
    except Exception as e:
        print(f"Error occurred while fetching or ingesting news for {ticker}: {e}")