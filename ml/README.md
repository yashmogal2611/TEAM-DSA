# Personalized Loan Recommendation System — ML Work Documentation

## 1. Project Overview

The goal of this project is to build an **ML-driven Personalized Loan Recommendation System**.

Instead of simply asking whether a customer should receive a loan, the system follows a complete decision pipeline:

1. Validate customer input.
2. Clean and normalize the data.
3. Create derived financial and behavioral features.
4. Check hard eligibility rules.
5. Predict the customer's **Probability of Default (PD)** using an ML model.
6. Convert the risk prediction into a risk band.
7. Generate compatible loan-product candidates.
8. Calculate a personalized interest rate.
9. Calculate EMI and total loan cost.
10. Remove offers that the customer cannot afford.
11. Score the remaining offers on multiple dimensions.
12. Rank the offers according to the customer's preference.
13. Generate human-readable explanations.
14. Return the final recommendations through a FastAPI endpoint.

The ML component therefore goes beyond a simple classifier. It combines:

- Supervised ML
- Feature engineering
- Business-rule eligibility
- Risk scoring
- Pricing logic
- Affordability calculation
- Multi-objective recommendation scoring
- Ranking
- Explainability

---

# 2. High-Level Architecture

```text
                         CUSTOMER
                            |
                            v
                  POST /api/v1/recommend
                            |
                            v
              +-------------------------+
              |  Input Validation        |
              |  Pydantic + Validator    |
              +------------+------------+
                           |
                           v
              +-------------------------+
              | Data Preprocessing       |
              | Cleaning / Normalization |
              +------------+------------+
                           |
                           v
              +-------------------------+
              | Feature Engineering      |
              | Ratios / Bands / Flags    |
              +------------+------------+
                           |
                           v
              +-------------------------+
              | Eligibility Engine       |
              | Hard Business Rules      |
              +------------+------------+
                           |
                 Eligible?|
                  +-------+-------+
                  |               |
                 NO              YES
                  |               |
                  v               v
             REJECTED      +----------------+
                           | Risk Model     |
                           | XGBoost        |
                           +-------+--------+
                                   |
                                   v
                         Probability of Default
                                   |
                                   v
                         LOW / MEDIUM / HIGH
                                   |
                                   v
                      +-----------------------+
                      | Candidate Generation  |
                      +-----------+-----------+
                                  |
                                  v
                      +-----------------------+
                      | Pricing Engine        |
                      | Rate + EMI + Cost     |
                      +-----------+-----------+
                                  |
                                  v
                      +-----------------------+
                      | Affordability Engine  |
                      | FOIR-based filtering  |
                      +-----------+-----------+
                                  |
                                  v
                      +-----------------------+
                      | Recommendation        |
                      | Scoring                |
                      +-----------+-----------+
                                  |
                                  v
                      +-----------------------+
                      | Ranking Engine        |
                      | Top-N Offers          |
                      +-----------+-----------+
                                  |
                                  v
                      +-----------------------+
                      | Explainability        |
                      | SHAP / Rule-based     |
                      +-----------+-----------+
                                  |
                                  v
                         FINAL JSON RESPONSE
```

---

# 3. Project Structure

```text
ml/
│
├── config.yaml
├── main.py
├── requirements.txt
├── README.md
│
├── data/
│   └── raw/
│       └── loan_products.json
│
├── models/
│   └── risk_model/
│       ├── risk_model.joblib
│       └── preprocessor.joblib
│
└── src/
    │
    ├── api/
    │   ├── routes.py
    │   └── schemas.py
    │
    ├── data/
    │   ├── loader.py
    │   ├── preprocessing.py
    │   └── validator.py
    │
    ├── features/
    │   ├── feature_engineering.py
    │   └── feature_pipeline.py
    │
    ├── eligibility/
    │   └── eligibility_engine.py
    │
    ├── risk/
    │   ├── train.py
    │   └── predict.py
    │
    ├── pricing/
    │   └── pricing_engine.py
    │
    ├── affordability/
    │   └── affordability_engine.py
    │
    ├── recommendation/
    │   ├── candidate_generation.py
    │   ├── scoring.py
    │   └── ranking.py
    │
    └── explainability/
        └── explanation_builder.py
```

---

# 4. Input Data

The API accepts customer information covering four major areas.

## Personal Information

- Age
- City

## Employment Information

- Employment type
- Income type
- Monthly income
- Total work experience
- Current employment duration

## Existing Financial Obligations

- Existing monthly EMI
- Number of active loans
- Credit-card outstanding amount

## Credit Information

- Credit score

## Loan Request

