# predict_example.py
import numpy as np
from datetime import datetime, timedelta
import yfinance as yf

import db_models
import embedding
from RAG       import get_RAG_results
from FinBERT_service   import get_sentiment
from event_extraction_service import extract_events_from_news
from market_data_service import get_all_features
from ML_model   import load_models, predict_new_article


def prepare_features_for_new_article(ticker: str, headline: str, summary: str) -> dict:
    """
    Given a new article, compute ALL current features
    exactly as done during training.
    """
    features = {}

    # ── 1. FinBERT sentiment ───────────────────────────────────
    print("  Running FinBERT...")
    text      = f"{headline}. {summary}"
    sentiment = get_sentiment(text)

    features["positive_prob"]   = sentiment["pos_prob"]
    features["negative_prob"]   = sentiment["neg_prob"]
    features["neutral_prob"]    = sentiment["neu_prob"]
    features["sentiment_score"] = sentiment["confidence"]

    # Aggregated sentiment context (from DB — past articles for this ticker)
    conn, cursor = db_models.get_db_connection()
    cursor.execute("""
        SELECT s.pos_prob - s.neg_prob AS signed_score
        FROM news n
        JOIN sentiment s ON s.news_id = n.id
        WHERE n.company_id = %s
        ORDER BY n.published_date DESC
        LIMIT 90
    """, (ticker,))
    past_sentiments = [row[0] for row in cursor.fetchall() if row[0] is not None]

    features["sentiment_avg_7d"]  = np.mean(past_sentiments[:7])  if len(past_sentiments) >= 7  else None
    features["sentiment_avg_30d"] = np.mean(past_sentiments[:30]) if len(past_sentiments) >= 30 else None
    features["sentiment_avg_90d"] = np.mean(past_sentiments[:90]) if len(past_sentiments) >= 90 else None
    features["sentiment_std_7d"]  = np.std(past_sentiments[:7])   if len(past_sentiments) >= 7  else None
    features["sentiment_std_30d"] = np.std(past_sentiments[:30])  if len(past_sentiments) >= 30 else None

    cursor.close()
    conn.close()

    # ── 2. Event extraction ────────────────────────────────────
    print("  Extracting events...")
    events = extract_events_from_news(summary)

    if events:
        features["earnings_beat"]     = int(events.earnings_beat)
        features["earnings_miss"]     = int(events.earnings_miss)
        features["guidance_raise"]    = int(events.guidance_raise)
        features["guidance_cut"]      = int(events.guidance_cut)
        features["acquisition"]       = int(events.acquisition)
        features["merger"]            = int(events.merger)
        features["buyback"]           = int(events.buyback)
        features["product_launch"]    = int(events.product_launch)
        features["partnership"]       = int(events.partnership)
        features["lawsuit"]           = int(events.lawsuit)
        features["investigation"]     = int(events.investigation)
        features["management_change"] = int(events.management_change)
        features["dividend_increase"] = int(events.dividend_increase)
        features["dividend_cut"]      = int(events.dividend_cut)

    # ── 3. Market features ─────────────────────────────────────
    print("  Fetching market features...")
    today      = datetime.today().strftime("%Y-%m-%d")
    yesterday  = (datetime.today() - timedelta(days=1)).strftime("%Y-%m-%d")
    mkt        = get_all_features(ticker, yesterday)   # pre-news market state

    for col in [
        "return_1d_before", "return_5d_before", "return_20d_before",
        "volatility_5d", "volatility_20d", "volatility_60d", "ATR",
        "volume_today", "avg_volume_20d", "relative_volume",
        "SMA10", "SMA20", "SMA50", "EMA20",
        "RSI", "MACD", "MACD_signal", "MACD_hist",
        "SP500_return", "NASDAQ_return", "VIX_level",
        "market_cap", "PE_ratio", "debt_to_equity",
        "current_ratio", "revenue_growth"
    ]:
        features[col] = mkt.get(col)

    return features


