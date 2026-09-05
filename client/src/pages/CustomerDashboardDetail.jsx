import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { getCustomer, getCustomerPayments, getCustomerReminders, getCustomerActivity } from '../api/customers';
import { sendReminder } from '../api/reminders';
import { createPaymentLink } from '../api/paymentLinks';
import { useToast } from '../context/ToastContext';
import StatusBadge, { RecoveryBadge } from '../components/StatusBadge';
import Card from '../components/Card';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { formatCurrency, formatDate, formatDateTime, customerTotalAmount, customerRecoveryStatus } from '../utils/format';

// Local to this page — Activity.jsx has its own copy for the exact same
// reason (a tiny presentational icon lookup, not business logic worth
// sharing/importing across pages).
const ACTIVITY_ICONS = {
  REMINDER_SENT: '📨',
  PAYMENT_VIEWED: '👁',
  PAYMENT_UPDATED: '✏️',
  CUSTOMER_CREATED: '👤',
  CUSTOMER_UPDATED: '✏️',
  PAYMENT_LINK_CREATED: '🔗',
  PAYMENT_LINK_PAID: '✅',
  PAYMENT_LINK_CANCELLED: '🚫',
  PAYMENT_LINK_EXPIRED: '⌛',
};

// The merchant-side revenue-recovery detail view — separate from
// CustomerDetail.jsx (basic customer info + payment history under the
// plain "Customers" feature). Same underlying customer/payment/reminder/
// activity data and APIs, just a richer, recovery-focused presentation.
export default function CustomerDashboardDetail() {
  const { customerId } = useParams();
  const { data: customer, loading, error, reload: reloadCustomer } = useApi(() => getCustomer(customerId), [customerId]);
  const { data: payments, loading: paymentsLoading, reload: reloadPayments } = useApi(
    () => getCustomerPayments(customerId),
    [customerId]
  );
  const { data: reminders, loading: remindersLoading, reload: reloadReminders } = useApi(
    () => getCustomerReminders(customerId),
    [customerId]
  );
  const { data: activity, loading: activityLoading, reload: reloadActivity } = useApi(
    () => getCustomerActivity(customerId),
    [customerId]
  );
  const { push } = useToast();

  const [sendingReminderFor, setSendingReminderFor] = useState(null);
  const [generatingLinkFor, setGeneratingLinkFor] = useState(null);
  const [payingFor, setPayingFor] = useState(null);

  function refreshAll() {
    reloadCustomer();
    reloadPayments();
    reloadReminders();
    reloadActivity();
  }

  function paymentFor(paymentId) {
    return (payments || []).find((p) => p.paymentId === paymentId);
  }

  async function handleSendReminder(paymentId) {
    setSendingReminderFor(paymentId);
    try {
      await sendReminder(paymentId);
      push(`Reminder sent to ${customer.name}.`, 'success');
      refreshAll();
    } catch (err) {
      const apiError = err.response?.data?.error;
      if (apiError?.code === 'DUPLICATE_REMINDER') {
        push('A reminder was already sent for this payment recently.', 'error');
      } else {
        push(apiError?.message || 'Failed to send reminder.', 'error');
      }
    } finally {
      setSendingReminderFor(null);
    }
  }

  async function handleGeneratePaymentLink(payment) {
    setGeneratingLinkFor(payment.paymentId);
    try {
      const link = await createPaymentLink({ customerId, existingPaymentId: payment.paymentId });
      navigator.clipboard?.writeText(link.shortUrl);
      push(`Payment link created and copied to clipboard.`, 'success');
      window.open(link.shortUrl, '_blank', 'noopener');
      refreshAll();
    } catch (err) {
      push(err.response?.data?.error?.message || 'Failed to create payment link.', 'error');
    } finally {
      setGeneratingLinkFor(null);
    }
  }

  // Same underlying action as "Get Payment Link" above (existingPaymentId
  // ties it to the payment this reminder was for) — just surfaced as a
  // one-click "Pay Now" directly on the reminder itself, so a merchant
  // doesn't need to jump back to the Payment History row to act on it.
  async function handlePayNow(paymentId) {
    setPayingFor(paymentId);
    try {
      const link = await createPaymentLink({ customerId, existingPaymentId: paymentId });
      navigator.clipboard?.writeText(link.shortUrl);
      push('Payment link copied to clipboard.', 'success');
      window.open(link.shortUrl, '_blank', 'noopener');
      refreshAll();
    } catch (err) {
      push(err.response?.data?.error?.message || 'Failed to open payment link.', 'error');
    } finally {
      setPayingFor(null);
    }
  }

  if (loading) return <LoadingState label="Loading customer..." />;
  if (error) return <ErrorState message={error} onRetry={reloadCustomer} />;
  if (!customer) return null;

  const recoveryStatus = customerRecoveryStatus(customer);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/customer-dashboard" className="text-xs font-medium text-indigo-600 hover:underline">
          ← Back to Customer Dashboard
        </Link>
        <button
          onClick={refreshAll}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {/* Customer information */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">{customer.name}</h1>
        <p className="text-sm text-slate-500">{customer.company}</p>

        <dl className="mt-4 grid grid-cols-2 gap-y-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-slate-400">Phone</dt>
            <dd className="mt-0.5 text-slate-700">{customer.phone}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Email</dt>
            <dd className="mt-0.5 text-slate-700">{customer.email || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Customer ID</dt>
            <dd className="mt-0.5 font-mono text-xs text-slate-500">{customer.customerId}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Customer since</dt>
            <dd className="mt-0.5 text-slate-700">{formatDate(customer.createdAt)}</dd>
          </div>
        </dl>
      </div>

      {/* Payment summary */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Payment Summary</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card title="Total Amount" value={formatCurrency(customerTotalAmount(customer))} />
          <Card
            title="Paid"
            value={formatCurrency(customer.paidAmount)}
            accent="emerald"
            sub={`${(payments || []).filter((p) => p.status === 'paid').length} successful`}
          />
          <Card
            title="Remaining"
            value={formatCurrency(customer.pendingAmount)}
            accent={customer.pendingAmount > 0 ? 'amber' : 'default'}
            sub={`${(payments || []).filter((p) => p.status === 'pending').length} pending`}
          />
          <Card title="Total Payments" value={customer.totalPayments} />
        </div>
      </div>

      {/* Recovery information — the whole point of this dashboard */}
      <div
        className={`rounded-xl border p-6 shadow-sm ${
          recoveryStatus === 'recovered' ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Recovery Information</h2>
          <RecoveryBadge status={recoveryStatus} />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-slate-500">Amount Pending</p>
            <p className={`mt-1 text-2xl font-semibold ${customer.pendingAmount > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
              {formatCurrency(customer.pendingAmount)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Amount Recovered</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-700">{formatCurrency(customer.paidAmount)}</p>
          </div>
        </div>
      </div>

      {/* Payment history */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Payment History</h2>
        {paymentsLoading && <LoadingState label="Loading payments..." />}
        {!paymentsLoading && payments?.length === 0 && <EmptyState title="No payments yet" />}
        {!paymentsLoading && payments?.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Payment ID</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Due Date</th>
                  <th className="px-4 py-3">Paid Date</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.paymentId} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.paymentId}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{formatCurrency(p.amount)}</td>
                    <td className="px-4 py-3 text-slate-600">{p.paymentMethod}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p.dueDate ? formatDate(p.dueDate) : '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{p.paidAt ? formatDate(p.paidAt) : '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(p.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                        {p.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleSendReminder(p.paymentId)}
                              disabled={sendingReminderFor === p.paymentId}
                              className="text-xs font-medium text-indigo-600 hover:underline disabled:opacity-50"
                            >
                              {sendingReminderFor === p.paymentId ? 'Sending...' : 'Send Reminder'}
                            </button>
                            <button
                              onClick={() => handleGeneratePaymentLink(p)}
                              disabled={generatingLinkFor === p.paymentId}
                              className="text-xs font-medium text-indigo-600 hover:underline disabled:opacity-50"
                            >
                              {generatingLinkFor === p.paymentId ? 'Generating...' : 'Get Payment Link'}
                            </button>
                          </>
                        )}
                        <Link to={`/payments/${p.paymentId}`} className="text-xs font-medium text-slate-500 hover:underline">
                          View →
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reminder history */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Reminder History</h2>
        {remindersLoading && <LoadingState label="Loading reminders..." />}
        {!remindersLoading && reminders?.length === 0 && <EmptyState title="No reminders sent yet" />}
        {!remindersLoading && reminders?.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <ul className="divide-y divide-slate-50">
              {reminders.map((r) => {
                const payment = paymentFor(r.paymentId);
                const isPending = payment ? payment.status === 'pending' : true;
                return (
                  <li key={r.reminderId} className="flex items-center justify-between gap-4 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs text-slate-400">{r.paymentId}</p>
                      <p className="mt-0.5 text-sm text-slate-800">{r.message}</p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                        <StatusBadge status={r.status} />
                        <span>{formatDateTime(r.sentAt)}</span>
                      </div>
                    </div>
                    {isPending ? (
                      <button
                        onClick={() => handlePayNow(r.paymentId)}
                        disabled={payingFor === r.paymentId}
                        className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {payingFor === r.paymentId ? 'Opening...' : 'Pay Now'}
                      </button>
                    ) : (
                      <span className="shrink-0 text-xs font-medium text-emerald-600">Paid</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* Activity history */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Activity History</h2>
        {activityLoading && <LoadingState label="Loading activity..." />}
        {!activityLoading && activity?.length === 0 && <EmptyState title="No activity yet" />}
        {!activityLoading && activity?.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <ul className="divide-y divide-slate-50">
              {activity.map((a) => (
                <li key={a.activityId} className="flex items-start gap-3 px-5 py-4">
                  <span className="text-lg leading-none">{ACTIVITY_ICONS[a.action] || '•'}</span>
                  <div className="flex-1">
                    <p className="text-sm text-slate-800">{a.description}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{a.action}</p>
                  </div>
                  <span className="whitespace-nowrap text-xs text-slate-400">{formatDateTime(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
