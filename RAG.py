import db_models
import retrieval


def get_RAG_results(query_text: str, top_k: int = 1) -> list[dict]:
    similar_news = retrieval.retrieve_similar_news(query_text, top_k=top_k)

    if not similar_news:
        return []

    conn, cursor = db_models.get_db_connection()

    results = []
    for item in similar_news:
        cursor.execute("""
            SELECT
                return_1d, return_5d, return_20d, abnormal_return_1d, abnormal_return_5d, abnormal_return_20d,
                outperform_market_1d, outperform_market_5d, outperform_market_20d, abnormal_return_gt_2pct_1d, abnormal_return_gt_2pct_5d, abnormal_return_gt_2pct_20d,
            FROM market2
            WHERE news_id = %s
        """, (item["news_id"],))

        row = cursor.fetchone()

        if row:
            columns = [desc[0] for desc in cursor.description]
            row_dict = dict(zip(columns, row))
            row_dict["similarity"] = item["similarity"]   # attach similarity score too
            results.append(row_dict)

    cursor.close()
    conn.close()
    return results


if __name__ == "__main__":
    results = get_RAG_results("Apple launches new iPhone with AI features", top_k=3)
    for r in results:
        print(r)