import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { login as apiLogin, getMe } from '../api/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [merchant, setMerchant] = useState(() => {
    const stored = localStorage.getItem('sugam_merchant');
    return stored ? JSON.parse(stored) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('sugam_token');
    if (!token) {
      setLoading(false);
      return;
    }
    getMe()
      .then((m) => setMerchant(m))
      .catch(() => {
        localStorage.removeItem('sugam_token');
        localStorage.removeItem('sugam_merchant');
        setMerchant(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (phoneNumber) => {
    const { token, merchant: m } = await apiLogin(phoneNumber);
    localStorage.setItem('sugam_token', token);
    localStorage.setItem('sugam_merchant', JSON.stringify(m));
    setMerchant(m);
    return m;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('sugam_token');
    localStorage.removeItem('sugam_merchant');
    setMerchant(null);
  }, []);

  return (
    <AuthContext.Provider value={{ merchant, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
