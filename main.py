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

Prediction strategy:
    - Uses predict_proba() for calibrated probability estimates
    - Decision threshold loaded from threshold.pkl (tuned at train time, 0.25-0.35 range)
    - P(success) >= threshold  -> predicted success (status_code=1)
    - P(success) <  threshold  -> predicted failure (status_code=0)
    - risk_tier: Critical / High / Moderate / Low based on P(failure)
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

# Load tuned decision threshold (saved by train.py)
try:
    DECISION_THRESHOLD: float = float(joblib.load("threshold.pkl"))
    print(f"[OK] Decision threshold loaded: {DECISION_THRESHOLD}")
except FileNotFoundError:
    DECISION_THRESHOLD = 0.30
    print(f"[WARN] threshold.pkl not found, using default: {DECISION_THRESHOLD}")

# Build country_freq map from original dataset
_DATASET_CANDIDATES = ["big_startup_success_dataset.csv", "dataset.csv"]
country_freq_map: dict = {}
for _ds_path in _DATASET_CANDIDATES:
    try:
        _temp_df = pd.read_csv(_ds_path, usecols=["country_code"])
        country_freq_map = _temp_df["country_code"].value_counts(normalize=True).to_dict()
        print(f"[OK] Computed country_freq_map from {_ds_path}")
        del _temp_df
        break
    except Exception as e:
        print(f"[WARN] Could not load {_ds_path} for country frequencies: {e}")
if not country_freq_map:
    print("[WARN] country_freq_map is empty – using fallback frequency 0.001")

explainer = shap.TreeExplainer(rf_classifier)
print("[OK] SHAP TreeExplainer initialized.")

