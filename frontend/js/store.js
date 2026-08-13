/**
 * Central App State Store
 */
class AppStore {
  constructor() {
    this.user = this.loadStoredUser();
    this.token = localStorage.getItem(CONFIG.TOKEN_KEY);
    this.userLoans = [];
    this.adminLoans = [];
    this.adminStats = null;
    this.adminUsers = [];
    this.listeners = [];
  }

  loadStoredUser() {
    try {
      const stored = localStorage.getItem(CONFIG.USER_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      return null;
    }
  }

  setSession(token, user) {
    this.token = token;
    this.user = user;
    if (token) localStorage.setItem(CONFIG.TOKEN_KEY, token);
    else localStorage.removeItem(CONFIG.TOKEN_KEY);
    
    if (user) localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(CONFIG.USER_KEY);

    this.notify();
  }

  clearSession() {
    this.setSession(null, null);
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify() {
    this.listeners.forEach(cb => cb(this));
  }
}

const store = new AppStore();
