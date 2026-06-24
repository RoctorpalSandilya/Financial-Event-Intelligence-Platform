import db_models
import embedding

def retrieve_similar_news(query_text:str, top_k:int=5) -> list[dict]:
    query_embedding = embedding.get_embedding(query_text)
    conn, cursor = db_models.get_db_connection()
    
    results = db_models.retrieve_similar_news(cursor, query_embedding, top_k)
    cursor.close()
    conn.close()
    return results