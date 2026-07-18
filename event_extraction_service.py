from langchain_ollama import ChatOllama
from pydantic import BaseModel, Field
from langchain_core.prompts import PromptTemplate
from concurrent.futures import ThreadPoolExecutor, as_completed
import db_models
import time

llm = ChatOllama(
    model       = "qwen2.5:3b",
    temperature = 0.1
)

event_extraction_prompt = PromptTemplate.from_template("""
You are a financial news analyst specializing in corporate event detection.

Your task is to read a news article and determine which of the following corporate events are mentioned. Multiple events can be true at the same time — for example, an article can report BOTH a lawsuit AND an investigation together.

Read the headline and summary carefully, then classify each event type as true or false based on what is explicitly stated or strongly implied in the text. Do not assume an event happened just because a related topic is mentioned — only mark it true if the article clearly indicates that event occurred.

Event types to detect:
- earnings_beat: Company reported earnings/revenue ABOVE analyst expectations
- earnings_miss: Company reported earnings/revenue BELOW analyst expectations
- guidance_raise: Company raised its forward guidance or outlook
- guidance_cut: Company lowered its forward guidance or outlook
- acquisition: Company is acquiring another company
- merger: Two or more companies are merging
- buyback: Company announced a stock buyback or repurchase program
- product_launch: Company launched or announced a new product or service
- partnership: Company announced a partnership, collaboration, or joint venture
- lawsuit: Company is facing or filing a lawsuit
- investigation: Company is under regulatory, government, or internal investigation
- management_change: There is a change in executive leadership (CEO, CFO, etc.)
- dividend_increase: Company increased its dividend payout
- dividend_cut: Company cut, suspended, or eliminated its dividend

Summary: {summary}

Carefully analyze the article above and return your classification.
""")

class Events(BaseModel):
    earnings_beat:      bool = Field(description="True if the article reports the company beat earnings expectations")
    earnings_miss:      bool = Field(description="True if the article reports the company missed earnings expectations")
    guidance_raise:     bool = Field(description="True if the company raised its forward guidance/outlook")
    guidance_cut:       bool = Field(description="True if the company lowered its forward guidance/outlook")
    acquisition:        bool = Field(description="True if the company is acquiring another company")
    merger:             bool = Field(description="True if the article reports a merger between companies")
    buyback:            bool = Field(description="True if the company announced a stock buyback/repurchase program")
    product_launch:     bool = Field(description="True if the company launched or announced a new product")
    partnership:        bool = Field(description="True if the company announced a partnership or collaboration")
    lawsuit:            bool = Field(description="True if the company is facing or filing a lawsuit")
    investigation:      bool = Field(description="True if the company is under regulatory or government investigation")
    management_change:  bool = Field(description="True if there is a change in executive leadership (CEO, CFO, etc.)")
    dividend_increase:  bool = Field(description="True if the company increased its dividend payout")
    dividend_cut:       bool = Field(description="True if the company cut or suspended its dividend")

llm_structured = llm.with_structured_output(Events)
chain          = event_extraction_prompt | llm_structured

def extract_events_from_news(summary: str, max_retries: int = 3) -> Events | None:
    for attempt in range(max_retries):
        try:
            return chain.invoke({"summary": summary})
        except Exception as e:
            print(f"    Attempt {attempt+1} failed: {e}")
            if attempt < max_retries - 1:
                time.sleep(5 * (attempt + 1))
    return None

def extract_events_batch(batch: list[dict], max_workers: int = 3) -> list[dict]:
    """
    Extract events for a batch of articles in parallel.

    Args:
        batch:       list of dicts with keys: news_id, summary
        max_workers: number of parallel threads
                     keep at 3 or below for local Ollama to avoid VRAM overload

    Returns:
        list of dicts with keys: news_id, events (Events object or None)
    """
    results = []

    def process_one(item):
        news_id = item["news_id"]
        summary = item["summary"]
        events  = extract_events_from_news(summary)
        return {"news_id": news_id, "events": events}

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(process_one, item): item for item in batch}

        for future in as_completed(futures):
            try:
                result = future.result()
                results.append(result)
            except Exception as e:
                item = futures[future]
                print(f"    Batch item {item['news_id']} failed entirely: {e}")
                results.append({"news_id": item["news_id"], "events": None})


    results.sort(key=lambda x: x["news_id"])
    return results


def insert_events_batch(cursor, batch_results: list[dict]):
    """Insert all successfully extracted events from a batch."""
    success = 0
    failed  = 0

    for item in batch_results:
        news_id = item["news_id"]
        events  = item["events"]

        if events is None:
            print(f"    Skipping news_id {news_id} — extraction failed")
            failed += 1
            continue

        try:
            db_models.insert_event(cursor, news_id, events)
            success += 1
        except Exception as e:
            print(f"    DB insert failed for news_id {news_id}: {e}")
            failed += 1

    return success, failed


if __name__ == "__main__":
    BATCH_SIZE   = 10   # articles per batch
    MAX_WORKERS  = 3    # parallel LLM calls — keep low for local Ollama

    conn, cursor = db_models.get_db_connection()
    db_models.create_event_table(cursor)

    # Skip already processed rows
    cursor.execute("SELECT news_id FROM event")
    already_done = set(row[0] for row in cursor.fetchall())
    print(f"Already processed: {len(already_done)} articles — skipping these")

    # Fetch all unprocessed articles
    cursor.execute("""
        SELECT id, summary FROM news
        WHERE id NOT IN (SELECT news_id FROM event)
        AND summary IS NOT NULL
        ORDER BY id ASC
    """)
    all_rows   = cursor.fetchall()
    total      = len(all_rows)
    print(f"Articles to process: {total}")

    total_success = 0
    total_failed  = 0

    # Process in batches
    for batch_start in range(0, total, BATCH_SIZE):
        batch_rows = all_rows[batch_start : batch_start + BATCH_SIZE]

        # Build batch input
        batch = [
            {"news_id": row[0], "summary": row[1]}
            for row in batch_rows
        ]

        batch_num = (batch_start // BATCH_SIZE) + 1
        total_batches = (total + BATCH_SIZE - 1) // BATCH_SIZE
        print(f"\nBatch {batch_num}/{total_batches} "
              f"(articles {batch_start+1}–{min(batch_start+BATCH_SIZE, total)}/{total})")

        # Extract events for all articles in batch (parallel)
        batch_results = extract_events_batch(batch, max_workers=MAX_WORKERS)

        # Insert results into DB
        success, failed = insert_events_batch(cursor, batch_results)
        total_success += success
        total_failed  += failed

        # Commit after every batch
        conn.commit()
        print(f"  Batch done — {success} inserted, {failed} failed "
              f"| Running total: {total_success} inserted, {total_failed} failed")

    cursor.close()
    conn.close()
    print(f"\nAll done — {total_success} inserted, {total_failed} failed out of {total} articles")