# Feature order matched exactly to what train.py fitted on
FEATURE_ORDER = [
    "market",           # label-encoded primary category
    "funding_rounds",   # raw count
    "startup_age",      # years since founding
    "country_freq",     # freq mapping
    "log_funding",      # log1p of funding_total_usd
    "funding_per_round",# funding_total_usd / (funding_rounds + 1)
    "funding_efficiency",# funding_total_usd / (startup_age + 1)
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
    
    # Always try to parse founded_year from a date string to a numeric year.
    # NOTE: Do NOT gate on dtype == object — Arrow-backed pandas dtypes will
    # appear as 'string' or 'large_string', NOT 'object', causing the conversion
    # to be skipped and a TypeError during the subtraction below.
    if "founded_year" in df.columns:
        parsed = pd.to_datetime(df["founded_year"], errors="coerce")
        # If at least some values parsed as dates (not all-NaT), use the year
        if parsed.notna().any():
            df["founded_year"] = parsed.dt.year
        # If already numeric (e.g. 2018), leave as-is
        df["founded_year"] = pd.to_numeric(df["founded_year"], errors="coerce")

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

    # NOTE: funding_total_usd deep-clean is handled unconditionally in the fill-NaN block below.

    # Fill NaN values — ensure numeric types for all arithmetic columns
    df["founded_year"] = pd.to_numeric(df["founded_year"], errors="coerce").fillna(CURRENT_YEAR).astype(int)
    df["funding_total_usd"] = pd.to_numeric(
        df["funding_total_usd"].astype(str)
        .str.replace("$", "", regex=False)
        .str.replace(",", "", regex=False)
        .str.strip()
        .replace({"-": "nan", "": "nan"}),
        errors="coerce"
    ).fillna(0.0)
    df["funding_rounds"] = pd.to_numeric(df["funding_rounds"], errors="coerce").fillna(1).astype(int)
    df["country_code"] = df["country_code"].fillna("USA")
    df["market"] = df["market"].fillna("Unknown")

    # Drop ALL pre-computed / derived columns that may exist in the uploaded file.
    # We always recompute these fresh from raw inputs to avoid stale / mismatched feature names.
    DERIVED_COLS = [
        "startup_age", "funding_per_round", "log_funding", "country_freq", "funding_efficiency",
        # Common misnamed variants users may upload
        "funding_bucket", "fund_per_round", "log_fund", "country_frequency",
    ]
    df = df.drop(columns=[c for c in DERIVED_COLS if c in df.columns], errors="ignore")

    # --- Feature Engineering (always computed fresh) ---

    # startup_age: years since founding
    df["startup_age"] = (CURRENT_YEAR - df["founded_year"]).clip(lower=0, upper=50)

    # funding_per_round: average funding efficiency
    df["funding_per_round"] = df["funding_total_usd"] / (df["funding_rounds"] + 1)

    # funding_efficiency: funding per year of age
    df["funding_efficiency"] = df["funding_total_usd"] / (df["startup_age"] + 1)

    # country_freq: frequency-encoded country
    df["country_freq"] = df["country_code"].map(_map_country_freq).astype(float)

    # log_funding: log1p transform of funding amount
    df["log_funding"] = np.log1p(df["funding_total_usd"])

    # Encode market string -> integer label
    if df["market"].dtype == object:
        valid_codes = [market_encoder.transform([str(c)])[0] for c in market_encoder.classes_]
        default_market_code = int(np.median(valid_codes)) if valid_codes else 0
        df["market"] = df["market"].apply(
            lambda v: market_encoder.transform([str(v)])[0]
            if str(v) in market_encoder.classes_
            else default_market_code
        )

    # Select ONLY the 6 model features in the exact fitted order
    feature_matrix = df[FEATURE_ORDER].astype(float)

    # Pass raw NumPy array to scaler — bypasses sklearn feature-name validation
    # entirely, so stale column names in uploaded files never cause a mismatch.
    scaled = min_max_scaler.transform(feature_matrix.values)
    return scaled


# ----------------------------------------------
# Risk Tier Helper
# ----------------------------------------------
def _risk_tier(failure_prob: float) -> tuple[str, int]:
    """
    Maps P(failure) to a human-readable risk tier and a 0-100 risk score.

    Tiers (based on failure probability):
      Critical  >= 0.70  -> catastrophic failure risk
      High      >= 0.45  -> elevated failure risk
      Moderate  >= 0.25  -> moderate failure risk
      Low       <  0.25  -> low failure risk

    Returns (tier_label, risk_score_0_to_100)
    """
    risk_score = round(failure_prob * 100)
    if failure_prob >= 0.70:
        return "Critical", risk_score
    elif failure_prob >= 0.45:
        return "High", risk_score
    elif failure_prob >= 0.25:
        return "Moderate", risk_score
    else:
        return "Low", risk_score


def _build_prediction(row_idx: int, scaled_row, original_row: dict) -> dict:
    sample = scaled_row.reshape(1, -1)

    # Probability-based prediction
    proba          = rf_classifier.predict_proba(sample)[0]   # [P(failure), P(success)]
    success_prob   = float(proba[1])
    failure_prob   = float(proba[0])
    status_code    = 1 if success_prob >= DECISION_THRESHOLD else 0
    status_label   = str(status_encoder.inverse_transform([status_code])[0])

    tier, risk_score = _risk_tier(failure_prob)

    # Regressor yields log_funding
    log_fund_pred = dt_regressor.predict(sample)[0]
    funding = round(float(np.expm1(log_fund_pred)), 2)

    shap_values  = explainer(sample)
    _shap_arr: np.ndarray = np.asarray(shap_values.values)
    class_1_shap = _shap_arr[0, :, status_code]
    shap_importance = {
        feature: round(float(val), 6)
        for feature, val in zip(FEATURE_ORDER, class_1_shap)
    }

    return {
        "row":                      row_idx,
        "input":                    original_row,
        "predicted_status_code":    status_code,
        "predicted_status_label":   status_label.capitalize(),
        "success_probability":       round(success_prob, 4),
        "failure_probability":       round(failure_prob, 4),
        "risk_tier":                tier,
        "risk_score":               risk_score,
        "decision_threshold":        DECISION_THRESHOLD,
        "forecasted_total_funding": funding,
        "shap_feature_importance":  shap_importance,
    }


# ----------------------------------------------
# Endpoints
# ----------------------------------------------
@app.get("/", summary="Health Check", tags=["General"])
def root():
    return {"message": "StartupVantage API is running"}


@app.post("/predict", summary="Predict Startup Outcome (single JSON or file upload)", tags=["Prediction"])
async def predict(file: UploadFile | None = File(None), data: StartupInput | None = None):
    """
    Predict endpoint that supports either a single JSON payload (StartupInput)
    or a file upload (CSV/Excel) for batch predictions. If a file is provided,
    behavior is identical to the `/upload` endpoint.
    """
    # File upload path (batch)
    if file is not None:
        filename = file.filename or ""
        if not (filename.endswith(".csv") or filename.endswith(".xlsx") or filename.endswith(".xls")):
            raise HTTPException(status_code=400, detail="Unsupported file type.")

        try:
            contents = await file.read()
            buffer = io.BytesIO(contents)

            if filename.endswith(".csv"):
                df = pd.read_csv(buffer)
            else:
                try:
                    df = pd.read_excel(buffer)
                except Exception as e:
                    return {"error": str(e)}

            # Scale pipeline
            scaled = _encode_and_scale(df)

            # Probability-based batch predict
            proba_matrix = rf_classifier.predict_proba(scaled)
            success_probas = proba_matrix[:, 1]
            failure_probas = proba_matrix[:, 0]
            status_codes = (success_probas >= DECISION_THRESHOLD).astype(int)
            status_labels = status_encoder.inverse_transform(status_codes)

            log_fund_preds = dt_regressor.predict(scaled)
            funding_usd = np.round(np.expm1(log_fund_preds), 2)

            shap_values = explainer(scaled)
            _shap_arr: np.ndarray = np.asarray(shap_values.values)
            predictions = []
            for i in range(len(df)):
                class_1_shap = _shap_arr[i, :, status_codes[i]]
                shap_importance = {
                    feature: round(float(val), 6)
                    for feature, val in zip(FEATURE_ORDER, class_1_shap)
                }
                tier, risk_score = _risk_tier(float(failure_probas[i]))
                predictions.append({
                    "row": int(i),
                    "input": df.iloc[i].fillna("").to_dict(),
                    "predicted_status_code": int(status_codes[i]),
                    "predicted_status_label": str(status_labels[i]).capitalize(),
                    "success_probability": round(float(success_probas[i]), 4),
                    "failure_probability": round(float(failure_probas[i]), 4),
                    "risk_tier": tier,
                    "risk_score": risk_score,
                    "decision_threshold": DECISION_THRESHOLD,
                    "forecasted_total_funding": float(funding_usd[i]),
                    "shap_feature_importance": shap_importance,
                })

            return {
                "total_rows": len(predictions),
                "predictions": predictions,
            }
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    # JSON single-sample path (keep original behavior)
    if data is not None:
        try:
            df = pd.DataFrame([data.model_dump()])
            scaled = _encode_and_scale(df)
            preds = _build_prediction(0, scaled[0], data.model_dump())
            return preds
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    # If neither file nor JSON provided, return a 400
    raise HTTPException(status_code=400, detail="No input provided. Send JSON or an uploaded file.")


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

        # Probability-based batch predict
        proba_matrix  = rf_classifier.predict_proba(scaled)   # shape (N, 2)
        success_probas = proba_matrix[:, 1]                   # P(success) per row
        failure_probas = proba_matrix[:, 0]                   # P(failure) per row
        status_codes   = (success_probas >= DECISION_THRESHOLD).astype(int)
        status_labels  = status_encoder.inverse_transform(status_codes)

        log_fund_preds = dt_regressor.predict(scaled)
        funding_usd    = np.round(np.expm1(log_fund_preds), 2)

        # SHAP batch predict
        shap_values = explainer(scaled)

        _shap_arr: np.ndarray = np.asarray(shap_values.values)
        predictions = []
        for i in range(len(df)):
            class_1_shap = _shap_arr[i, :, status_codes[i]]
            shap_importance = {
                feature: round(float(val), 6)
                for feature, val in zip(FEATURE_ORDER, class_1_shap)
            }
            tier, risk_score = _risk_tier(float(failure_probas[i]))
            predictions.append({
                "row":                      int(i),
                "input":                    df.iloc[i].fillna("").to_dict(),
                "predicted_status_code":    int(status_codes[i]),
                "predicted_status_label":   str(status_labels[i]).capitalize(),
                "success_probability":       round(float(success_probas[i]), 4),
                "failure_probability":       round(float(failure_probas[i]), 4),
                "risk_tier":                tier,
                "risk_score":               risk_score,
                "decision_threshold":        DECISION_THRESHOLD,
                "forecasted_total_funding": float(funding_usd[i]),
                "shap_feature_importance":  shap_importance,
            })

        return {
            "total_rows":  len(predictions),
            "predictions": predictions,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
