"""
Debug script to trace why all predictions are the same
"""
import pandas as pd
import numpy as np
import joblib

# Load models and encoders
print("Loading models...")
rf_classifier = joblib.load("best_classifier.pkl")
dt_regressor = joblib.load("dt_regressor.pkl")
min_max_scaler = joblib.load("min_max_scaler.pkl")
country_encoder = joblib.load("country_encoder.pkl")
market_encoder = joblib.load("market_encoder.pkl")
status_encoder = joblib.load("status_encoder.pkl")

print(f"Market encoder classes: {market_encoder.classes_}")
print(f"Country encoder classes: {country_encoder.classes_}")
print(f"Status encoder classes: {status_encoder.classes_}")
print()

# Load sample test data
print("Loading test data...")
test_df = pd.read_csv("test_ds.csv").head(10)
print(test_df)
print()

# Define feature order
FEATURE_ORDER = [
    "market",
    "funding_rounds",
    "funding_bucket",
    "startup_age",
    "country_freq",
    "log_funding",
]

CURRENT_YEAR = 2025

# Build country frequency map
print("Building country frequency map...")
temp_df = pd.read_csv("dataset.csv", usecols=["country_code"])
country_freq_map = temp_df["country_code"].value_counts(normalize=True).to_dict()
print(f"Country freq map keys: {list(country_freq_map.keys())[:10]}")
print()

# Simple country name to code mapping for test data
country_name_to_code = {
    "USA": "USA",
    "China": "CHN", 
    "United States": "USA",
    "UK": "GBR",
    "United Kingdom": "GBR",
    "Canada": "CAN",
    "India": "IND",
    "Germany": "DEU",
    "France": "FRA",
    "Israel": "ISR",
    "Spain": "ESP",
    "Australia": "AUS",
    # Add more as needed
}

def _map_country_freq(code):
    # First try to map country name to code
    if isinstance(code, str):
        code = country_name_to_code.get(code, code)
    
    if isinstance(code, str) and code in country_freq_map:
        return country_freq_map[code]
    try:
        if isinstance(code, (int, float)):
            decoded = str(country_encoder.inverse_transform([int(code)])[0])
            if decoded in country_freq_map:
                return country_freq_map[decoded]
    except Exception as e:
        print(f"Error decoding {code}: {e}")
    # Default to global mean instead of fixed 0.0001 (same as main.py)
    default_freq = np.mean(list(country_freq_map.values())) if country_freq_map else 0.001
    print(f"WARNING: Country '{code}' not in map, using mean default {default_freq:.6f}")
    return default_freq

# Process first 5 rows
print("Processing test rows...\n")
for idx in range(min(5, len(test_df))):
    row = test_df.iloc[idx]
    print(f"=== ROW {idx} ===")
    print(f"Input: {row}")
    
    df_row = pd.DataFrame([row])
    df_row = df_row.copy()
    
    # Map alternate column names to standard format (same as main.py)
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
    df_row = df_row.rename(columns=column_mapping)
    
    # Fill defaults
    if "founded_year" not in df_row.columns:
        df_row["founded_year"] = CURRENT_YEAR
    if "funding_total_usd" not in df_row.columns:
        df_row["funding_total_usd"] = 0
    if "funding_rounds" not in df_row.columns:
        df_row["funding_rounds"] = 0
    if "country_code" not in df_row.columns:
        df_row["country_code"] = "USA"
    if "market" not in df_row.columns:
        df_row["market"] = "Unknown"
    
    print(f"After extraction: market={df_row['market'].iloc[0]}, founded_year={df_row['founded_year'].iloc[0]}")
    
    # Create features
    df_row["startup_age"] = CURRENT_YEAR - df_row["founded_year"]
    df_row["funding_bucket"] = pd.cut(
        df_row["funding_rounds"],
        bins=[-np.inf, 1, 4, np.inf],
        labels=[0, 1, 2],
    ).astype(int)
    df_row["country_freq"] = df_row["country_code"].apply(_map_country_freq)
    print(f"Country code: '{df_row['country_code'].iloc[0]}' -> freq: {df_row['country_freq'].iloc[0]}")
    df_row["log_funding"] = np.log1p(df_row["funding_total_usd"])
    
    print(f"After engineering: startup_age={df_row['startup_age'].iloc[0]}, funding_bucket={df_row['funding_bucket'].iloc[0]}, country_freq={df_row['country_freq'].iloc[0]}, log_funding={df_row['log_funding'].iloc[0]}")
    
    # Encode market
    market_val = str(df_row["market"].iloc[0])
    print(f"Market string: '{market_val}'")
    print(f"Is in encoder classes: {market_val in market_encoder.classes_}")
    
    if market_val in market_encoder.classes_:
        encoded_market = market_encoder.transform([market_val])[0]
        print(f"Encoded market: {encoded_market}")
    else:
        # Use median of valid codes for unknown markets (same as main.py)
        valid_codes = [market_encoder.transform([str(c)])[0] for c in market_encoder.classes_]
        default_market_code = int(np.median(valid_codes)) if valid_codes else 0
        print(f"WARNING: Market '{market_val}' not in encoder, using median default {default_market_code}")
        encoded_market = default_market_code
    
    df_row["market"] = encoded_market
    
    # Select features
    feature_df = df_row[FEATURE_ORDER].astype(float)
    print(f"Features before scaling: {feature_df.iloc[0].to_dict()}")
    
    # Scale
    scaled = min_max_scaler.transform(feature_df)
    print(f"Features after scaling: {scaled[0]}")
    
    # Predict
    status_code = rf_classifier.predict(scaled)[0]
    status_label = status_encoder.inverse_transform([status_code])[0]
    
    log_fund_pred = dt_regressor.predict(scaled)[0]
    funding = np.expm1(log_fund_pred)
    
    print(f"Prediction: status={status_label} (code={status_code}), funding={funding:.2f}")
    print()