def predict(ticker: str, headline: str, summary: str):
    """
    Full prediction pipeline for a new article.
    Prints a clean readable output.
    """
    print(f"\n{'='*60}")
    print(f"  PREDICTION: {ticker}")
    print(f"  {headline}")
    print(f"{'='*60}")

    # ── Step 1: Compute current article features ───────────────
    print("\n[1/3] Computing current article features...")
    current_features = prepare_features_for_new_article(ticker, headline, summary)

    # ── Step 2: Get RAG features ───────────────────────────────
    print("\n[2/3] Fetching RAG features (similar historical articles)...")
    rag_features = get_RAG_results(f"{headline}. {summary}", top_k=20)

    print(f"  Top similarity    : {rag_features.get('top_similarity', 'N/A')}")
    print(f"  Avg similarity    : {rag_features.get('avg_similarity_top_k', 'N/A')}")
    print(f"  Similar events    : {rag_features.get('similar_events_count', 'N/A')}")
    print(f"  Hist avg return 1d: {rag_features.get('hist_post_avg_return_1d', 'N/A')}")
    print(f"  Hist avg return 5d: {rag_features.get('hist_post_avg_return_5d', 'N/A')}")

    # ── Step 3: Load models and predict ───────────────────────
    print("\n[3/3] Running XGBoost predictions...")
    models, feature_names = load_models()

    predictions = predict_new_article(
        current_features = current_features,
        headline         = headline,
        summary          = summary,
        models           = models,
        feature_names    = feature_names
    )

    # ── Print results ──────────────────────────────────────────
    print(f"\n{'='*60}")
    print(f"  RESULTS FOR {ticker}")
    print(f"{'='*60}")

    print("\n  Return Predictions:")
    print(f"    1-day  return : {predictions.get('return_1d_after', 0):+.2%}")
    print(f"    5-day  return : {predictions.get('return_5d_after', 0):+.2%}")
    print(f"    20-day return : {predictions.get('return_20d_after', 0):+.2%}")

    print("\n  Abnormal Return Predictions (vs market):")
    print(f"    1-day  abnormal : {predictions.get('abnormal_return_1d', 0):+.2%}")
    print(f"    5-day  abnormal : {predictions.get('abnormal_return_5d', 0):+.2%}")
    print(f"    20-day abnormal : {predictions.get('abnormal_return_20d', 0):+.2%}")

    print("\n  Classification:")
    print(f"    Outperform market 1d  : {'YES' if predictions.get('outperform_market_1d') else 'NO'}"
          f"  (prob: {predictions.get('outperform_market_1d_prob', 0):.1%})")
    print(f"    Outperform market 5d  : {'YES' if predictions.get('outperform_market_5d') else 'NO'}"
          f"  (prob: {predictions.get('outperform_market_5d_prob', 0):.1%})")
    print(f"    Abnormal return >2%   : {'YES' if predictions.get('abnormal_return_gt_2pct') else 'NO'}"
          f"  (prob: {predictions.get('abnormal_return_gt_2pct_prob', 0):.1%})")

    print(f"\n{'='*60}")
    return predictions


# ── Run it ────────────────────────────────────────────────────
if __name__ == "__main__":

    # Example 1 — product launch
    predict(
        ticker   = "AAPL",
        headline = "Apple unveils iPhone 17 with major AI upgrades and new design",
        summary  = "Apple launched its latest iPhone lineup featuring deep AI integration "
                   "powered by Apple Intelligence. The new models start at $999 and include "
                   "a redesigned form factor. CEO Tim Cook called it the most important "
                   "iPhone release in the company's history."
    )

    # Example 2 — negative news
    predict(
        ticker   = "INTC",
        headline = "Intel misses Q2 earnings estimates, cuts full-year guidance",
        summary  = "Intel reported Q2 earnings of $0.02 per share, far below analyst "
                   "estimates of $0.10. The company also cut its full-year revenue guidance "
                   "citing weak data center demand and increased competition from AMD. "
                   "The CEO warned of a challenging second half."
    )

    # Example 3 — mixed signals
    predict(
        ticker   = "MSFT",
        headline = "Microsoft announces $10B share buyback amid antitrust investigation",
        summary  = "Microsoft's board approved a $10 billion stock repurchase program "
                   "while the company faces an ongoing EU antitrust investigation into "
                   "its bundling of Teams with Office 365."
    )