- Requested loan amount
- Preferred tenure
- Loan purpose
- Primary preference

Example:

```json
{
  "age": 30,
  "city": "Pune",
  "employment_type": "SALARIED",
  "income_type": "FIXED",
  "monthly_income": 75000,
  "total_work_experience": 6,
  "current_employment_duration": 2,
  "existing_monthly_emi": 10000,
  "number_of_active_loans": 1,
  "credit_card_outstanding": 20000,
  "credit_score": 760,
  "requested_loan_amount": 1000000,
  "preferred_tenure_months": 36,
  "loan_purpose": "HOME_RENOVATION",
  "primary_preference": "LOWEST_EMI"
}
```

---

# 5. Why These Inputs Matter

The system needs different inputs for different modules.

| Input | Main purpose |
|---|---|
| Age | Eligibility and risk |
| Monthly income | Eligibility, affordability and risk |
| Existing EMI | Debt burden and affordability |
| Active loans | Risk and eligibility |
| Credit-card outstanding | Risk and financial burden |
| Credit score | Eligibility, risk and pricing |
| Employment type | Candidate filtering and risk |
| Income type | Risk |
| Work experience | Risk |
| Current employment duration | Eligibility and risk |
| Loan amount | Candidate generation, pricing and recommendation |
| Tenure | Pricing, affordability and recommendation |
| Loan purpose | Risk and product selection |
| City | Product availability |
| Primary preference | Final ranking |

---

# 6. Understanding `default_flag`

The training dataset uses:

```text
default_flag
```

as the **target variable**.

It represents whether a historical borrower defaulted on the loan.

```text
default_flag = 0  -> No Default
default_flag = 1  -> Default
```

Therefore, this is a **binary classification problem**.

The model learns:

```text
Customer features
       |
       v
Historical repayment behavior
       |
       v
default_flag
```

For example:

```text
credit_score = 780
income = 80000
existing_emi = 10000
active_loans = 1
...
        |
        v
default_flag = 0
```

Another historical borrower might have:

```text
credit_score = 580
income = 30000
existing_emi = 18000
active_loans = 5
...
        |
        v
default_flag = 1
```

The model learns statistical relationships between these customer characteristics and the target.

## Important distinction

`default_flag` is **not an input from the new customer**.

It is the label used during training.

During inference:

```text
Customer input
      |
      v
ML model
      |
      v
Probability of Default
```

The new customer does not provide `default_flag`.

---

# 7. How Default Affects the Model

The model learns which combinations of features are associated with historical defaults.

For example, it may learn that:

- Higher credit score tends to reduce default probability.
- Higher existing EMI burden tends to increase default probability.
- More active loans may increase risk.
- Higher stable income may reduce risk.
- Certain employment/income patterns may correlate with different risk levels.

These are learned statistically by the ML model rather than being manually hard-coded.

The prediction is:

```text
P(default = 1 | customer_features)
```

For example:

```text
PD = 0.03
```

means an estimated **3% probability of default** according to the trained model.

It does NOT mean:

> This customer will definitely default.

It means:

> Based on the patterns learned from the historical training data, the model estimates a 3% probability of default.

---

# 8. Risk Model Training Pipeline

The risk model is implemented in:

```text
src/risk/train.py
```

The current implementation uses:

```text
XGBoost Classifier
```

with probability calibration.

The training flow is:

```text
Training CSV
    |
    v
Load Data
    |
    v
Validate Columns
    |
    v
Separate X and y
    |
    +--------------------+
    |                    |
    v                    v
Features             default_flag
    |                    |
    v                    v
Preprocessing        Target
    |
    v
Train/Test Split
    |
    v
5-Fold Cross Validation
    |
    v
XGBoost
    |
    v
Isotonic Calibration
    |
    v
Evaluation
    |
    v
Save Model
```

---

# 9. Features Used by the Risk Model

The current risk model uses these numerical features:

```text
age
monthly_income
existing_monthly_emi
existing_emi_ratio
loan_to_annual_income
credit_score
number_of_active_loans
credit_card_outstanding
total_work_experience
current_employment_duration
```

Categorical features:

```text
employment_type
income_type
loan_purpose
```

Target:

```text
default_flag
```

---

# 10. Preprocessing

The model uses a `ColumnTransformer`.

## Numerical Features

Numerical features are standardized using:

```text
StandardScaler
```

Conceptually:

```text
scaled_value = (value - mean) / standard_deviation
```

## Categorical Features

Categorical features are converted using:

```text
OneHotEncoder(handle_unknown="ignore")
```

For example:

```text
employment_type = SALARIED
```

can become something similar to:

