"""
train.py - Startup Success Prediction (Binary Classification)
-------------------------------------------------------------
Binary classification model for startup failure prediction:
  - Target: 0=failure (closed), 1=success (acquired/ipo/operating)
  - Focus: Improve failure detection and reduce success bias
  - Features: funding, age, market, country frequency
  - Imbalance handling: class_weight instead of SMOTE
  - Model: RandomForestClassifier with balanced weights

Outputs:
  - best_classifier.pkl  : Trained RandomForestClassifier
  - dt_regressor.pkl     : DecisionTreeRegressor (funding prediction)
  - min_max_scaler.pkl   : Fitted MinMaxScaler
"""

import os
import warnings
import numpy as np
import pandas as pd
import joblib

from sklearn.preprocessing import LabelEncoder, MinMaxScaler
from sklearn.ensemble import RandomForestClassifier
from sklearn.tree import DecisionTreeRegressor
from sklearn.metrics import (
    accuracy_score, f1_score, r2_score,
    confusion_matrix, classification_report,
)
from sklearn.model_selection import (
    train_test_split, cross_val_score,
    StratifiedKFold,
)

# Suppress noisy joblib/sklearn parallelism warnings
warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)

CURRENT_YEAR = 2025

print("=" * 60)
print("   AI Startup Success Predictor -- Advanced Training Pipeline")
print("=" * 60)

# ----------------------------------------------------------
# 1. Load dataset
# ----------------------------------------------------------
print("\n[1] Loading dataset ...")

for candidate in ["big_startup_success_dataset.csv", "dataset.csv", "dataset.csv.csv"]:
    if os.path.exists(candidate):
        CSV_PATH = candidate
        break
else:
    raise FileNotFoundError(
        "Could not find dataset file in: " + os.getcwd()
    )

df = pd.read_csv(CSV_PATH)
print(f"    [OK] Loaded '{CSV_PATH}'  --  shape: {df.shape}")

# ----------------------------------------------------------
# 2. Convert to binary classification
# ----------------------------------------------------------
print("\n[2] Converting to binary classification ...")
print(f"    Original status distribution: {df['status'].value_counts().to_dict()}")

# Convert to binary: 0=failure (closed), 1=success (acquired/ipo/operating)
df['status'] = df['status'].map({
    'closed': 0,      # failure
    'acquired': 1,    # success
    'ipo': 1,         # success
    'operating': 1    # success
}).astype(float) # allow NaN momentarily if any

df = df.dropna(subset=['status'])
df['status'] = df['status'].astype(int)

print(f"    Binary status distribution: {df['status'].value_counts().to_dict()}")
if 1 in df['status'].values and 0 in df['status'].values:
    print(f"    Class ratio: {df['status'].value_counts()[0] / df['status'].value_counts()[1]:.2f} (failure:success)")

# ----------------------------------------------------------
# 3. Select required columns
# ----------------------------------------------------------
print("\n[3] Selecting required columns ...")
REQUIRED_COLS = [
    "status",
    "country_code",
    "category_list",
    "funding_rounds",
    "funding_total_usd",
    "founded_at",
]
# Missing cols will be dropped or raise Error, let's keep only what's available
available_cols = [c for c in REQUIRED_COLS if c in df.columns]
df = df[available_cols].copy()

# ----------------------------------------------------------
# 4. Extract primary market category
# ----------------------------------------------------------
print("\n[4] Extracting primary market from 'category_list' ...")
if "category_list" in df.columns:
    df.rename(columns={"category_list": "market"}, inplace=True)
    df["market"] = (
        df["market"].astype(str)
        .str.split("|").str[0]
        .str.strip()
        .replace("nan", np.nan)
    )
    print(f"    Unique primary markets : {df['market'].nunique()}")

# ----------------------------------------------------------
# 5. Parse founded_at and fix startup_age (0-50 range)
# ----------------------------------------------------------
print("\n[5] Parsing 'founded_at' -> 'founded_year' ...")
if "founded_at" in df.columns:
    df["founded_year"] = pd.to_datetime(df["founded_at"], errors="coerce").dt.year
    before = len(df)
    df.dropna(subset=["founded_year"], inplace=True)
    df["founded_year"] = df["founded_year"].astype(int)

    # Calculate startup_age and filter to 0-50 range
    df["startup_age"] = CURRENT_YEAR - df["founded_year"]
    age_before = len(df)
    df = df[(df["startup_age"] >= 0) & (df["startup_age"] <= 50)].copy()
    df.drop(columns=["founded_at"], inplace=True)

    print(f"    Dropped {before - age_before} rows with un-parseable dates")
    print(f"    Dropped {age_before - len(df)} rows with age outside 0-50 range")
    print(f"    Kept {len(df)} rows, age range: {df['startup_age'].min()}-{df['startup_age'].max()}")

