import db_models

def avg_signed_sentiment(subset):
    if not subset:
        return None
    scores = [r[1] - r[2] for r in subset]
    return sum(scores) / len(scores)

def get_company_context(company_id, date):
    conn, cursor = db_models.get_db_connection()

    cursor.execute("""
        SELECT n.published_date, s.pos_prob, s.neg_prob
        FROM news n
        JOIN sentiment s ON s.news_id = n.id
        WHERE n.company_id = %s AND n.published_date <= %s
        ORDER BY n.published_date ASC
    """, (company_id, date))

    rows = cursor.fetchall()
    cursor.close()
    conn.close()

    sentiment_7d  = avg_signed_sentiment(rows[-7:])  if len(rows) >= 7  else None
    sentiment_30d = avg_signed_sentiment(rows[-30:]) if len(rows) >= 30 else None

    return sentiment_7d, sentiment_30d