```text
employment_type_SALARIED = 1
employment_type_SELF_EMPLOYED = 0
...
```

The preprocessing object is saved separately:

```text
models/risk_model/preprocessor.joblib
```

This is important because the exact same preprocessing must be used during inference.

---

# 11. XGBoost Risk Model

The current XGBoost configuration includes:

```text
n_estimators = 400
max_depth = 4
learning_rate = 0.05
subsample = 0.8
colsample_bytree = 0.8
min_child_weight = 5
gamma = 1.0
reg_alpha = 0.1
reg_lambda = 1.0
```

The model also calculates:

```text
scale_pos_weight = number_of_negative_samples / number_of_positive_samples
```

This helps handle class imbalance when defaults are less frequent than non-defaults.

---

# 12. Train/Test Split

The data is divided using a stratified split:

```text
80% -> Training
20% -> Testing
```

with:

```text
stratify = y
```

This helps preserve the proportion of:

```text
default = 0
default = 1
```

in both sets.

---

# 13. Cross Validation

A 5-fold stratified cross-validation is also performed.

Purpose:

- Estimate model stability.
- Reduce dependence on one train/test split.
- Obtain a more reliable ROC-AUC estimate.

Metric:

```text
ROC-AUC
```

---

# 14. Probability Calibration

The system optionally uses:

```text
CalibratedClassifierCV
method = isotonic
```

This is particularly useful because our downstream system uses the predicted probability for:

- Risk banding
- Risk fit scoring
- Personalized pricing

The model therefore should produce meaningful probabilities, not only class labels.

---

# 15. Risk Model Evaluation

The training pipeline calculates:

### ROC-AUC

Measures how well the model separates defaulters from non-defaulters.

Higher is better.

### Average Precision

Useful when the positive class is relatively rare.

### Brier Score

Measures probability quality.

Lower is better.

### Confusion Matrix

Shows:

```text
                 Predicted
              No Default  Default

Actual
No Default       TN          FP
Default          FN          TP
```

### Classification Report

Includes:

- Precision
- Recall
- F1-score
- Support

The system also performs a calibration check comparing predicted probabilities against observed default rates.

---

# 16. Saved ML Artifacts

After training, two important artifacts are saved:

```text
models/risk_model/risk_model.joblib
models/risk_model/preprocessor.joblib
```

The first contains the trained risk model.

The second contains the fitted preprocessing pipeline.

Inference loads both.

---

# 17. Feature Engineering

Feature engineering is implemented in:

```text
src/features/feature_engineering.py
```

The system derives additional information from the raw customer input.

## Annual Income

```text
annual_income = monthly_income × 12
```

## Existing EMI Ratio

```text
existing_emi_ratio =
existing_monthly_emi / monthly_income
```

Example:

```text
income = ₹75,000
existing EMI = ₹15,000

EMI ratio = 15,000 / 75,000
          = 0.20
          = 20%
```

This tells us how much of the income is already committed to EMIs.

## Loan-to-Annual-Income

```text
loan_to_annual_income =
requested_loan_amount / annual_income
```

## Credit-Card-to-Income Ratio

```text
cc_to_income_ratio =
credit_card_outstanding / monthly_income
```

---

# 18. Income Segmentation

Customers are divided into income segments:

```text
LOW
MEDIUM
HIGH
PREMIUM
```

Current configured boundaries:

```text
LOW       <= ₹30,000
MEDIUM    = ₹30,001 - ₹75,000
HIGH      = ₹75,001 - ₹2,00,000
PREMIUM   > ₹2,00,000
```

---

# 19. Credit Band

The system also derives:

```text
EXCELLENT
VERY_GOOD
GOOD
FAIR
POOR
VERY_POOR
```

based on the credit score.

Example:

```text
800+    -> EXCELLENT
750-799 -> VERY_GOOD
700-749 -> GOOD
650-699 -> FAIR
600-649 -> POOR
<600    -> VERY_POOR
```

---

# 20. Interaction Features

The system creates additional combined features.

### Credit-Income Composite

```text
credit_income_composite =
(credit_score / 900) × (monthly_income / 100000)
```

This combines credit strength and income strength.

### Debt Burden Index

```text
debt_burden_index =
(existing_emi / income) × (1 + 0.1 × active_loans)
```

This combines:

- EMI burden
- Number of active loans

---

# 21. Boolean / Segment Flags

Additional flags include:

```text
is_high_emi_burden
is_thin_file
is_long_tenured
is_stable_employment
```

Examples:

```text
is_high_emi_burden = 1
```

if existing EMI ratio is greater than 40%.

