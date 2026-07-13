# xgboost_trainer.py
import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.metrics import (accuracy_score, classification_report,
                             mean_squared_error, mean_absolute_error, r2_score)
import joblib
import db_models
from RAG import get_RAG_results

FINBERT_COLS = [
    "positive_prob", "negative_prob", "neutral_prob", "sentiment_score",
    "sentiment_avg_7d", "sentiment_avg_30d", "sentiment_avg_90d",
    "sentiment_std_7d", "sentiment_std_30d"
]

EVENT_COLS = [
    "earnings_beat", "earnings_miss", "guidance_raise", "guidance_cut",
    "acquisition", "merger", "buyback", "product_launch", "partnership",
    "lawsuit", "investigation", "management_change",
    "dividend_increase", "dividend_cut"
]

MARKET_COLS = [
    "return_1d_before", "return_5d_before", "return_20d_before",
    "volatility_5d", "volatility_20d", "volatility_60d", "ATR",
    "volume_today", "avg_volume_20d", "relative_volume",
    "SMA10", "SMA20", "SMA50", "EMA20",
    "RSI", "MACD", "MACD_signal", "MACD_hist",
    "SP500_return", "NASDAQ_return", "VIX_level",
    "market_cap", "PE_ratio", "debt_to_equity",
    "current_ratio", "revenue_growth"
]

# RAG meta features
RAG_META_COLS = [
    "top_similarity",
    "avg_similarity_top_k",
    "similar_events_count"
]

# RAG FinBERT aggregated features
RAG_FINBERT_BASE = ["pos_prob", "neg_prob", "neu_prob", "sentiment_score"]
RAG_FINBERT_COLS = [
    f"hist_finbert_{agg}_{col}"
    for col in RAG_FINBERT_BASE
    for agg in ["avg", "median", "std"]
]

# RAG Event rate features
RAG_EVENT_BASE = [
    "earnings_beat", "earnings_miss", "guidance_raise", "guidance_cut",
    "acquisition", "merger", "buyback", "product_launch", "partnership",
    "lawsuit", "investigation", "management_change",
    "dividend_increase", "dividend_cut"
]
RAG_EVENT_COLS = [f"hist_event_{col}_rate" for col in RAG_EVENT_BASE]

# RAG Pre-market aggregated features
RAG_PRE_BASE = [
    "return_1d_before", "return_5d_before", "return_20d_before",
    "volatility_5d", "volatility_20d", "volatility_60d", "ATR",
    "volume_today", "avg_volume_20d", "relative_volume",
    "SMA10", "SMA20", "SMA50", "EMA20",
    "RSI", "MACD", "MACD_signal", "MACD_hist",
    "SP500_return", "NASDAQ_return", "VIX_level",
    "market_cap", "PE_ratio", "debt_to_equity",
    "current_ratio", "revenue_growth"
]
RAG_PRE_COLS = [
    f"hist_pre_{agg}_{col}"
    for col in RAG_PRE_BASE
    for agg in ["avg", "median", "std"]
]

# RAG Post-market aggregated features — KEY signal from historical reactions
RAG_POST_BASE = [
    "return_1d", "return_5d", "return_20d",
    "abnormal_return_1d", "abnormal_return_5d", "abnormal_return_20d",
    "outperform_market_1d", "outperform_market_5d", "outperform_market_20d",
    "abnormal_return_gt_2pct_1d", "abnormal_return_gt_2pct_5d", "abnormal_return_gt_2pct_20d"
]
RAG_POST_COLS = [
    f"hist_post_{agg}_{col}"
    for col in RAG_POST_BASE
    for agg in ["avg", "median", "std"]
]

ALL_RAG_COLS = RAG_META_COLS + RAG_FINBERT_COLS + RAG_EVENT_COLS + RAG_PRE_COLS + RAG_POST_COLS

ALL_FEATURES = FINBERT_COLS + EVENT_COLS + MARKET_COLS + ALL_RAG_COLS

CLASSIFICATION_TARGETS = [
    "outperform_market_1d", "outperform_market_5d", "abnormal_return_gt_2pct"
]

REGRESSION_TARGETS = [
    "return_1d_after", "return_5d_after", "return_20d_after",
    "abnormal_return_1d", "abnormal_return_5d", "abnormal_return_20d"
]

