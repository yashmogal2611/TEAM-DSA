/**
 * Loan Application Frontend - Global Configuration
 */
const CONFIG = {
  // Base URL specified in Frontend Integration Guide
  API_BASE_URL: 'http://127.0.0.1:8000',
  
  // Storage Keys
  TOKEN_KEY: 'loan_app_token',
  USER_KEY: 'loan_app_user',
  MOCK_MODE_KEY: 'loan_app_mock_mode',

  // Mock Mode default setting (defaults to false for live backend API)
  getMockMode() {
    const stored = localStorage.getItem(this.MOCK_MODE_KEY);
    return stored !== null ? JSON.parse(stored) : false; // Default to Live Backend API mode
  },

  setMockMode(enabled) {
    localStorage.setItem(this.MOCK_MODE_KEY, JSON.stringify(enabled));
  }
};
