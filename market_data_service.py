import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import db_models

def safe(val):
        """Convert NaN/None to None for clean DB storage."""
        if val is None:
            return None
        if isinstance(val, float) and np.isnan(val):
            return None
        return round(float(val), 6)

def pct_return(df, n_days):
        """Return % change n_days before the last row."""
        if len(df) < n_days + 1:
            return None
        return (df.iloc[-1] - df.iloc[-(n_days+1)]) / df.iloc[-(n_days+1)]

def get_market_return(market_ticker, start, end, n_days=1):
        mdf = yf.Ticker(market_ticker).history(start=start, end=end)
        if len(mdf) < n_days + 1:
            return None
        return (mdf["Close"].iloc[-1] - mdf["Close"].iloc[-(n_days+1)]) / mdf["Close"].iloc[-(n_days+1)]

def get_post_market_return(ticker, news_date):
    target_date = datetime.strptime(news_date, "%Y-%m-%d")

    # Fetch FROM news date + 30 days forward
    start = news_date
    end   = (target_date + timedelta(days=30)).strftime("%Y-%m-%d")

    stock = yf.Ticker(ticker)
    df    = stock.history(start=start, end=end, interval="1d")

    if df.empty or len(df) < 2:
        print(f"No post-news data for {ticker} after {news_date}")
        return {}

    close    = df["Close"]
    features = {"ticker": ticker, "date": news_date}

    def forward_return(n_days):
        """Return % change from first row to n_days later."""
        if len(close) < n_days + 1:
            return None
        return (close.iloc[n_days] - close.iloc[0]) / close.iloc[0]

    # Raw forward returns
    features["return_1d_after"]  = safe(forward_return(1))
    features["return_5d_after"]  = safe(forward_return(5))
    features["return_20d_after"] = safe(forward_return(20))

    # Market returns over same forward windows
    def market_forward_return(market_ticker, n_days):
        mdf = yf.Ticker(market_ticker).history(start=start, end=end)
        if len(mdf) < n_days + 1:
            return None
        return (mdf["Close"].iloc[n_days] - mdf["Close"].iloc[0]) / mdf["Close"].iloc[0]

    # Abnormal returns (stock return minus market return)
    features["abnormal_return_1d"]  = safe(features["return_1d_after"]  - market_forward_return("^IXIC", 1)  if features["return_1d_after"]  else None)
    features["abnormal_return_5d"]  = safe(features["return_5d_after"]  - market_forward_return("^IXIC", 5)  if features["return_5d_after"]  else None)
    features["abnormal_return_20d"] = safe(features["return_20d_after"] - market_forward_return("^IXIC", 20) if features["return_20d_after"] else None)

    # Classification labels
    features["outperform_1d"]  = int(features["abnormal_return_1d"]  > 0) if features["abnormal_return_1d"]  is not None else None
    features["outperform_5d"]  = int(features["abnormal_return_5d"]  > 0) if features["abnormal_return_5d"]  is not None else None
    features["outperform_20d"] = int(features["abnormal_return_20d"] > 0) if features["abnormal_return_20d"] is not None else None
    features["abnormal_gt_2pct_1d"]  = int(features["abnormal_return_1d"]  > 0.02) if features["abnormal_return_1d"]  is not None else None
    features["abnormal_gt_2pct_5d"]  = int(features["abnormal_return_5d"]  > 0.02) if features["abnormal_return_5d"]  is not None else None
    features["abnormal_gt_2pct_20d"] = int(features["abnormal_return_20d"] > 0.02) if features["abnormal_return_20d"] is not None else None

    return features