def load_training_data() -> pd.DataFrame:
    conn, cursor = db_models.get_db_connection()

    cursor.execute("""
    SELECT
        n.id                AS news_id,
        n.headline,
        n.summary,
        n.company_id        AS ticker,
        n.published_date    AS date,

        -- Current FinBERT
        s.pos_prob          AS positive_prob,
        s.neg_prob          AS negative_prob,
        s.neu_prob          AS neutral_prob,
        s.sentiment_score,

        -- Current Event
        e.earnings_beat, e.earnings_miss, e.guidance_raise, e.guidance_cut,
        e.acquisition, e.merger, e.buyback, e.product_launch, e.partnership,
        e.lawsuit, e.investigation, e.management_change,
        e.dividend_increase, e.dividend_cut,

        -- Current Market pre-news
        m.return_1d_before, m.return_5d_before, m.return_20d_before,
        m.volatility_5d, m.volatility_20d, m.volatility_60d, m.ATR,
        m.volume_today, m.avg_volume_20d, m.relative_volume,
        m.SMA10, m.SMA20, m.SMA50, m.EMA20,
        m.RSI, m.MACD, m.MACD_signal, m.MACD_hist,
        m.SP500_return, m.NASDAQ_return, m.VIX_level,
        m.market_cap, m.PE_ratio, m.debt_to_equity,
        m.current_ratio, m.revenue_growth,

        -- RAG features (precomputed)
        rf.top_similarity,
        rf.avg_similarity_top_k,
        rf.similar_events_count,
        rf.hist_finbert_avg_pos_prob, rf.hist_finbert_median_pos_prob, rf.hist_finbert_std_pos_prob,
        rf.hist_finbert_avg_neg_prob, rf.hist_finbert_median_neg_prob, rf.hist_finbert_std_neg_prob,
        rf.hist_finbert_avg_neu_prob, rf.hist_finbert_median_neu_prob, rf.hist_finbert_std_neu_prob,
        rf.hist_finbert_avg_sentiment_score, rf.hist_finbert_median_sentiment_score, rf.hist_finbert_std_sentiment_score,
        rf.hist_event_earnings_beat_rate, rf.hist_event_earnings_miss_rate,
        rf.hist_event_guidance_raise_rate, rf.hist_event_guidance_cut_rate,
        rf.hist_event_acquisition_rate, rf.hist_event_merger_rate,
        rf.hist_event_buyback_rate, rf.hist_event_product_launch_rate,
        rf.hist_event_partnership_rate, rf.hist_event_lawsuit_rate,
        rf.hist_event_investigation_rate, rf.hist_event_management_change_rate,
        rf.hist_event_dividend_increase_rate, rf.hist_event_dividend_cut_rate,
        rf.hist_pre_avg_return_1d_before, rf.hist_pre_median_return_1d_before,
        rf.hist_pre_avg_return_5d_before, rf.hist_pre_median_return_5d_before,
        rf.hist_pre_avg_volatility_5d, rf.hist_pre_median_volatility_5d,
        rf.hist_pre_avg_volatility_20d, rf.hist_pre_median_volatility_20d,
        rf.hist_pre_avg_RSI, rf.hist_pre_median_RSI,
        rf.hist_pre_avg_MACD, rf.hist_pre_median_MACD,
        rf.hist_pre_avg_VIX_level, rf.hist_pre_median_VIX_level,
        rf.hist_pre_avg_SP500_return, rf.hist_pre_median_SP500_return,
        rf.hist_pre_avg_market_cap, rf.hist_pre_avg_PE_ratio,
        rf.hist_post_avg_return_1d, rf.hist_post_median_return_1d, rf.hist_post_std_return_1d,
        rf.hist_post_avg_return_5d, rf.hist_post_median_return_5d, rf.hist_post_std_return_5d,
        rf.hist_post_avg_return_20d, rf.hist_post_median_return_20d,
        rf.hist_post_avg_abnormal_return_1d, rf.hist_post_median_abnormal_return_1d,
        rf.hist_post_avg_abnormal_return_5d, rf.hist_post_median_abnormal_return_5d,
        rf.hist_post_avg_abnormal_return_20d, rf.hist_post_median_abnormal_return_20d,
        rf.hist_post_avg_outperform_market_1d,
        rf.hist_post_avg_outperform_market_5d,
        rf.hist_post_avg_abnormal_return_gt_2pct_1d,

        -- Targets
        m2.return_1d_after, m2.return_5d_after, m2.return_20d_after,
        m2.abnormal_return_1d, m2.abnormal_return_5d, m2.abnormal_return_20d,
        m2.outperform_market_1d, m2.outperform_market_5d,
        m2.abnormal_return_gt_2pct_1d AS abnormal_return_gt_2pct

    FROM news n
    JOIN sentiment    s   ON s.news_id  = n.id
    JOIN event        e   ON e.news_id  = n.id
    JOIN market       m   ON m.news_id  = n.id
    JOIN market2      m2  ON m2.news_id = n.id
    JOIN rag_features rf  ON rf.news_id = n.id
    WHERE m2.return_1d_after IS NOT NULL
    ORDER BY n.published_date ASC
""")

    rows    = cursor.fetchall()
    columns = [desc[0] for desc in cursor.description]
    df      = pd.DataFrame(rows, columns=columns)

    cursor.close()
    conn.close()

    # Remove text/identifier columns not used as features
    df = df.drop(columns=["headline", "summary", "ticker", "date"], errors="ignore")

    print(f"Loaded {len(df)} rows, {len(df.columns)} columns")
    return df

