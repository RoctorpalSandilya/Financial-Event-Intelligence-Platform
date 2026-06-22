from langchain_ollama import ChatOllama
from pydantic import BaseModel, Field
from langchain_core.prompts import PromptTemplate

import db_models

llm = ChatOllama(
    model       = "deepseek-r1:7b",
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
chain= event_extraction_prompt | llm_structured

def extract_events_from_news(summary: str) -> Events:
    result = chain.invoke({"summary": summary})
    return result

if __name__ == "__main__":
    conn, cursor = db_models.get_db_connection()
    db_models.create_market_table(cursor)
    db_models.create_market_table2(cursor)
    cursor.execute("SELECT COUNT(*) FROM news")
    total_rows = cursor.fetchone()[0]
    for row in range(24700, total_rows+1):
        cursor.execute("SELECT Company_id, Summary FROM news WHERE id= %s", (row,))
        result = cursor.fetchone()
        company_id = result[0]
        summary = result[1]
        events = extract_events_from_news(summary)
        db_models.insert_event(cursor, row, events)
        if row % 100 == 0:            
            print(f"Processed {row} out of {total_rows} news articles...")
            conn.commit()
    cursor.close()
    conn.close()