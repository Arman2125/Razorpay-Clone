import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/payments', label: 'Payments' },
  { to: '/payment-links', label: 'Payment Links' },
  { to: '/customers', label: 'Customers' },
  { to: '/customer-dashboard', label: 'Customer Dashboard' },
  { to: '/pending', label: 'Pending Collections' },
  { to: '/settlements', label: 'Settlements' },
  { to: '/reminders', label: 'Reminders' },
  { to: '/refunds', label: 'Refunds' },
  { to: '/orders', label: 'Orders' },
  { to: '/invoices', label: 'Invoices' },
  { to: '/subscriptions', label: 'Subscriptions' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/activity', label: 'Activity' },
];

export default function DashboardLayout() {
  const { merchant, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
            S
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Sugam</p>
            <p className="text-[11px] text-slate-400">Mini Razorpay</p>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 px-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-200 p-4">
          <p className="truncate text-sm font-medium text-slate-900">{merchant?.businessName}</p>
          <p className="truncate text-xs text-slate-400">{merchant?.phoneNumber}</p>
          <button
            onClick={logout}
            className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Switch merchant / Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