def build_feature_matrix(df: pd.DataFrame):
    available = [c for c in ALL_FEATURES if c in df.columns]
    missing   = [c for c in ALL_FEATURES if c not in df.columns]

    if missing:
        print(f"  {len(missing)} features missing — skipped: {missing[:10]}{'...' if len(missing) > 10 else ''}")

    X = df[available].copy()

    # Booleans → int
    bool_cols = X.select_dtypes(include="bool").columns
    X[bool_cols] = X[bool_cols].astype(int)

    # Fill NaN with column median
    X = X.fillna(X.median(numeric_only=True))

    print(f"Feature matrix: {X.shape[0]} rows × {X.shape[1]} features")
    return X, available

def train_classifier(X_train, y_train, X_val, y_val, target_name):
    pos_rate  = y_train.mean()
    scale_pos = (1 - pos_rate) / pos_rate if pos_rate > 0 else 1

    model = xgb.XGBClassifier(
        n_estimators          = 500,
        max_depth             = 6,
        learning_rate         = 0.05,
        subsample             = 0.8,
        colsample_bytree      = 0.8,
        scale_pos_weight      = scale_pos,
        eval_metric           = "logloss",
        early_stopping_rounds = 30,
        random_state          = 42,
        device                = "cuda"
    )

    model.fit(X_train, y_train,
              eval_set=[(X_val, y_val)], verbose=50)

    y_pred = model.predict(X_val)
    print(f"\n[{target_name}] Accuracy: {accuracy_score(y_val, y_pred):.4f}")
    print(classification_report(y_val, y_pred))
    return model


def train_regressor(X_train, y_train, X_val, y_val, target_name):
    model = xgb.XGBRegressor(
        n_estimators          = 500,
        max_depth             = 6,
        learning_rate         = 0.05,
        subsample             = 0.8,
        colsample_bytree      = 0.8,
        eval_metric           = "rmse",
        early_stopping_rounds = 30,
        random_state          = 42,
        device                = "cuda"
    )

    model.fit(X_train, y_train,
              eval_set=[(X_val, y_val)], verbose=50)

    y_pred  = model.predict(X_val)
    rmse    = np.sqrt(mean_squared_error(y_val, y_pred))
    mae     = mean_absolute_error(y_val, y_pred)
    r2      = r2_score(y_val, y_pred)
    print(f"\n[{target_name}] RMSE: {rmse:.4f}  MAE: {mae:.4f}  R²: {r2:.4f}")
    return model


def print_feature_importance(model, feature_names, top_n=20):
    imp = pd.DataFrame({
        "feature"   : feature_names,
        "importance": model.feature_importances_
    }).sort_values("importance", ascending=False)
    print(f"\nTop {top_n} features:")
    print(imp.head(top_n).to_string(index=False))

    # Show which feature GROUP dominates
    groups = {
        "Current FinBERT" : FINBERT_COLS,
        "Current Event"   : EVENT_COLS,
        "Current Market"  : MARKET_COLS,
        "RAG Meta"        : RAG_META_COLS,
        "RAG FinBERT"     : RAG_FINBERT_COLS,
        "RAG Event"       : RAG_EVENT_COLS,
        "RAG Pre-Market"  : RAG_PRE_COLS,
        "RAG Post-Market" : RAG_POST_COLS,   # ← expect this to rank highest
    }

    print("\nImportance by feature group:")
    for group_name, cols in groups.items():
        group_imp = imp[imp["feature"].isin(cols)]["importance"].sum()
        print(f"  {group_name:<20} : {group_imp:.4f}")

    return imp

def save_models(models, feature_names):
    import os
    os.makedirs("models", exist_ok=True)
    for name, model in models.items():
        model.save_model(f"models/{name}.json")
    joblib.dump(feature_names, "models/feature_names.pkl")
    print(f"Saved {len(models)} models to /models/")


