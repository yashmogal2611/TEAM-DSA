import os
from dotenv import load_dotenv

load_dotenv()


# Number of risk drivers we expose to the user.
TOP_SHAP_FEATURES = 4


# Ignore extremely small impacts.
# This prevents insignificant model factors from creating explanations.
MIN_SHAP_IMPORTANCE = 0.01



GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = "gemini-3.6-flash"
