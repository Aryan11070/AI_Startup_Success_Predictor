"""
main.py - StartupVantage API
------------------------------
FastAPI backend serving predictions from pre-trained ML models.

Run:
    uvicorn main:app --reload

Endpoints:
    GET  /         -> Health check
    POST /predict  -> Single startup prediction (JSON input)
    POST /upload   -> Batch prediction from uploaded CSV or Excel file

The models expect exactly: [market, funding_rounds, funding_bucket, startup_age, country_freq, log_funding]
"""

# ----------------------------------------------
# Imports
# ----------------------------------------------
import io

import numpy as np
import shap
import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ----------------------------------------------
# App Initialization
# ----------------------------------------------
app = FastAPI(
    title="StartupVantage API",
    description="Predicts startup success status (classification) and expected total funding (regression).",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------------------------------
# Model & Scaler Loading
# ----------------------------------------------
try:
    rf_classifier   = joblib.load("best_classifier.pkl")
    dt_regressor    = joblib.load("dt_regressor.pkl")
    min_max_scaler  = joblib.load("min_max_scaler.pkl")
    country_encoder = joblib.load("country_encoder.pkl")
    market_encoder  = joblib.load("market_encoder.pkl")
    status_encoder  = joblib.load("status_encoder.pkl")
    print("[OK] Models, scaler, and encoders loaded successfully.")
except FileNotFoundError as exc:
    raise RuntimeError(
        "Model files not found. Run `python train.py` before starting the API."
    ) from exc

# Build country_freq map from original dataset
try:
    _temp_df = pd.read_csv("dataset.csv", usecols=["country_code"])
    country_freq_map = _temp_df["country_code"].value_counts(normalize=True).to_dict()
    print("[OK] Computed country_freq_map from dataset.csv")
    del _temp_df
except Exception as e:
    print(f"[WARN] Failed to load dataset.csv for country frequencies: {e}")
    country_freq_map = {}

explainer = shap.TreeExplainer(rf_classifier)
print("[OK] SHAP TreeExplainer initialized.")

# Feature order matched exactly to what train.py fitted on
FEATURE_ORDER = [
    "market",           # label-encoded primary category
    "funding_rounds",   # raw count
    "funding_bucket",   # ordinal format
    "startup_age",      # years since founding
    "country_freq",     # freq mapping
    "log_funding",      # log1p of funding_total_usd
]

CURRENT_YEAR = 2025

# ----------------------------------------------
# Pydantic Schema
# ----------------------------------------------
class StartupInput(BaseModel):
    country_code:      str | int  # Str or label encoded int
    market:            str | int
    funding_total_usd: float
    funding_rounds:    int
    founded_year:      int


# ----------------------------------------------
# Helpers
# ----------------------------------------------
def _map_country_freq(code):
    # Try looking up native passed string
    if type(code) is str and code in country_freq_map:
        return country_freq_map[code]
        
    # If encoded int passed, decode to string first and look up
    try:
        if type(code) is int or type(code) is float:
            decoded = str(country_encoder.inverse_transform([int(code)])[0])
            if decoded in country_freq_map:
                return country_freq_map[decoded]
    except Exception:
        pass
    # Default to global mean frequency instead of fixed 0.0001 (prevents grouping unknowns)
    default_freq = np.mean(list(country_freq_map.values())) if country_freq_map else 0.001
    return default_freq

def _encode_and_scale(df: pd.DataFrame) -> pd.DataFrame:
    """
    Transforms clean incoming df -> model-ready features.
    Handles multiple input formats (both API format and test template format).
    """
    df = df.copy()

    # Map alternate column names to standard format
    column_mapping = {
        "category_list": "market",
        "Category": "market",
        "Industry": "market",
        "founded_at": "founded_year",
        "Founded_Year": "founded_year",
        "Founded Year": "founded_year",
        "funding_total_usd": "funding_total_usd",
        "Funding_USD": "funding_total_usd",
        "Funding USD": "funding_total_usd",
        "funding_rounds": "funding_rounds",
        "Funding_Rounds": "funding_rounds",
        "country_code": "country_code",
        "Country": "country_code",
    }
    
    # Rename columns
    df = df.rename(columns=column_mapping)

    # If raw category_list exists, transform to market
    if "market" in df.columns:
        df["market"] = df["market"].astype(str).str.split("|").str[0].str.strip()
    
    # If raw founded_at string date exists, transform to founded_year
    if "founded_year" in df.columns and df["founded_year"].dtype == object:
        df["founded_year"] = pd.to_datetime(df["founded_year"], errors="coerce").dt.year

    # Safe fallbacks if critical cols missing (should be caught by endpoint)
    if "founded_year" not in df.columns:
        df["founded_year"] = CURRENT_YEAR
    if "funding_total_usd" not in df.columns:
        df["funding_total_usd"] = 0
    if "funding_rounds" not in df.columns:
        df["funding_rounds"] = 0
    if "country_code" not in df.columns:
        df["country_code"] = "USA"
    if "market" not in df.columns:
        df["market"] = "Unknown"

    # Deep clean funding_total_usd
    if df["funding_total_usd"].dtype == object:
        df["funding_total_usd"] = (
            df["funding_total_usd"].astype(str)
            .str.replace("$", "", regex=False)
            .str.replace(",", "", regex=False)
            .str.strip()
            .replace({"-": None, "": None})
        )
        df["funding_total_usd"] = pd.to_numeric(df["funding_total_usd"], errors="coerce")

    # Fill NaN values
    df["founded_year"] = pd.to_numeric(df["founded_year"], errors="coerce").fillna(CURRENT_YEAR)
    df["funding_total_usd"] = pd.to_numeric(df["funding_total_usd"], errors="coerce").fillna(0)
    df["funding_rounds"] = pd.to_numeric(df["funding_rounds"], errors="coerce").fillna(1)
    df["country_code"] = df["country_code"].fillna("USA")
    df["market"] = df["market"].fillna("Unknown")

    # Derivations
    df["startup_age"] = CURRENT_YEAR - df["founded_year"]
    df["funding_bucket"] = pd.cut(
        df["funding_rounds"],
        bins=[-np.inf, 1, 4, np.inf],
        labels=[0, 1, 2],
    ).astype(int)
    
    # Calculate country_freq
    df["country_freq"] = df["country_code"].apply(_map_country_freq)

    # Calculate log_funding
    df["log_funding"] = np.log1p(df["funding_total_usd"])

    # ENCODING STRINGS TO INT
    if df["market"].dtype == object:
        # Get default encoding for unknown markets (use median of valid codes, not 0)
        valid_codes = [market_encoder.transform([str(c)])[0] for c in market_encoder.classes_]
        default_market_code = int(np.median(valid_codes)) if valid_codes else 0
        df["market"] = df["market"].apply(
            lambda v: market_encoder.transform([str(v)])[0] if str(v) in market_encoder.classes_ else default_market_code
        )

    # FINAL ORDER
    df = df[FEATURE_ORDER].astype(float)

    # Apply Scaler
    scaled = min_max_scaler.transform(df)
    return scaled


def _build_prediction(row_idx: int, scaled_row, original_row: dict) -> dict:
    sample = scaled_row.reshape(1, -1)

    status_code  = int(rf_classifier.predict(sample)[0])
    status_label = str(status_encoder.inverse_transform([status_code])[0])
    
    # Regressor yields log_funding
    log_fund_pred = dt_regressor.predict(sample)[0]
    funding = round(float(np.expm1(log_fund_pred)), 2)

    shap_values  = explainer(sample)
    class_1_shap = shap_values.values[0, :, status_code]
    shap_importance = {
        feature: round(float(val), 6)
        for feature, val in zip(FEATURE_ORDER, class_1_shap)
    }

    return {
        "row":                      row_idx,
        "input":                    original_row,
        "predicted_status_code":    status_code,
        "predicted_status_label":   status_label.capitalize(),
        "forecasted_total_funding": funding,
        "shap_feature_importance":  shap_importance,
    }


# ----------------------------------------------
# Endpoints
# ----------------------------------------------
@app.get("/", summary="Health Check", tags=["General"])
def root():
    return {"message": "StartupVantage API is running"}


@app.post("/predict", summary="Predict Startup Outcome", tags=["Prediction"])
def predict(data: StartupInput):
    try:
        df = pd.DataFrame([data.model_dump()])
        scaled = _encode_and_scale(df)
        preds = _build_prediction(0, scaled[0], data.model_dump())
        return preds
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/upload", summary="Batch Predict from File", tags=["Prediction"])
async def upload(file: UploadFile = File(...)):
    filename = file.filename or ""
    if not (filename.endswith(".csv") or filename.endswith(".xlsx") or filename.endswith(".xls")):
        raise HTTPException(status_code=400, detail="Unsupported file type.")

    try:
        contents = await file.read()
        buffer   = io.BytesIO(contents)

        if filename.endswith(".csv"):
            df = pd.read_csv(buffer)
        else:
            df = pd.read_excel(buffer)

        # Scale pipeline
        scaled = _encode_and_scale(df)

        # Batch predict
        status_codes = rf_classifier.predict(scaled)
        status_labels = status_encoder.inverse_transform(status_codes)
        
        log_fund_preds = dt_regressor.predict(scaled)
        funding_usd = np.round(np.expm1(log_fund_preds), 2)
        
        # SHAP batch predict
        shap_values = explainer(scaled)

        predictions = []
        for i in range(len(df)):
            class_1_shap = shap_values.values[i, :, status_codes[i]]
            shap_importance = {
                feature: round(float(val), 6)
                for feature, val in zip(FEATURE_ORDER, class_1_shap)
            }
            predictions.append({
                "row": int(i),
                "input": df.iloc[i].fillna("").to_dict(),
                "predicted_status_code": int(status_codes[i]),
                "predicted_status_label": str(status_labels[i]).capitalize(),
                "forecasted_total_funding": float(funding_usd[i]),
                "shap_feature_importance": shap_importance
            })

        return {
            "total_rows":  len(predictions),
            "predictions": predictions,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
