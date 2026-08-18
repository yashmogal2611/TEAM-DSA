/**
 * Loan Application Frontend - Global Configuration
 */
const CONFIG = {
  // Base URL for API
  API_BASE_URL: window.location.origin.includes('8000') ? window.location.origin : 'http://127.0.0.1:8000',
  
  // Storage Keys
  TOKEN_KEY: 'loan_app_token',
  USER_KEY: 'loan_app_user',
  MOCK_MODE_KEY: 'loan_app_mock_mode',

  // Mock Mode default setting (always false when connected to live backend)
  getMockMode() {
    return false;
  },

  setMockMode(enabled) {
    // Session-only mock toggle
    sessionStorage.setItem(this.MOCK_MODE_KEY, JSON.stringify(enabled));
  }
};
