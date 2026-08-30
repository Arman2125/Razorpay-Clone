import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { listDemoMerchants } from '../api/auth';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [merchants, setMerchants] = useState([]);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listDemoMerchants().then(setMerchants).catch(() => {});
  }, []);

  async function handleLogin(phone) {
    setError('');
    setSubmitting(true);
    try {
      await login(phone);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Login failed. Check the phone number.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-lg font-bold text-white">
            S
          </div>
          <h1 className="text-lg font-semibold text-slate-900">Sugam Merchant Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Mini Razorpay demo payment platform</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">Demo merchants</p>
          <div className="mb-5 space-y-2">
            {merchants.map((m) => (
              <button
                key={m.merchantId}
                disabled={submitting}
                onClick={() => handleLogin(m.phoneNumber)}
                className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 text-left text-sm hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-50"
              >
                <span>
                  <span className="block font-medium text-slate-900">{m.businessName}</span>
                  <span className="block text-xs text-slate-400">{m.phoneNumber}</span>
                </span>
                <span className="text-xs text-indigo-600">Login →</span>
              </button>
            ))}
          </div>

          <div className="border-t border-slate-100 pt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
              Or enter a phone number
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleLogin(phoneNumber);
              }}
              className="flex gap-2"
            >
              <input
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+919876543210"
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                Go
              </button>
            </form>
          </div>

          {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Simulated Razorpay-like environment for the Razorpay AI Buildathon. Not the production
          Razorpay platform.
        </p>
      </div>
    </div>
  );
}
