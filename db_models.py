from db_conn import create_db_if_not_exists

def get_db_connection():
    conn, cursor = create_db_if_not_exists()
    return conn, cursor

def create_blacklist_table(cursor):
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS token_blacklist (
            id SERIAL PRIMARY KEY,
            token TEXT UNIQUE NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

def create_news_table(cursor):
    cursor.execute("""
                   CREATE TABLE IF NOT EXISTS news (
                       id BIGSERIAL PRIMARY KEY,
                       Company_id VARCHAR(255) NOT NULL,
                       Headline TEXT NOT NULL,
                       Summary TEXT NOT NULL,
                       Full_text TEXT,
                       Url TEXT NOT NULL,
                       Published_date TIMESTAMP
                   )
                   """)
    
def create_sentiment_table(cursor):
    cursor.execute("""
                   CREATE TABLE IF NOT EXISTS sentiment (
                       id BIGSERIAL PRIMARY KEY,
                       news_id BIGINT NOT NULL,
                       sentiment_score FLOAT NOT NULL,
                       pos_prob FLOAT NOT NULL,
                       neg_prob FLOAT NOT NULL,
                       neu_prob FLOAT NOT NULL,
                       FOREIGN KEY (news_id) REFERENCES news (id) ON DELETE CASCADE
                   )
                   """)
    
def create_market_table(cursor):
    cursor.execute("""
                   CREATE TABLE IF NOT EXISTS market (
                       id BIGSERIAL PRIMARY KEY,
                       news_id BIGINT NOT NULL,
                       ticker VARCHAR(255) NOT NULL,
                       date DATE NOT NULL,
                       return_1d_before FLOAT,
                       return_5d_before FLOAT,
                       return_20d_before FLOAT,
                       volatility_5d FLOAT,
                       volatility_20d FLOAT,
                       volatility_60d FLOAT,
                       ATR FLOAT,
                       volume_today FLOAT,
                       avg_volume_20d FLOAT,
                       relative_volume FLOAT,
                       SMA10 FLOAT,
                       SMA20 FLOAT,
                       SMA50 FLOAT,
                       EMA20 FLOAT,
                       RSI FLOAT,
                       MACD FLOAT,
                       MACD_signal FLOAT,
                       MACD_hist FLOAT,
                       SP500_return FLOAT,
                       NASDAQ_return FLOAT,
                       VIX_level FLOAT,
                       market_cap FLOAT,
                       PE_ratio FLOAT,
                       debt_to_equity FLOAT,
                       current_ratio FLOAT,
                       revenue_growth FLOAT,
                       FOREIGN KEY (news_id) REFERENCES news (id) ON DELETE CASCADE
                   )
                   """)

def create_market_table2(cursor):
    cursor.execute("""
                   CREATE TABLE IF NOT EXISTS market2 (
                       id BIGSERIAL PRIMARY KEY,
                       news_id BIGINT NOT NULL,
                       ticker VARCHAR(255) NOT NULL,
                       date DATE NOT NULL,
                       return_1d FLOAT,
                       return_5d FLOAT,
                       return_20d FLOAT,
                       abnormal_return_1d FLOAT,
                       abnormal_return_5d FLOAT,
                       abnormal_return_20d FLOAT,
                       outperform_market_1d BOOLEAN,
                       outperform_market_5d BOOLEAN,
                       outperform_market_20d BOOLEAN,
                       abnormal_return_gt_2pct_1d BOOLEAN,
                       abnormal_return_gt_2pct_5d BOOLEAN,
                       abnormal_return_gt_2pct_20d BOOLEAN,
                       FOREIGN KEY (news_id) REFERENCES news (id) ON DELETE CASCADE
                   )
                   """)

def create_event_table(cursor):
    cursor.execute("""
                   CREATE TABLE IF NOT EXISTS event (
                       id BIGSERIAL PRIMARY KEY,
                       news_id BIGINT NOT NULL,
                       earnings_beat BOOLEAN,
                       earnings_miss BOOLEAN,
                       guidance_raise BOOLEAN,
                       guidance_cut BOOLEAN,
                       acquisition BOOLEAN,
                       merger BOOLEAN,
                       buyback BOOLEAN,
                       product_launch BOOLEAN,
                       partnership BOOLEAN,
                       lawsuit BOOLEAN,
                       investigation BOOLEAN,
                       management_change BOOLEAN,
                       dividend_increase BOOLEAN,
                       dividend_cut BOOLEAN,
                       FOREIGN KEY (news_id) REFERENCES news (id) ON DELETE CASCADE
                   )
                   """)
    
def create_embeddings_table(cursor):
    cursor.execute("CREATE EXTENSION IF NOT EXISTS vector;")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS news_embeddings (
            id        BIGSERIAL PRIMARY KEY,
            news_id   BIGINT NOT NULL REFERENCES news(id) ON DELETE CASCADE,
            embedding vector(768)
        );
    """)

def create_user_table(cursor):
    cursor.execute("""
                   CREATE TABLE IF NOT EXISTS users (
                       id BIGSERIAL PRIMARY KEY,
                       username VARCHAR(255) UNIQUE NOT NULL,
                       password_hash TEXT NOT NULL,
                       email VARCHAR(255) UNIQUE NOT NULL
                   )
                   """)

def insert_news(cursor, company_id, headline, summary, url, published_date):
    cursor.execute("""
                   INSERT INTO news (Company_id, Headline, Summary, Url, Published_date)
                   VALUES (%s, %s, %s, %s, %s)
                   """, (company_id, headline, summary, url, published_date))

def insert_sentiment(cursor, news_id, sentiment_score, pos_prob, neg_prob, neu_prob):
    cursor.execute("""
                   INSERT INTO sentiment (news_id, sentiment_score, pos_prob, neg_prob, neu_prob)
                   VALUES (%s, %s, %s, %s, %s)
                   """, (news_id, sentiment_score, pos_prob, neg_prob, neu_prob))
    
def insert_market(cursor, news_id, ticker, date, features: dict):
    cursor.execute("""
                   INSERT INTO market (news_id, ticker, date, return_1d_before, return_5d_before, return_20d_before,
                                       volatility_5d, volatility_20d, volatility_60d, ATR, volume_today,
                                       avg_volume_20d, relative_volume, SMA10, SMA20, SMA50, EMA20, RSI,
                                       MACD, MACD_signal, MACD_hist, SP500_return, NASDAQ_return,
                                       VIX_level, market_cap, PE_ratio, debt_to_equity,
                                       current_ratio, revenue_growth)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                     """, (news_id, ticker, date, features.get("return_1d_before"), features.get("return_5d_before"), features.get("return_20d_before"),
                             features.get("volatility_5d"), features.get("volatility_20d"), features.get("volatility_60d"), features.get("ATR"), features.get("volume_today"),
                             features.get("avg_volume_20d"), features.get("relative_volume"), features.get("SMA10"), features.get("SMA20"), features.get("SMA50"),
                             features.get("EMA20"), features.get("RSI"), features.get("MACD"), features.get("MACD_signal"), features.get("MACD_hist"),
                             features.get("SP500_return"), features.get("NASDAQ_return"), features.get("VIX_level"),
                             features.get("market_cap"), features.get("PE_ratio"), features.get("debt_to_equity"),
                             features.get("current_ratio"), features.get("revenue_growth")))
    
def insert_market2(cursor, news_id, ticker, date, features: dict):
    cursor.execute("""
                   INSERT INTO market2 (news_id, ticker, date, return_1d, return_5d, return_20d,
                                        abnormal_return_1d, abnormal_return_5d, abnormal_return_20d,
                                        outperform_market_1d, outperform_market_5d, outperform_market_20d, abnormal_return_gt_2pct_1d, abnormal_return_gt_2pct_5d, abnormal_return_gt_2pct_20d)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """, (news_id, ticker, date, features.get("return_1d"), features.get("return_5d"), features.get("return_20d"),
                                features.get("abnormal_return_1d"), features.get("abnormal_return_5d"), features.get("abnormal_return_20d"),
                                features.get("outperform_market_1d"), features.get("outperform_market_5d"), features.get("outperform_market_20d"), features.get("abnormal_return_gt_2pct_1d"), features.get("abnormal_return_gt_2pct_5d"), features.get("abnormal_return_gt_2pct_20d")))
    
def insert_event(cursor, news_id, events: dict):
    cursor.execute("""
                   INSERT INTO event (news_id, earnings_beat, earnings_miss, guidance_raise, guidance_cut,
                                      acquisition, merger, buyback, product_launch, partnership,
                                      lawsuit, investigation, management_change, dividend_increase, dividend_cut)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """, (news_id, events.earnings_beat, events.earnings_miss, events.guidance_raise, events.guidance_cut,
                                events.acquisition, events.merger, events.buyback, events.product_launch, events.partnership,
                                events.lawsuit, events.investigation, events.management_change, events.dividend_increase, events.dividend_cut))
    
def insert_embedding(cursor, news_id, embedding):
    cursor.execute("""
                   INSERT INTO news_embeddings (news_id, embedding)
                   VALUES (%s, %s)
                   """, (news_id, embedding))
    
def insert_user(cursor, username, password_hash):
    cursor.execute("""
                   INSERT INTO users (username, password_hash)
                   VALUES (%s, %s)
                   """, (username, password_hash))
    
def insert_blacklist_token(cursor, token, expires_at):
    cursor.execute("""
                   INSERT INTO token_blacklist (token, expires_at)
                   VALUES (%s, %s)
                   """, (token, expires_at))
    
def retrieve_similar_news(cursor, query_embedding, top_k=5):
    cursor.execute("""
        SELECT n.id, 1 - (ne.embedding <=> %s::vector) AS similarity
        FROM news_embeddings ne
        JOIN news n ON ne.news_id = n.id
        ORDER BY ne.embedding <=> %s::vector
        LIMIT %s
    """, (query_embedding, query_embedding, top_k))

    rows = cursor.fetchall()
    return [{"news_id": row[0], "similarity": row[1]} for row in rows]