```text
is_thin_file = 1
```

if the customer has no active loans and no credit-card outstanding.

---

# 22. Important Model Feature Design

Although feature engineering creates many derived fields, the current saved risk model is trained using the explicitly configured feature list:

```text
10 numerical features
+
3 categorical features
=
13 model input features
```

The extra engineered features are currently available to the broader pipeline, but they are not automatically part of the XGBoost training matrix unless they are added to the configured model feature lists and the model is retrained.

This distinction is important to maintain during future improvements.

---

# 23. Eligibility Engine

Eligibility is different from ML risk prediction.

The eligibility engine contains **hard business rules**.

It is implemented in:

```text
src/eligibility/eligibility_engine.py
```

Current rules include:

```text
Age: 21 - 65
Minimum monthly income: ₹20,000
Minimum credit score: 600
Minimum current employment duration: 6 months
Maximum existing EMI ratio: 65%
Maximum active loans: 5
```

---

# 24. Why Eligibility and ML Risk Are Separate

The two concepts should not be confused.

### Eligibility

Answers:

> Does the customer satisfy the minimum policy requirements?

### Risk Model

Answers:

> Given the customer's characteristics, how likely is default?

Example:

```text
Customer credit score = 620

Eligibility:
PASS because minimum = 600

Risk:
Could still be MEDIUM or HIGH
```

Therefore:

```text
Eligibility PASS
        does not mean
Low Risk
```

The customer can be eligible but still have elevated risk.

---

# 25. Risk Prediction

The inference code is:

```text
src/risk/predict.py
```

The model outputs:

```text
probability_of_default
```

Then the probability is converted into a risk band.

Current thresholds:

```text
PD < 0.05       -> LOW
0.05 <= PD < 0.15 -> MEDIUM
PD >= 0.15      -> HIGH
```

Example:

```text
PD = 0.03 -> LOW
PD = 0.10 -> MEDIUM
PD = 0.25 -> HIGH
```

The system also returns:

```text
risk_score = 1 - probability_of_default
```

---

# 26. Why Risk Band Is Needed

The raw probability is useful for ML, but business modules need a simpler representation.

Therefore:

```text
Probability of Default
        |
        v
Risk Band
        |
        +----> Pricing
        |
        +----> Recommendation scoring
        |
        +----> Explanation
```

---

# 27. Personalized Pricing

Pricing is implemented in:

```text
src/pricing/pricing_engine.py
```

The system starts with a product's base interest rate.

Then a risk premium is applied.

Current configuration:

```text
LOW       -> +0.0%
MEDIUM    -> +2.0%
HIGH      -> +4.0%
```

Example:

```text
Base rate = 10.5%

LOW risk:
10.5 + 0.0 = 10.5%

MEDIUM risk:
10.5 + 2.0 = 12.5%

HIGH risk:
10.5 + 4.0 = 14.5%
```

This creates a connection between ML risk prediction and loan pricing.

---

# 28. EMI Calculation

The system uses the standard reducing-balance EMI formula.

Conceptually:

```text
EMI = P × r × (1+r)^n / ((1+r)^n - 1)
```

where:

```text
P = principal
r = monthly interest rate
n = tenure in months
```

The system calculates:

- Monthly EMI
- Total repayment
- Total interest
- Processing fee

---

# 29. Loan Product Catalogue

Loan products are stored in:

```text
data/raw/loan_products.json
```

The current catalogue includes different categories such as:

```text
PERSONAL_LOAN
HOME_LOAN
EDUCATION_LOAN
MEDICAL_LOAN
```

Each product contains information such as:

```text
product_id
product_name
lender_name
loan_type
loan_purposes
base_interest_rate
min_loan_amount
max_loan_amount
min_tenure_months
max_tenure_months
processing_fee_pct
allowed_employment_types
min_credit_score
min_monthly_income
serviceable_cities
```

---

# 30. Candidate Generation

Candidate generation is implemented in:

```text
src/recommendation/candidate_generation.py
```

It performs fast pre-filtering before pricing.

Current checks include:

### Employment

Does the product support the customer's employment type?

### Loan Amount

Does the requested amount satisfy the product's minimum amount?

The pricing engine can cap the offer to the product's maximum.

### Tenure

Does the customer's preferred tenure overlap reasonably with the product tenure range?

### Geography

Is the customer's city supported if the product has restricted serviceable locations?

The goal is:

```text
All Products
     |
     v
Candidate Generation
     |
     v
Only potentially compatible products
```

This reduces unnecessary processing.

---

# 31. Affordability Engine

Affordability is implemented in:

```text
src/affordability/affordability_engine.py
```