def load_models():
    import os
    feature_names = joblib.load("models/feature_names.pkl")
    models = {}
    for target in CLASSIFICATION_TARGETS + REGRESSION_TARGETS:
        path = f"models/{target}.json"
        if os.path.exists(path):
            model = (xgb.XGBClassifier() if target in CLASSIFICATION_TARGETS
                     else xgb.XGBRegressor())
            model.load_model(path)
            models[target] = model
    print(f"Loaded {len(models)} models")
    return models, feature_names

def predict_new_article(
    current_features: dict,
    headline: str,
    summary: str,
    models: dict,
    feature_names: list
) -> dict:
    """
    Predict market reaction for a new article.

    Args:
        current_features: dict of finbert + event + market features for the new article
        headline:         article headline (used for RAG query)
        summary:          article summary  (used for RAG query)
        models:           loaded model dict
        feature_names:    feature list from training
    """
    # Fetch RAG features for the new article
    query_text   = f"{headline}. {summary}"
    rag_features = get_RAG_results(query_text, top_k=20)

    # Merge all features
    all_features = {**current_features, **rag_features}

    # Build single-row dataframe in exact training column order
    row = pd.DataFrame([{f: all_features.get(f, np.nan) for f in feature_names}])
    row = row.fillna(row.median(numeric_only=True))

    predictions = {}
    for target, model in models.items():
        pred = model.predict(row)[0]
        predictions[target] = round(float(pred), 6)

        if target in CLASSIFICATION_TARGETS:
            prob = model.predict_proba(row)[0][1]
            predictions[f"{target}_prob"] = round(float(prob), 4)

    return predictions

def train_all_models():
    print("Loading data...")
    df = load_training_data()

    print("Building feature matrix...")
    X, feature_names = build_feature_matrix(df)

    # Chronological split — never random for financial data
    split_idx = int(len(df) * 0.8)
    X_train   = X.iloc[:split_idx]
    X_val     = X.iloc[split_idx:]

    models = {}

    print("\n" + "="*55 + "\nCLASSIFIERS\n" + "="*55)
    for target in CLASSIFICATION_TARGETS:
        if target not in df.columns:
            print(f"Skipping {target} — not in dataframe")
            continue
        y_train = df[target].iloc[:split_idx].astype(int)
        y_val   = df[target].iloc[split_idx:].astype(int)
        model   = train_classifier(X_train, y_train, X_val, y_val, target)
        print_feature_importance(model, feature_names)
        models[target] = model

    print("\n" + "="*55 + "\nREGRESSORS\n" + "="*55)
    for target in REGRESSION_TARGETS:
        if target not in df.columns:
            print(f"Skipping {target} — not in dataframe")
            continue
        y_train = df[target].iloc[:split_idx]
        y_val   = df[target].iloc[split_idx:]
        model   = train_regressor(X_train, y_train, X_val, y_val, target)
        print_feature_importance(model, feature_names)
        models[target] = model

    return models, feature_names

# Run this ONCE before training — saves RAG features to DB
def precompute_rag_features():
    conn, cursor = db_models.get_db_connection()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS rag_features (
            news_id BIGINT PRIMARY KEY REFERENCES news(id) ON DELETE CASCADE
        )
    """)

    # Dynamically add columns for all RAG feature names
    for col in ALL_RAG_COLS:
        cursor.execute(f"ALTER TABLE rag_features ADD COLUMN IF NOT EXISTS {col} FLOAT")
    conn.commit()

    cursor.execute("""
        SELECT n.id, n.headline, n.summary
        FROM news n
        LEFT JOIN rag_features rf ON rf.news_id = n.id
        WHERE rf.news_id IS NULL
    """)
    rows = cursor.fetchall()
    print(f"Computing RAG features for {len(rows)} articles...")

    for i, row in enumerate(rows):
        news_id, headline, summary = row
        query_text   = f"{headline}. {summary}"
        rag_features = get_RAG_results(query_text, top_k=20)

        if not rag_features:
            continue

        cols = ", ".join(rag_features.keys())
        vals = ", ".join(["%s"] * len(rag_features))

        cursor.execute(f"""
            INSERT INTO rag_features (news_id, {cols})
            VALUES (%s, {vals})
            ON CONFLICT (news_id) DO NOTHING
        """, (news_id, *rag_features.values()))

        if (i + 1) % 100 == 0:
            conn.commit()
            print(f"  {i+1}/{len(rows)} done")

    conn.commit()
    cursor.close()
    conn.close()
    print("RAG features precomputed and stored.")

if __name__ == "__main__":
    precompute_rag_features()
    models, feature_names = train_all_models()
    save_models(models, feature_names)
    print("\nDone — all models trained and saved.")