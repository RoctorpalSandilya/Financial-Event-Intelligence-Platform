import db_models
import retrieval
import pandas as pd


def get_RAG_results(query_text: str, top_k: int = 20) -> dict:
    similar_news = retrieval.retrieve_similar_news(query_text, top_k=top_k)

    if not similar_news:
        return {}

    conn, cursor = db_models.get_db_connection()

    all_rows = []
    for item in similar_news:
        cursor.execute("""
            SELECT
                -- RAG meta
                %s AS news_id,
                %s AS similarity,

                -- FinBERT features
                s.pos_prob, s.neg_prob, s.neu_prob, s.sentiment_score,

                -- Event features
                e.earnings_beat, e.earnings_miss, e.guidance_raise, e.guidance_cut,
                e.acquisition, e.merger, e.buyback, e.product_launch, e.partnership,
                e.lawsuit, e.investigation, e.management_change,
                e.dividend_increase, e.dividend_cut,

                -- Pre-market features
                m.return_1d_before, m.return_5d_before, m.return_20d_before,
                m.volatility_5d, m.volatility_20d, m.volatility_60d, m.ATR,
                m.volume_today, m.avg_volume_20d, m.relative_volume,
                m.SMA10, m.SMA20, m.SMA50, m.EMA20,
                m.RSI, m.MACD, m.MACD_signal, m.MACD_hist,
                m.SP500_return, m.NASDAQ_return, m.VIX_level,
                m.market_cap, m.PE_ratio, m.debt_to_equity,
                m.current_ratio, m.revenue_growth,

                -- Post-market features
                m2.return_1d, m2.return_5d, m2.return_20d,
                m2.abnormal_return_1d, m2.abnormal_return_5d, m2.abnormal_return_20d,
                m2.outperform_market_1d, m2.outperform_market_5d, m2.outperform_market_20d,
                m2.abnormal_return_gt_2pct_1d, m2.abnormal_return_gt_2pct_5d, m2.abnormal_return_gt_2pct_20d

            FROM sentiment  s
            JOIN event      e  ON e.news_id = s.news_id
            JOIN market     m  ON m.news_id = s.news_id
            JOIN market2    m2 ON m2.news_id = s.news_id
            WHERE s.news_id = %s
        """, (item["news_id"], item["similarity"], item["news_id"]))

        row = cursor.fetchone()
        if row:
            columns = [desc[0] for desc in cursor.description]
            all_rows.append(dict(zip(columns, row)))

    cursor.close()
    conn.close()

    if not all_rows:
        return {}

    df = pd.DataFrame(all_rows)

    # ── Columns by type ───────────────────────────────────────
    meta_cols = ["news_id", "similarity"]

    finbert_cols = ["pos_prob", "neg_prob", "neu_prob", "sentiment_score"]

    event_cols = [
        "earnings_beat", "earnings_miss", "guidance_raise", "guidance_cut",
        "acquisition", "merger", "buyback", "product_launch", "partnership",
        "lawsuit", "investigation", "management_change",
        "dividend_increase", "dividend_cut"
    ]

    pre_market_cols = [
        "return_1d_before", "return_5d_before", "return_20d_before",
        "volatility_5d", "volatility_20d", "volatility_60d", "ATR",
        "volume_today", "avg_volume_20d", "relative_volume",
        "SMA10", "SMA20", "SMA50", "EMA20",
        "RSI", "MACD", "MACD_signal", "MACD_hist",
        "SP500_return", "NASDAQ_return", "VIX_level",
        "market_cap", "PE_ratio", "debt_to_equity",
        "current_ratio", "revenue_growth"
    ]

    post_market_cols = [
        "return_1d", "return_5d", "return_20d",
        "abnormal_return_1d", "abnormal_return_5d", "abnormal_return_20d",
        "outperform_market_1d", "outperform_market_5d", "outperform_market_20d",
        "abnormal_return_gt_2pct_1d", "abnormal_return_gt_2pct_5d", "abnormal_return_gt_2pct_20d"
    ]

    # ── Aggregate — avg for continuous, majority vote for booleans ────
    def aggregate(cols, prefix):
        result = {}
        for col in cols:
            if col not in df.columns:
                continue
            series = pd.to_numeric(df[col], errors="coerce")
            result[f"{prefix}avg_{col}"]    = round(series.mean(), 6)
            result[f"{prefix}median_{col}"] = round(series.median(), 6)
            result[f"{prefix}std_{col}"]    = round(series.std(), 6)
        return result

    def aggregate_events(cols, prefix):
        """For boolean event cols — return rate (0-1) of how often event appeared."""
        result = {}
        for col in cols:
            if col not in df.columns:
                continue
            series = pd.to_numeric(df[col], errors="coerce").fillna(0)
            result[f"{prefix}{col}_rate"] = round(series.mean(), 4)
        return result

    # ── Build final result dict ───────────────────────────────
    result = {
        # RAG meta
        "top_similarity"        : round(df["similarity"].max(), 4),
        "avg_similarity_top_k"  : round(df["similarity"].mean(), 4),
        "similar_events_count"  : len(df),

        # Aggregated features (prefixed so they don't clash with current article cols)
        **aggregate(finbert_cols,      prefix="hist_finbert_"),
        **aggregate_events(event_cols, prefix="hist_event_"),
        **aggregate(pre_market_cols,   prefix="hist_pre_"),
        **aggregate(post_market_cols,  prefix="hist_post_"),
    }

    return result


# ── Usage ─────────────────────────────────────────────────────
if __name__ == "__main__":
    result = get_RAG_results("Apple launches new iPhone with AI features", top_k=20)

    print("\nRAG Meta:")
    print(f"  top_similarity       : {result['top_similarity']}")
    print(f"  avg_similarity_top_k : {result['avg_similarity_top_k']}")
    print(f"  similar_events_count : {result['similar_events_count']}")

    print("\nHistorical FinBERT (avg across similar articles):")
    for k, v in result.items():
        if k.startswith("hist_finbert"):
            print(f"  {k}: {v}")

    print("\nHistorical Event rates (how often each event appeared in similar articles):")
    for k, v in result.items():
        if k.startswith("hist_event"):
            print(f"  {k}: {v}")

    print("\nHistorical Post-Market outcomes (avg across similar articles):")
    for k, v in result.items():
        if k.startswith("hist_post"):
            print(f"  {k}: {v}")