It uses:

```text
FOIR
```

which means:

> Fixed Obligation to Income Ratio

Current configuration:

```text
Maximum FOIR = 50%
```

The calculation is:

```text
max_total_emi =
monthly_income × 0.50
```

Then:

```text
max_affordable_new_emi =
max_total_emi - existing_monthly_emi
```

Example:

```text
Monthly income = ₹80,000
Maximum FOIR = 50%

Maximum total EMI = ₹40,000

Existing EMI = ₹10,000

Maximum new EMI =
₹40,000 - ₹10,000
= ₹30,000
```

Any offer with:

```text
monthly_emi <= ₹30,000
```

is affordable.

---

# 32. Why Affordability Is Separate From Risk

A customer can have low default risk but still not be able to afford a particular loan.

For example:

```text
Customer:
High income
Excellent credit score
Low PD

Requested loan:
Very large amount

Result:
Low risk
BUT
EMI may exceed affordable limit
```

Therefore:

```text
Risk
and
Affordability
```

are separate dimensions.

---

# 33. Recommendation Scoring

After affordability filtering, the remaining offers are scored.

The scoring module is:

```text
src/recommendation/scoring.py
```

Five dimensions are used.

## 1. Need Match

Measures how well the offered amount satisfies the requested amount.

```text
need_match =
min(offer_amount / requested_amount, 1)
```

## 2. Affordability

Measures available EMI headroom.

Higher remaining headroom produces a better score.

## 3. Risk Fit

The current implementation uses:

```text
risk_fit = 1 - PD
```

Therefore:

```text
lower PD -> higher risk-fit score
```

## 4. Cost

Lower total interest receives a higher score.

## 5. Tenure Preference

Measures how close the offered tenure is to the customer's preferred tenure.

---

# 34. Recommendation Weights

Current weights are:

| Dimension | Weight |
|---|---:|
| Need Match | 25% |
| Affordability | 25% |
| Risk Fit | 20% |
| Cost | 20% |
| Tenure Preference | 10% |

Composite score:

```text
Composite =
0.25 × Need Match
+ 0.25 × Affordability
+ 0.20 × Risk Fit
+ 0.20 × Cost
+ 0.10 × Tenure Preference
```

The final score is therefore multi-objective rather than being based only on interest rate.

---

# 35. Ranking

Ranking is implemented in:

```text
src/recommendation/ranking.py
```

Offers are primarily sorted by:

```text
composite_score DESC
```

The system returns:

```text
Top 3 offers
```

by default.

Tie-breaking depends on the customer's primary preference.

Available preferences:

```text
LOWEST_EMI
LOWEST_TOTAL_COST
SHORTEST_TENURE
REQUIRED_AMOUNT
```

Example:

```text
Primary preference = LOWEST_EMI

If two offers have similar composite scores,
the lower EMI is preferred.
```

---

# 36. Explainability

Explainability is implemented in:

```text
src/explainability/explanation_builder.py
```

The goal is not just to say:

```text
Approved
```

but to explain:

```text
Why was this customer considered eligible?
Why is the risk high/medium/low?
Why was this loan recommended?
Why did this offer rank above alternatives?
```

---

# 37. Risk Explanation

The code supports SHAP-based explanation.

The configuration currently has:

```text
use_shap: false
```

Therefore, the active implementation currently falls back to rule-based explanations.

The intended SHAP flow is:

```text
Customer
   |
   v
Risk Model
   |
   v
SHAP
   |
   v
Feature contribution
   |
   v
Top risk drivers
```

For each important feature, the explanation can describe:

```text
feature
impact
direction
```

where direction can be:

```text
increases_risk
reduces_risk
```

---

# 38. Rule-Based Explanation

The fallback explanation checks important customer characteristics.

Examples:

### Strong credit score

```text
Credit score >= 750
```

can be reported as a risk-reducing factor.

### Low credit score

```text
Credit score < 650
```

can be reported as a risk-increasing factor.

### High EMI burden

```text
existing_emi_ratio > 30%
```

can be reported as a risk-increasing factor.

### Multiple active loans

```text
active loans > 3
```

can increase the reported risk burden.

### Strong income

Higher income can be reported as a positive factor.

---

# 39. Recommendation Explanation

The system can explain why the top offer is attractive.

Examples:

```text
Covers the requested amount.
```

```text
Lower total interest cost.
```

```text
EMI is comfortably within the customer's budget.
```

```text
Tenure matches the customer's preference.
```

```text
Low-risk customers may receive competitive rates.
```

---

# 40. Comparative Explanation

The system can compare the top recommendation with other offers.