# ----------------------------------------------------------
# 6. Clean funding_total_usd
# ----------------------------------------------------------
print("\n[6] Cleaning 'funding_total_usd' ...")
if "funding_total_usd" in df.columns:
    df["funding_total_usd"] = (
        df["funding_total_usd"].astype(str)
        .str.replace("$", "", regex=False)
        .str.replace(",", "", regex=False)
        .str.strip()
        .replace({"-": "nan", "": "nan"})
    )
    df["funding_total_usd"] = pd.to_numeric(df["funding_total_usd"], errors="coerce")

    # Fill missing values with median (more robust than mean)
    funding_median = df["funding_total_usd"].median()
    df["funding_total_usd"] = df["funding_total_usd"].fillna(funding_median)

    print(f"    dtype         : {df['funding_total_usd'].dtype}")
    print(f"    NaN remaining : {df['funding_total_usd'].isnull().sum()}")
    print(f"    Fill value    : {funding_median:,.2f}")
    print("    [OK] Clean.")

# ----------------------------------------------------------
# 7. Handle remaining missing values
# ----------------------------------------------------------
print("\n[7] Handling remaining missing values ...")
if "funding_rounds" in df.columns:
    df["funding_rounds"] = pd.to_numeric(df["funding_rounds"], errors='coerce').fillna(0)
if "country_code" in df.columns:
    df["country_code"] = df["country_code"].fillna("UNK")
if "market" in df.columns:
    df["market"] = df["market"].fillna("Unknown")
print("    [OK] Missing-value handling complete.")

# ----------------------------------------------------------
# 8. Advanced Feature Engineering
# ----------------------------------------------------------
print("\n[8] Advanced feature engineering ...")

# 8a. log_funding (log transformation of funding)
if "funding_total_usd" in df.columns:
    df["log_funding"] = np.log1p(df["funding_total_usd"])
    print(f"    log_funding   -- created via log1p(funding_total_usd)")

# 8b. funding_per_round (funding efficiency)
if "funding_total_usd" in df.columns and "funding_rounds" in df.columns:
    df["funding_per_round"] = df["funding_total_usd"] / (df["funding_rounds"] + 1)
    print(f"    funding_per_round -- funding_total_usd / (funding_rounds + 1)")

# 8c. country frequency encoding
if "country_code" in df.columns:
    country_freq = df["country_code"].value_counts(normalize=True)
    df["country_freq"] = df["country_code"].map(country_freq)
    print(f"    country_freq  -- min={df['country_freq'].min():.5f}, "
          f"max={df['country_freq'].max():.5f}")

print("    [OK] Feature engineering complete.")

# ----------------------------------------------------------
# 9. Encode categorical columns
# ----------------------------------------------------------
print("\n[9] Label-encoding categorical columns ...")
le_status  = LabelEncoder()
le_market  = LabelEncoder()
le_country = LabelEncoder()

df["status"]       = le_status.fit_transform(df["status"].astype(str))
df["market"]       = le_market.fit_transform(df["market"].astype(str))
df["country_code"] = le_country.fit_transform(df["country_code"].astype(str))
# country_code -> frequency encoding already created; drop raw columns

if "founded_year" in df.columns:
    df.drop(columns=["founded_year"], inplace=True)
if "funding_total_usd" in df.columns:
    df.drop(columns=["funding_total_usd"], inplace=True)
if "country_code" in df.columns:
    df.drop(columns=["country_code"], inplace=True)
    
print("    [OK] Encoded: status, market, country_code")
print(f"    Status classes  : {list(le_status.classes_)}")
print(f"    Country classes : {le_country.classes_.shape[0]} unique values")

# ----------------------------------------------------------
# 10. Define features & targets
# ----------------------------------------------------------
print("\n[10] Defining features (X) and targets (y) ...")

FEATURE_COLS = [
    "market",           # label-encoded primary category
    "funding_rounds",   # raw count
    "startup_age",      # years since founding
    "country_freq",     # frequency-encoded country
    "log_funding",      # log1p of funding amount
    "funding_per_round" # funding per round
]
# ensure all features exist
FEATURE_COLS = [f for f in FEATURE_COLS if f in df.columns]

X       = df[FEATURE_COLS].copy()
y_class = df["status"].copy()
y_reg   = df["log_funding"].copy()   # regressor predicts log_funding

print(f"    Features : {FEATURE_COLS}")
print(f"    Samples  : {len(X)}")

# ----------------------------------------------------------
# 11. Scale features
# ----------------------------------------------------------
print("\n[11] Applying MinMaxScaler ...")
scaler   = MinMaxScaler()
X_scaled = scaler.fit_transform(X)
print("    [OK] Scaling complete.")

# ----------------------------------------------------------
# 12. Stratified train / test split
# ----------------------------------------------------------
print("\n[12] Stratified 80/20 train-test split ...")
X_train, X_test, y_clf_train, y_clf_test = train_test_split(
    X_scaled, y_class,
    test_size=0.2,
    random_state=42,
    stratify=y_class,
)
_, _, y_reg_train, y_reg_test = train_test_split(
    X_scaled, y_reg,
    test_size=0.2,
    random_state=42,
    stratify=y_class,
)

print(f"    Train: {len(X_train)} samples  |  Test: {len(X_test)} samples")

