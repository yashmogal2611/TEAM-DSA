# Number of risk drivers we expose to the user.
TOP_SHAP_FEATURES = 4


# Ignore extremely small impacts.
# This prevents insignificant model factors from creating explanations.
MIN_SHAP_IMPORTANCE = 0.01