For example:

```text
Lower monthly EMI than alternatives.
```

or:

```text
Lower total interest than alternatives.
```

This makes the recommendation more transparent.

---

# 41. End-to-End API Flow

The main endpoint is:

```text
POST /api/v1/recommend
```

The route performs the following steps:

```text
1. Receive request
2. Validate input
3. Run feature pipeline
4. Run eligibility engine
5. If rejected -> return rejection
6. Load risk model
7. Predict probability of default
8. Convert PD to risk band
9. Load loan products
10. Generate candidates
11. Calculate personalized pricing
12. Calculate affordability
13. Remove unaffordable offers
14. Score offers
15. Rank offers
16. Generate explanations
17. Return final JSON
```

---

# 42. API Response

For an approved customer, the response contains:

```text
status
message
risk_summary
affordability_summary
recommendations
explanation
request_id
```

The risk summary contains:

```text
probability_of_default
risk_band
risk_score
```

Each recommendation contains:

```text
product_id
product_name
lender_name
offer_amount
tenure_months
base_interest_rate
personalised_rate
monthly_emi
total_repayment
total_interest
processing_fee
processing_fee_amount
scores
rank
```

---

# 43. Rejected Customer Flow

There are multiple possible rejection points.

## Rejection 1 — Invalid Input

Example:

```text
credit_score = 1000
```

This fails validation.

## Rejection 2 — Eligibility

Example:

```text
credit_score < 600
```

The eligibility engine can reject the customer.

## Rejection 3 — No Candidates

The customer may pass general eligibility but have no compatible products.

## Rejection 4 — Affordability

The customer may have compatible products, but all resulting EMIs may exceed the affordable EMI limit.

This is an important distinction because:

```text
No recommendation
```

does not necessarily mean:

```text
High credit risk
```

It may simply mean:

```text
The available offers are not affordable.
```

---

# 44. Main.py and FastAPI

The application entry point is:

```text
main.py
```

It creates:

```text
FastAPI application
```

and exposes the API routes.

The application also enables CORS for frontend integration.

Root endpoint:

```text
/
```

returns basic API information.

Health endpoint:

```text
/api/v1/health
```

checks whether required artifacts exist.

---

# 45. Model Loading

`src/data/loader.py` manages model and data loading.

It loads:

```text
risk_model.joblib
preprocessor.joblib
loan_products.json
```

using cached loaders.

This avoids repeatedly loading large model artifacts for every request.

There is also a reload mechanism:

```text
POST /api/v1/reload-models
```

which clears cached artifacts.

---

# 46. Fallback Risk Predictor

The system also contains:

```text
FallbackRiskPredictor
```

This is useful when the trained model is unavailable.

It uses a simple mathematical risk approximation based primarily on:

```text
credit_score
existing_emi_ratio
number_of_active_loans
```

However, the implementation explicitly warns that this fallback is:

```text
NOT for production
```

The real production path should use the trained ML model.

---

# 47. Configuration Management

Most important business parameters are centralized in:

```text
config.yaml
```

This includes:

- Validation ranges
- Eligibility thresholds
- Risk thresholds
- Pricing premiums
- FOIR
- Recommendation weights
- Top-N recommendations
- Explainability settings
- Model paths

This is preferable to hard-coding every business value throughout the Python modules.

---

# 48. Current Configuration

Important current values:

```text
Eligibility:
min age = 21
max age = 65
minimum income = ₹20,000
minimum credit score = 600
minimum employment duration = 6 months
maximum existing EMI ratio = 65%
maximum active loans = 5
```

Risk bands:

```text
LOW    < 5% PD
MEDIUM = 5% to <15% PD
HIGH   >= 15% PD
```

Pricing:

```text
LOW    +0%
MEDIUM +2%
HIGH   +4%
```

Affordability:

```text
Maximum FOIR = 50%
```

Recommendation:

```text
Top N = 3
```

Weights:

```text
Need Match        = 25%
Affordability     = 25%
Risk Fit          = 20%
Cost              = 20%
Tenure Preference = 10%
```

---

# 49. Complete Decision Logic

The most important concept of the project is that the recommendation is produced through multiple stages.

```text
                     CUSTOMER
                        |
                        v
                  VALIDATION
                        |
                        v
                 PREPROCESSING
                        |
                        v
              FEATURE ENGINEERING
                        |
                        v
                  ELIGIBILITY
                        |
              +---------+---------+
              |                   |
            FAIL                PASS
              |                   |
              v                   v
           REJECT              RISK MODEL
                                  |
                                  v
                               PD SCORE
                                  |
                                  v
                              RISK BAND
                                  |
                                  v
                         CANDIDATE PRODUCTS
                                  |
                                  v
                               PRICING
                                  |
                                  v
                            AFFORDABILITY
                                  |
                                  v
                           SCORING ENGINE
                                  |
                                  v
                            RANKING ENGINE
                                  |
                                  v
                           EXPLAINABILITY
                                  |
                                  v
                          TOP 3 RECOMMENDATIONS
```

