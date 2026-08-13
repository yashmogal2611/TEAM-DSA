# ML — Loan Recommendation Engine

This folder contains ML models, notebooks, and training scripts.

## Structure
```
ml/
├── notebooks/        ← Jupyter notebooks for EDA and model training
├── models/           ← Saved model files (.pkl, .joblib)
├── train.py          ← Training script
└── predict.py        ← Prediction / inference script
```

## Current Logic
- Credit score-based interest rate adjustment
- EMI-to-income ratio for approval likelihood
- Will be replaced with trained ML model

## To integrate with backend
Update `get_recommendation()` in `backend/main.py` to call your ML model.
