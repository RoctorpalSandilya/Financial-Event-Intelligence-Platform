import db_models
import retrieval
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed
import time


# ══════════════════════════════════════════════════════════════
# CORE RAG FUNCTION (unchanged from your existing code)
# ══════════════════════════════════════════════════════════════

def get_RAG_results(query_text: str, top_k: int = 20) -> dict:
    similar_news = retrieval.retrieve_similar_news(query_text, top_k=top_k)

    if not similar_news:
        return {}

    conn, cursor = db_models.get_db_connection()

    all_rows = []
    for item in similar_news:
        cursor.execute("""
            SELECT
                %s AS news_id,
                %s AS similarity,
                s.pos_prob, s.neg_prob, s.neu_prob, s.sentiment_score,
                e.earnings_beat, e.earnings_miss, e.guidance_raise, e.guidance_cut,
                e.acquisition, e.merger, e.buyback, e.product_launch, e.partnership,
                e.lawsuit, e.investigation, e.management_change,
                e.dividend_increase, e.dividend_cut,
                m.return_1d_before, m.return_5d_before, m.return_20d_before,
                m.volatility_5d, m.volatility_20d, m.volatility_60d, m.ATR,
                m.volume_today, m.avg_volume_20d, m.relative_volume,
                m.SMA10, m.SMA20, m.SMA50, m.EMA20,
                m.RSI, m.MACD, m.MACD_signal, m.MACD_hist,
                m.SP500_return, m.NASDAQ_return, m.VIX_level,
                m.market_cap, m.PE_ratio, m.debt_to_equity,
                m.current_ratio, m.revenue_growth,
                m2.return_1d, m2.return_5d, m2.return_20d,
                m2.abnormal_return_1d, m2.abnormal_return_5d, m2.abnormal_return_20d,
                m2.outperform_market_1d, m2.outperform_market_5d, m2.outperform_market_20d,
                m2.abnormal_return_gt_2pct_1d, m2.abnormal_return_gt_2pct_5d,
                m2.abnormal_return_gt_2pct_20d
            FROM sentiment  s
            JOIN event      e  ON e.news_id  = s.news_id
            JOIN market     m  ON m.news_id  = s.news_id
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

    finbert_cols = ["pos_prob", "neg_prob", "neu_prob", "sentiment_score"]
    event_cols   = [
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
        "abnormal_return_gt_2pct_1d", "abnormal_return_gt_2pct_5d",
        "abnormal_return_gt_2pct_20d"
    ]

    def aggregate(cols, prefix):
        result = {}
        for col in cols:
            if col not in df.columns:
                continue
            series = pd.to_numeric(df[col], errors="coerce")
            result[f"{prefix}avg_{col}"]    = round(series.mean(),   6)
            result[f"{prefix}median_{col}"] = round(series.median(), 6)
            result[f"{prefix}std_{col}"]    = round(series.std(),    6)
        return result

    def aggregate_events(cols, prefix):
        result = {}
        for col in cols:
            if col not in df.columns:
                continue
            series = pd.to_numeric(df[col], errors="coerce").fillna(0)
            result[f"{prefix}{col}_rate"] = round(series.mean(), 4)
        return result

    return {
        "top_similarity"      : round(df["similarity"].max(),  4),
        "avg_similarity_top_k": round(df["similarity"].mean(), 4),
        "similar_events_count": len(df),
        **aggregate(finbert_cols,      prefix="hist_finbert_"),
        **aggregate_events(event_cols, prefix="hist_event_"),
        **aggregate(pre_market_cols,   prefix="hist_pre_"),
        **aggregate(post_market_cols,  prefix="hist_post_"),
    }


# ══════════════════════════════════════════════════════════════
# TABLE CREATION — dynamic so it matches exactly what
# get_RAG_results() returns without hardcoding column names
# ══════════════════════════════════════════════════════════════

def create_rag_features_table(cursor):
    """
    Create rag_features table dynamically based on what
    get_RAG_results() actually returns for a sample article.
    This way the columns always match exactly.
    """
    # Get a sample result to discover all column names
    sample = get_RAG_results("Apple earnings beat expectations", top_k=5)

    if not sample:
        raise RuntimeError("Could not generate sample RAG result to infer schema — "
                           "make sure news_embeddings, sentiment, event, market, market2 "
                           "tables all have data.")

    # Build column definitions — all are FLOAT except the meta count col
    col_defs = []
    for col_name, val in sample.items():
        if col_name == "similar_events_count":
            col_defs.append(f"{col_name} INTEGER")
        else:
            col_defs.append(f"{col_name} FLOAT")

    col_defs_sql = ",\n            ".join(col_defs)

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS rag_features (
            id      BIGSERIAL PRIMARY KEY,
            news_id BIGINT NOT NULL REFERENCES news(id) ON DELETE CASCADE,
            {col_defs_sql}
        );
    """)

    # Unique index to prevent duplicates and speed up lookups
    cursor.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS rag_features_news_id_idx
        ON rag_features (news_id);
    """)

    print(f"rag_features table ready with {len(col_defs)} feature columns")
    return list(sample.keys())   # return column names for use in insert


# ══════════════════════════════════════════════════════════════
# BATCH PROCESSING
# ══════════════════════════════════════════════════════════════

def process_one_article(item: dict, top_k: int = 20) -> dict:
    """Process a single article — called in parallel."""
    news_id    = item["news_id"]
    query_text = f"{item['headline']}. {item['summary']}"

    rag_features = get_RAG_results(query_text, top_k=top_k)
    return {"news_id": news_id, "rag_features": rag_features}


def compute_rag_batch(batch: list[dict], max_workers: int = 3, top_k: int = 20) -> list[dict]:
    """
    Compute RAG features for a batch of articles in parallel.

    Args:
        batch:       list of dicts with keys: news_id, headline, summary
        max_workers: parallel threads — keep at 3 since each RAG call
                     does multiple pgvector searches (DB-bound, not GPU-bound)
        top_k:       number of similar articles to retrieve per query

    Returns:
        list of dicts with keys: news_id, rag_features
    """
    results = []

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(process_one_article, item, top_k): item
            for item in batch
        }

        for future in as_completed(futures):
            item = futures[future]
            try:
                result = future.result()
                results.append(result)
            except Exception as e:
                print(f"    Batch item {item['news_id']} failed: {e}")
                results.append({"news_id": item["news_id"], "rag_features": None})

    results.sort(key=lambda x: x["news_id"])
    return results


def insert_rag_features_batch(cursor, batch_results: list[dict], feature_cols: list[str]):
    """Bulk insert RAG features for a batch into rag_features table."""
    success = 0
    failed  = 0

    for item in batch_results:
        news_id      = item["news_id"]
        rag_features = item["rag_features"]

        if not rag_features:
            print(f"    Skipping news_id {news_id} — RAG returned empty")
            failed += 1
            continue

        try:
            cols      = ", ".join(feature_cols)
            vals      = ", ".join(["%s"] * len(feature_cols))
            values    = [rag_features.get(col) for col in feature_cols]

            cursor.execute(f"""
                INSERT INTO rag_features (news_id, {cols})
                VALUES (%s, {vals})
                ON CONFLICT (news_id) DO NOTHING
            """, (news_id, *values))

            success += 1

        except Exception as e:
            print(f"    DB insert failed for news_id {news_id}: {e}")
            failed += 1

    return success, failed


# ══════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    BATCH_SIZE  = 10   # articles per batch
    MAX_WORKERS = 3    # RAG is DB-bound (pgvector searches) not GPU-bound
    TOP_K       = 20   # similar articles to retrieve per query

    conn, cursor = db_models.get_db_connection()

    # Create table and get column names
    print("Setting up rag_features table...")
    feature_cols = create_rag_features_table(cursor)
    conn.commit()

    # Fetch only unprocessed articles that have all required features
    cursor.execute("""
        SELECT n.id, n.headline, n.summary
        FROM news n
        JOIN sentiment  s  ON s.news_id  = n.id
        JOIN event      e  ON e.news_id  = n.id
        JOIN market     m  ON m.news_id  = n.id
        JOIN market2    m2 ON m2.news_id = n.id
        WHERE n.id NOT IN (SELECT news_id FROM rag_features)
        AND n.summary IS NOT NULL
        ORDER BY n.id ASC
    """)

    all_rows = cursor.fetchall()
    total    = len(all_rows)
    print(f"Articles to process: {total}")

    total_success = 0
    total_failed  = 0

    for batch_start in range(0, total, BATCH_SIZE):
        batch_rows = all_rows[batch_start : batch_start + BATCH_SIZE]

        batch = [
            {
                "news_id" : row[0],
                "headline": row[1],
                "summary" : row[2]
            }
            for row in batch_rows
        ]

        batch_num     = (batch_start // BATCH_SIZE) + 1
        total_batches = (total + BATCH_SIZE - 1) // BATCH_SIZE
        print(f"\nBatch {batch_num}/{total_batches} "
              f"(articles {batch_start+1}–{min(batch_start+BATCH_SIZE, total)}/{total})")

        # Compute RAG features in parallel
        batch_results = compute_rag_batch(batch, max_workers=MAX_WORKERS, top_k=TOP_K)

        # Bulk insert into DB
        success, failed = insert_rag_features_batch(cursor, batch_results, feature_cols)
        total_success  += success
        total_failed   += failed

        conn.commit()
        print(f"  Batch done — {success} inserted, {failed} failed"
              f" | Running total: {total_success} inserted, {total_failed} failed")

    cursor.close()
    conn.close()
    print(f"\nAll done — {total_success} inserted, {total_failed} failed out of {total} articles")