# ----------------------------------------------------------
# 13. Train RandomForestClassifier to prioritize FAILURE recall
#     Using class_weight={0: 3, 1: 1} to explicitly balance training
# ----------------------------------------------------------
print("\n[13] Training RandomForestClassifier with Custom Class Weights ...")
print("     n_estimators=500 | max_depth=20 | min_samples_split=2")
print("     class_weight={0: 50, 1: 1} targetting improved 'failure' recall")

# Class 0: failure (closed), Class 1: success
class_weights = {0: 50, 1: 1} # Give 50x penalty for misclassifying failure

best_clf  = RandomForestClassifier(
    n_estimators=500,
    max_depth=20,
    min_samples_split=2,
    class_weight=class_weights,
    random_state=42,
    n_jobs=-1,
)
best_clf.fit(X_train, y_clf_train)
best_name = "RandomForestClassifier"
print("    [OK] Classifier trained.")

# ----------------------------------------------------------
# 14. Train regression model (unchanged)
# ----------------------------------------------------------
print("\n[14] Training DecisionTreeRegressor ...")
dt_reg = DecisionTreeRegressor(max_depth=10, random_state=42)
dt_reg.fit(X_train, y_reg_train)
print("    [OK] Regressor trained.")

# ----------------------------------------------------------
# 15. Evaluate  -- test set
# ----------------------------------------------------------
print("\n[15] Evaluating best classifier on hold-out test set ...")

y_clf_pred_test  = best_clf.predict(X_test)
y_clf_pred_train = best_clf.predict(X_train)   # for overfitting check

acc_test  = accuracy_score(y_clf_test, y_clf_pred_test)
f1_test   = f1_score(y_clf_test, y_clf_pred_test, average="weighted", zero_division=0)
acc_train = accuracy_score(y_clf_train, y_clf_pred_train)
f1_train  = f1_score(y_clf_train, y_clf_pred_train, average="weighted", zero_division=0)

y_reg_pred = dt_reg.predict(X_test)
r2 = r2_score(y_reg_test, y_reg_pred)

cm_labels = le_status.classes_ # It's ['0', '1']

# -- Core metrics ------------------------------------------
print("\n" + "=" * 60)
print(f"  Model                   : {best_name}")
print("  Params                  : n_estimators=500 | class_weight={0:50, 1:1}")
print("-" * 60)
print(f"  Train Accuracy          : {acc_train:.4f}")
print(f"  Test  Accuracy          : {acc_test:.4f}")
overfit_gap = acc_train - acc_test
print(f"  Overfit gap (train-test): {overfit_gap:+.4f}  "
      f"{'[!] possible overfit' if overfit_gap > 0.08 else '[OK] acceptable'}")
print("-" * 60)
print(f"  Train F1  (weighted)    : {f1_train:.4f}")
print(f"  Test  F1  (weighted)    : {f1_test:.4f}")
print(f"  Regression R2 Score     : {r2:.4f}")
print("=" * 60)

# -- Confusion Matrix --------------------------------------
print("\n[15a] Confusion Matrix (rows=actual, cols=predicted):")
cm = confusion_matrix(y_clf_test, y_clf_pred_test)
print(f"      Labels : {list(cm_labels)} (0=Failure, 1=Success)")
col_w = max(len(str(label)) for label in cm_labels) + 2
header = " " * (col_w + 6) + "  ".join(f"{str(label):>{col_w}}" for label in cm_labels)
print(f"      {header}")
for label, row in zip(cm_labels, cm):
    print(f"      {str(label):<{col_w + 4}}  " +
          "  ".join(f"{v:>{col_w}}" for v in row))

# -- Classification Report ---------------------------------
print("\n[15b] Classification Report:")
print(classification_report(
    y_clf_test, y_clf_pred_test,
    target_names=[str(c) for c in cm_labels],
    zero_division=0,
))

# -- Feature Importances -----------------------------------
print("[15c] Feature Importances:")
importances = best_clf.feature_importances_
sorted_idx  = np.argsort(importances)[::-1]
for i in sorted_idx:
    bar = "|" * int(importances[i] * 40)
    print(f"      {FEATURE_COLS[i]:<18}  {importances[i]:.4f}  {bar}")


# ----------------------------------------------------------
# 16. Save artefacts
# ----------------------------------------------------------
print("\n[16] Saving model artefacts ...")
joblib.dump(best_clf,  "best_classifier.pkl")
joblib.dump(dt_reg,    "dt_regressor.pkl")
joblib.dump(scaler,    "min_max_scaler.pkl")
joblib.dump(le_country, "country_encoder.pkl")
joblib.dump(le_market,  "market_encoder.pkl")
joblib.dump(le_status,  "status_encoder.pkl")

print("     [OK] best_classifier.pkl  saved.")
print("     [OK] dt_regressor.pkl     saved.")
print("     [OK] min_max_scaler.pkl   saved.")
print("     [OK] country_encoder.pkl  saved.")
print("     [OK] market_encoder.pkl   saved.")
print("     [OK] status_encoder.pkl   saved.")
print("\n[DONE] Advanced training pipeline complete!\n")