def get_all_features(ticker: str, date: str) -> dict:
    target_date = datetime.strptime(date, "%Y-%m-%d")

    start = (target_date - timedelta(days=120)).strftime("%Y-%m-%d")
    end   = (target_date + timedelta(days=1)).strftime("%Y-%m-%d")

    stock = yf.Ticker(ticker)
    df    = stock.history(start=start, end=end, interval="1d")

    if df.empty:
        print(f"No data for {ticker} on {date}")
        return {}

    features = {"ticker": ticker, "date": date}

    close = df["Close"]

    features["return_1d_before"]  = safe(pct_return(close, 1))
    features["return_5d_before"]  = safe(pct_return(close, 5))
    features["return_20d_before"] = safe(pct_return(close, 20))

    daily_returns = close.pct_change()

    features["volatility_5d"]  = safe(daily_returns.tail(5).std()  * np.sqrt(252))
    features["volatility_20d"] = safe(daily_returns.tail(20).std() * np.sqrt(252))
    features["volatility_60d"] = safe(daily_returns.tail(60).std() * np.sqrt(252))

    high  = df["High"]
    low   = df["Low"]
    prev_close = close.shift(1)

    tr = pd.concat([
        high - low,                        # high - low
        (high - prev_close).abs(),         # high - prev close
        (low  - prev_close).abs()          # low  - prev close
    ], axis=1).max(axis=1)

    features["ATR"] = safe(tr.tail(14).mean())

    volume = df["Volume"]

    features["volume_today"]    = safe(volume.iloc[-1])
    features["avg_volume_20d"]  = safe(volume.tail(20).mean())
    features["relative_volume"] = safe(
        volume.iloc[-1] / volume.tail(20).mean()
        if volume.tail(20).mean() != 0 else None
    )

    features["SMA10"] = safe(close.tail(10).mean())
    features["SMA20"] = safe(close.tail(20).mean())
    features["SMA50"] = safe(close.tail(50).mean())

    features["EMA20"] = safe(close.ewm(span=20, adjust=False).mean().iloc[-1])

    delta     = close.diff()
    gain      = delta.clip(lower=0)
    loss      = (-delta).clip(lower=0)
    avg_gain  = gain.tail(14).mean()
    avg_loss  = loss.tail(14).mean()
    rs        = avg_gain / avg_loss if avg_loss != 0 else 0
    rsi       = 100 - (100 / (1 + rs))
    features["RSI"] = safe(rsi)

    ema12           = close.ewm(span=12, adjust=False).mean()
    ema26           = close.ewm(span=26, adjust=False).mean()
    macd_line       = ema12 - ema26
    signal_line     = macd_line.ewm(span=9, adjust=False).mean()
    features["MACD"]        = safe(macd_line.iloc[-1])
    features["MACD_signal"] = safe(signal_line.iloc[-1])
    features["MACD_hist"]   = safe((macd_line - signal_line).iloc[-1])

    features["SP500_return"]   = safe(get_market_return("^GSPC",  start, end))
    features["NASDAQ_return"]  = safe(get_market_return("^IXIC",  start, end))

    vix_df = yf.Ticker("^VIX").history(start=start, end=end)
    features["VIX_level"] = safe(vix_df["Close"].iloc[-1] if not vix_df.empty else None)

    info = stock.info   

    features["market_cap"]      = safe(info.get("marketCap"))
    features["PE_ratio"]        = safe(info.get("trailingPE"))
    features["debt_to_equity"]  = safe(info.get("debtToEquity"))
    features["current_ratio"]   = safe(info.get("currentRatio"))
    features["revenue_growth"]  = safe(info.get("revenueGrowth"))

    return features

if __name__ == "__main__":
    conn, cursor = db_models.get_db_connection()
    db_models.create_market_table(cursor)
    db_models.create_market_table2(cursor)
    cursor.execute("SELECT COUNT(*) FROM news")
    total_rows = cursor.fetchone()[0]
    for row in range(19500, total_rows+1):
        cursor.execute("SELECT Company_id, Published_date FROM news WHERE id= %s", (row,))
        result = cursor.fetchone()
        if result is None:
            print(f"No news found for row {row}. Skipping.")
            continue
        ticker, published_date = result
        date_before = (published_date - timedelta(days=1)).strftime("%Y-%m-%d")  # pre-news features
        date_after  = (published_date + timedelta(days=1)).strftime("%Y-%m-%d")  # post-news returns

        features_before = get_all_features(ticker, date_before)
        features_after  = get_post_market_return(ticker, date_after)
        db_models.insert_market(cursor, row, ticker, date_before, features_before)
        db_models.insert_market2(cursor, row, ticker, date_after, features_after)
        if row % 100 == 0:
            conn.commit()
            print(f"Processed {row} out of {total_rows} rows.")