import db_models
from langchain_ollama import OllamaEmbeddings

model= OllamaEmbeddings(model="nomic-embed-text")

def get_embedding(text: str):
    embedding = model.embed_query(text)
    return embedding

if __name__ == "__main__":
    conn, cursor= db_models.get_db_connection()
    db_models.create_embeddings_table(cursor)
    cursor.execute("SELECT COUNT(*) FROM news")
    total_rows = cursor.fetchone()[0]
    for row in range(1, total_rows+1):
        cursor.execute("SELECT Summary FROM news WHERE id= %s", (row,))
        summary = cursor.fetchone()[0]
        embedding = get_embedding(summary)
        db_models.insert_embedding(cursor, row, embedding)
        if row % 100 == 0:
            conn.commit()
            print(f"Processed {row} out of {total_rows} rows.")
    
    cursor.close()
    conn.close()