---

# 50. Example End-to-End Scenario

Suppose a customer provides:

```text
Age = 30
Income = ₹75,000/month
Existing EMI = ₹10,000
Credit Score = 760
Active Loans = 1
Work Experience = 6 years
Current Job = 2 years
Requested Loan = ₹10,00,000
Preferred Tenure = 36 months
```

## Step 1 — Validation

All fields are valid.

```text
PASS
```

## Step 2 — Feature Engineering

The system derives:

```text
Annual income = ₹9,00,000

Existing EMI ratio =
10,000 / 75,000
= 13.33%

Credit band = VERY_GOOD
```

## Step 3 — Eligibility

The customer satisfies:

```text
Age requirement
Income requirement
Credit score requirement
Employment duration
EMI ratio
Active loan limit
```

Result:

```text
ELIGIBLE
```

## Step 4 — Risk

The XGBoost model produces a probability of default.

For illustration:

```text
PD = 0.04
```

Then:

```text
Risk band = LOW
```

## Step 5 — Pricing

For a product with:

```text
Base rate = 10.5%
```

and LOW risk:

```text
Personalized rate = 10.5%
```

## Step 6 — Affordability

Maximum total EMI:

```text
₹75,000 × 50%
= ₹37,500
```

Existing EMI:

```text
₹10,000
```

Maximum new EMI:

```text
₹37,500 - ₹10,000
= ₹27,500
```

Offers with EMI above ₹27,500 are removed.

## Step 7 — Scoring

Remaining offers are scored using:

```text
Need Match
Affordability
Risk Fit
Cost
Tenure Preference
```

## Step 8 — Ranking

The top 3 offers are returned.

## Step 9 — Explanation

The system explains:

```text
Why the customer is eligible
Why the risk is low
Why the top offer is recommended
How it compares with alternatives
```

---

# 51. What We Have Built

The ML work is therefore not only:

```text
XGBoost -> prediction
```

It is a complete recommendation pipeline:

```text
             ┌─────────────────────┐
             │ Customer Profile    │
             └──────────┬──────────┘
                        |
                        v
             ┌─────────────────────┐
             │ Validation          │
             └──────────┬──────────┘
                        |
                        v
             ┌─────────────────────┐
             │ Feature Engineering │
             └──────────┬──────────┘
                        |
                        v
             ┌─────────────────────┐
             │ Eligibility         │
             └──────────┬──────────┘
                        |
                        v
             ┌─────────────────────┐
             │ XGBoost Risk Model  │
             └──────────┬──────────┘
                        |
                        v
             ┌─────────────────────┐
             │ Personalized Rate  │
             └──────────┬──────────┘
                        |
                        v
             ┌─────────────────────┐
             │ Affordability       │
             └──────────┬──────────┘
                        |
                        v
             ┌─────────────────────┐
             │ Multi-factor Score  │
             └──────────┬──────────┘
                        |
                        v
             ┌─────────────────────┐
             │ Ranking             │
             └──────────┬──────────┘
                        |
                        v
             ┌─────────────────────┐
             │ Explainability      │
             └──────────┬──────────┘
                        |
                        v
             ┌─────────────────────┐
             │ Top Loan Offers     │
             └─────────────────────┘
```

---

# 52. Important Current Limitations / Improvements

The current codebase is a strong end-to-end prototype, but several points should be addressed before calling it production-ready.

## 52.1 Product Purpose Filtering

`CandidateGenerator` currently checks employment, amount, tenure and geography, but it does not explicitly filter:

```text
loan_purpose
```

against:

```text
product.loan_purposes
```

This should be added.

For example:

```text
loan_purpose = EDUCATION
```

should not return a product that does not support education.

---

## 52.2 Product-Level Credit and Income Rules

The loan product JSON contains:

```text
min_credit_score
min_monthly_income
```

but candidate generation currently does not explicitly enforce these product-specific values.

These should be included in candidate filtering.

---

## 52.3 Risk Model Features vs Engineered Features

The feature engineer creates additional features such as:

```text
annual_income
cc_to_income_ratio
income_segment
credit_band
credit_income_composite
debt_burden_index
is_high_emi_burden
is_thin_file
is_long_tenured
is_stable_employment
```

