from transformers import BertTokenizer, BertForSequenceClassification
import db_models
import torch

labels= ["positive", "negative", "neutral"]
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model_name = "ProsusAI/finbert"
tokenizer = BertTokenizer.from_pretrained(model_name)
model= BertForSequenceClassification.from_pretrained(model_name)
model= model.to(device)
model.eval()

def get_sentiment(text: str) -> dict:
    inputs = tokenizer(
        text,
        return_tensors="pt",
        truncation=True,
        max_length=512,
        padding=True
    )
    inputs = {k: v.to(device) for k, v in inputs.items()}

    with torch.no_grad():
        outputs = model(**inputs)

    scores    = torch.softmax(outputs.logits, dim=1).squeeze()
    predicted = torch.argmax(scores).item()

    return {
        "label"    : labels[predicted],
        "pos_prob" : round(scores[0].item(), 4),
        "neg_prob" : round(scores[1].item(), 4),
        "neu_prob" : round(scores[2].item(), 4),
        "confidence": round(scores[predicted].item(), 4)
    }

if __name__ == "__main__":
    conn, cursor = db_models.get_db_connection()
    db_models.create_sentiment_table(cursor)
    cursor.execute("SELECT COUNT(*) FROM news")
    total_rows = cursor.fetchone()[0]
    for row in range(1, total_rows+1):
        cursor.execute("SELECT Summary FROM news WHERE id= %s", (row,))
        summary = cursor.fetchone()[0]
        sentiment = get_sentiment(summary)
        db_models.insert_sentiment(cursor, row, sentiment["confidence"], sentiment["pos_prob"], sentiment["neg_prob"], sentiment["neu_prob"])
        if row % 100 == 0:
            conn.commit()
            print(f"Processed {row} out of {total_rows} rows.")
    cursor.close()
    conn.close()