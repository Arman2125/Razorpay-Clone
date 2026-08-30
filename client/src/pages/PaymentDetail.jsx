import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { getPayment } from '../api/payments';
import { sendReminder } from '../api/reminders';
import { useToast } from '../context/ToastContext';
import StatusBadge from '../components/StatusBadge';
import { LoadingState, ErrorState } from '../components/States';
import { formatCurrency, formatDate, formatDateTime } from '../utils/format';

export default function PaymentDetail() {
  const { paymentId } = useParams();
  const { data: payment, loading, error, reload } = useApi(() => getPayment(paymentId), [paymentId]);
  const { push } = useToast();
  const [sending, setSending] = useState(false);

  async function handleSendReminder() {
    setSending(true);
    try {
      const result = await sendReminder(paymentId);
      push(`Reminder sent to ${payment.customer?.name || 'customer'}.`, 'success');
      reload();
      return result;
    } catch (err) {
      const apiError = err.response?.data?.error;
      if (apiError?.code === 'DUPLICATE_REMINDER') {
        push('A reminder was already sent for this payment recently.', 'error');
      } else {
        push(apiError?.message || 'Failed to send reminder.', 'error');
      }
    } finally {
      setSending(false);
    }
  }

  if (loading) return <LoadingState label="Loading payment..." />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!payment) return null;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link to="/payments" className="text-xs font-medium text-indigo-600 hover:underline">
          ← Back to Payments
        </Link>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="font-mono text-xs text-slate-400">{payment.paymentId}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{formatCurrency(payment.amount)}</p>
          </div>
          <StatusBadge status={payment.status} />
        </div>

        <dl className="grid grid-cols-2 gap-y-4 text-sm">
          <dt className="text-slate-400">Customer</dt>
          <dd className="text-right font-medium text-slate-800">{payment.customer?.name || '—'}</dd>

          <dt className="text-slate-400">Phone</dt>
          <dd className="text-right text-slate-600">{payment.customer?.phone || '—'}</dd>

          <dt className="text-slate-400">Payment method</dt>
          <dd className="text-right text-slate-600">{payment.paymentMethod}</dd>

          <dt className="text-slate-400">Description</dt>
          <dd className="text-right text-slate-600">{payment.description || '—'}</dd>

          <dt className="text-slate-400">Created date</dt>
          <dd className="text-right text-slate-600">{formatDate(payment.createdAt)}</dd>

          <dt className="text-slate-400">Due date</dt>
          <dd className="text-right text-slate-600">{formatDate(payment.dueDate)}</dd>

          <dt className="text-slate-400">Paid date</dt>
          <dd className="text-right text-slate-600">{payment.paidAt ? formatDate(payment.paidAt) : '—'}</dd>

          <dt className="text-slate-400">Last reminder</dt>
          <dd className="text-right text-slate-600">
            {payment.lastReminderAt ? formatDateTime(payment.lastReminderAt) : 'Never'}
          </dd>
        </dl>

        {payment.status === 'pending' && (
          <div className="mt-6 border-t border-slate-100 pt-4">
            <button
              onClick={handleSendReminder}
              disabled={sending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {sending ? 'Sending...' : 'Send Reminder'}
            </button>
            <p className="mt-2 text-xs text-slate-400">
              This calls the same reminder API that Sugam will use over WhatsApp.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