but the current XGBoost model is trained only on the configured 13 features.

If these new features are intended to improve ML performance, they need to be deliberately added to the training feature set and the model must be retrained.

---

## 52.4 SHAP

The explanation layer supports SHAP, but:

```text
use_shap = false
```

in the current configuration.

For the final explainability stage, SHAP should be enabled and validated against the exact calibrated model/preprocessor combination.

---

## 52.5 Ranking Model

The code contains support for:

```text
models/ranking_model/ranking_model.joblib
```

but the current recommendation ranking is primarily a deterministic weighted scoring and sorting system.

This is acceptable for the current stage.

A learned ranking model can be introduced later if sufficient recommendation/outcome data becomes available.

---

## 52.6 Training Dataset

The uploaded project archive contains the trained model artifacts and application code, but the actual processed training CSV is not included in the archive.

The training code expects:

```text
data/processed/loan_training_data.csv
```

with the target:

```text
default_flag
```

Therefore, the training dataset should be kept separately and versioned appropriately.

---

# 53. Recommended Final ML Architecture

For the current project scope, the recommended architecture is:

```text
                USER INPUT
                    |
                    v
          +-------------------+
          | Input Validation  |
          +---------+---------+
                    |
                    v
          +-------------------+
          | Preprocessing     |
          +---------+---------+
                    |
                    v
          +-------------------+
          | Feature Engineer  |
          +---------+---------+
                    |
                    v
          +-------------------+
          | Eligibility Rules |
          +---------+---------+
                    |
                    v
          +-------------------+
          | XGBoost Risk      |
          | Classifier        |
          +---------+---------+
                    |
                    v
          +-------------------+
          | Probability of    |
          | Default           |
          +---------+---------+
                    |
                    v
          +-------------------+
          | Risk Band         |
          +---------+---------+
                    |
                    v
          +-------------------+
          | Candidate         |
          | Generation        |
          +---------+---------+
                    |
                    v
          +-------------------+
          | Personalized      |
          | Pricing           |
          +---------+---------+
                    |
                    v
          +-------------------+
          | FOIR /            |
          | Affordability     |
          +---------+---------+
                    |
                    v
          +-------------------+
          | Recommendation    |
          | Scoring            |
          +---------+---------+
                    |
                    v
          +-------------------+
          | Ranking / Top 3   |
          +---------+---------+
                    |
                    v
          +-------------------+
          | Explainability    |
          +---------+---------+
                    |
                    v
              FINAL JSON
```

---

# 54. What Each Module Owns

| Module | Responsibility |
|---|---|
| `api/` | API request/response layer |
| `data/validator.py` | Input and business validation |
| `data/preprocessing.py` | Cleaning and normalization |
| `features/feature_engineering.py` | Derived features |
| `features/feature_pipeline.py` | Feature pipeline orchestration |
| `eligibility/` | Hard approval rules |
| `risk/train.py` | ML model training |
| `risk/predict.py` | ML inference |
| `pricing/` | Personalized rate and EMI |
| `affordability/` | FOIR and EMI filtering |
| `recommendation/candidate_generation.py` | Product pre-filtering |
| `recommendation/scoring.py` | Multi-factor offer scoring |
| `recommendation/ranking.py` | Final ranking |
| `explainability/` | Human-readable decision explanation |
| `data/loader.py` | Model/product artifact loading |
| `config.yaml` | Central configuration |

---

# 55. Final Summary

The completed ML system follows a **hybrid ML + business-rule architecture**.

The core ML model predicts:

```text
Probability of Default
```

using historical customer data where:

```text
default_flag = 0 -> No Default
default_flag = 1 -> Default
```

That prediction is then used as one component of a broader recommendation system.

The complete logic is:

```text
Customer Profile
      |
      v
Validation
      |
      v
Feature Engineering
      |
      v
Eligibility
      |
      v
XGBoost Risk Prediction
      |
      v
Probability of Default
      |
      v
Risk Band
      |
      +----------------------+
      |                      |
      v                      v
Personalized Pricing     Recommendation
      |                      |
      v                      v
EMI Calculation         Multi-factor Scoring
      |                      |
      +----------+-----------+
                 |
                 v
          Affordability
                 |
                 v
              Ranking
                 |
                 v
          Explainability
                 |
                 v
        Personalized Loans
```

The key idea is:

> **The ML model predicts risk; the recommendation engine combines risk, affordability, loan cost, customer need, tenure preference and product compatibility to recommend the most suitable loan offers.**

This separation makes the architecture easier to explain, test, modify and eventually productionize.
