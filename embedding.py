import db_models
from langchain_ollama import OllamaEmbeddings
from concurrent.futures import ThreadPoolExecutor, as_completed
import time

model = OllamaEmbeddings(model="nomic-embed-text")


def get_embedding(text: str, max_retries: int = 3) -> list | None:
    for attempt in range(max_retries):
        try:
            return model.embed_query(text)
        except Exception as e:
            print(f"    Attempt {attempt+1} failed: {e}")
            if attempt < max_retries - 1:
                time.sleep(5 * (attempt + 1))
    return None

def embed_batch(batch: list[dict], max_workers: int = 5) -> list[dict]:
    results = []

    def process_one(item):
        embedding = get_embedding(item["summary"])
        return {"news_id": item["news_id"], "embedding": embedding}

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(process_one, item): item for item in batch}

        for future in as_completed(futures):
            try:
                result = future.result()
                results.append(result)
            except Exception as e:
                item = futures[future]
                print(f"    Batch item {item['news_id']} failed entirely: {e}")
                results.append({"news_id": item["news_id"], "embedding": None})

    results.sort(key=lambda x: x["news_id"])
    return results

def insert_embeddings_batch(cursor, batch_results: list[dict]):
    """Insert all successfully embedded articles from a batch."""
    success = 0
    failed  = 0

    for item in batch_results:
        news_id   = item["news_id"]
        embedding = item["embedding"]

        if embedding is None:
            print(f"    Skipping news_id {news_id} — embedding failed")
            failed += 1
            continue

        try:
            db_models.insert_embedding(cursor, news_id, embedding)
            success += 1
        except Exception as e:
            print(f"    DB insert failed for news_id {news_id}: {e}")
            failed += 1

    return success, failed



if __name__ == "__main__":
    BATCH_SIZE  = 10   
    MAX_WORKERS = 8    

    conn, cursor = db_models.get_db_connection()
    db_models.create_embeddings_table(cursor)

    # Skip already embedded rows
    cursor.execute("""
        SELECT id, summary FROM news
        WHERE id NOT IN (SELECT news_id FROM news_embeddings)
        AND summary IS NOT NULL
        ORDER BY id ASC
    """)
    all_rows = cursor.fetchall()
    total    = len(all_rows)
    print(f"Articles to embed: {total}")

    total_success = 0
    total_failed  = 0

    for batch_start in range(0, total, BATCH_SIZE):
        batch_rows = all_rows[batch_start : batch_start + BATCH_SIZE]

        batch = [
            {"news_id": row[0], "summary": row[1]}
            for row in batch_rows
        ]

        batch_num     = (batch_start // BATCH_SIZE) + 1
        total_batches = (total + BATCH_SIZE - 1) // BATCH_SIZE
        print(f"\nBatch {batch_num}/{total_batches} "
              f"(articles {batch_start+1}–{min(batch_start+BATCH_SIZE, total)}/{total})")

        batch_results = embed_batch(batch, max_workers=MAX_WORKERS)

        success, failed = insert_embeddings_batch(cursor, batch_results)
        total_success  += success
        total_failed   += failed

        conn.commit()
        print(f"  Batch done — {success} inserted, {failed} failed"
              f" | Running total: {total_success} inserted, {total_failed} failed")

    cursor.close()
    conn.close()
    print(f"\nAll done — {total_success} embedded, {total_failed} failed out of {total} articles")