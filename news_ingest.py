import finnhub
import db_models
from datetime import datetime, date, timedelta
import time
import os
from dotenv import load_dotenv

load_dotenv()

def get_current_news(ticker):
    api_key= os.getenv("FINNHUB_API_KEY")
    if not api_key:
        raise ValueError("Finnhub API key not found in environment variables.")
    client = finnhub.Client(api_key=api_key)
    try:
        news = client.company_news(ticker, date.today(), date.today() - timedelta(days=7))
    except Exception as e:
        print(f"Error fetching current news for {ticker}: {e}")
        return "API error"
    if not news:
        print(f"No current news found for {ticker}.")
        return []
    return news

def get_news(ticker, on_date):
    api_key= os.getenv("FINNHUB_API_KEY")
    if not api_key:
        raise ValueError("Finnhub API key not found in environment variables.")
    client = finnhub.Client(api_key=api_key)
    try:
        news = client.company_news(ticker, on_date, on_date)
    except Exception as e:
        print(f"Error fetching news for {ticker}: {e}")
        return "API error"
    if not news:
        print(f"No news found for {ticker} on {on_date}.")
        return []
    return news

def get_news_for_date_range(ticker, start_date, end_date):
    api_key= os.getenv("FINNHUB_API_KEY")
    if not api_key:
        raise ValueError("Finnhub API key not found in environment variables.")
    client = finnhub.Client(api_key=api_key)
    try:
        news = client.company_news(ticker, start_date, end_date)
    except Exception as e:
        print(f"Error fetching news for {ticker}: {e}")
        return "API error"
    if not news:
        print(f"No news found for {ticker} from {start_date} to {end_date}.")
        return []
    return news

def ingest(news):
    conn, cursor = db_models.get_db_connection()
    db_models.create_news_table(cursor)
    if news=="API error":
        print("Skipping ingestion due to API error.")
        return

    success_count = 0
    fail_count = 0

    for item in news:
        try:
            company_id     = item.get("related", "Unknown")      
            headline       = item.get("headline", "No headline")
            url            = item.get("url", "No URL")
            published_date_str = item.get("datetime", None)
            published_date = (
                datetime.fromtimestamp(published_date_str)
                if published_date_str else None
            )
            summary        = item.get("summary", "No summary")
            db_models.insert_news(cursor, company_id, headline, summary, url, published_date)
            success_count += 1

        except Exception as e:
            print(f"Failed to insert article '{item.get('headline', '')}': {e}")
            fail_count += 1
            continue

    conn.commit() 
    cursor.close()
    conn.close()

    print(f"Ingestion complete — {success_count} inserted, {fail_count} failed.")

def fetch_and_ingest(tickers, from_date, to_date):
    start = datetime.strptime(from_date, "%Y-%m-%d")
    end   = datetime.strptime(to_date, "%Y-%m-%d")

    for ticker in tickers:
        print(f"\nFetching news for {ticker}...")
        current_date = start

        while current_date <= end:
            date_str = current_date.strftime("%Y-%m-%d")

            news = get_news(ticker, date_str)

            if news and not isinstance(news, str):
                ingest(news)
                print(f"  [{date_str}] {len(news)} articles stored")
            else:
                print(f"[{date_str}] No articles")

            current_date += timedelta(days=1)
            time.sleep(1)

