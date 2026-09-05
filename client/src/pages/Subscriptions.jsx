import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { listSubscriptions, createSubscription, updateSubscriptionStatus, processDueSubscriptions } from '../api/subscriptions';
import { listCustomers } from '../api/customers';
import { useToast } from '../context/ToastContext';
import StatusBadge from '../components/StatusBadge';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { formatCurrency, formatDateTime } from '../utils/format';

const INTERVALS = ['day', 'week', 'month', 'year'];

export default function Subscriptions() {
  const { data: subscriptions, loading, error, reload } = useApi(() => listSubscriptions(), []);
  const { data: customers } = useApi(() => listCustomers(), []);
  const { push } = useToast();

  const [form, setForm] = useState({ customerId: '', amount: '', interval: 'month' });
  const [submitting, setSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [processing, setProcessing] = useState(false);

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.customerId || !form.amount) {
      push('Select a customer and enter an amount.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await createSubscription({ customerId: form.customerId, amount: Number(form.amount), interval: form.interval });
      push('Subscription created.', 'success');
      setForm({ customerId: '', amount: '', interval: 'month' });
      reload();
    } catch (err) {
      push(err.response?.data?.error?.message || 'Failed to create subscription.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatus(subscriptionId, status) {
    setUpdatingId(subscriptionId);
    try {
      await updateSubscriptionStatus(subscriptionId, status);
      push(`Subscription ${status}.`, 'success');
      reload();
    } catch (err) {
      push(err.response?.data?.error?.message || 'Failed to update subscription.', 'error');
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleProcessDue() {
    setProcessing(true);
    try {
      const result = await processDueSubscriptions();
      push(`Processed ${result.processed} due subscription(s).`, 'success');
      reload();
    } catch (err) {
      push(err.response?.data?.error?.message || 'Failed to process due subscriptions.', 'error');
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Subscriptions</h1>
          <p className="text-sm text-slate-500">
            Recurring billing schedules. Billing is deterministic and idempotent — no background scheduler runs in
            this demo, so use "Process Due Cycles" to advance any subscription whose next billing date has arrived.
          </p>
        </div>
        <button
          onClick={handleProcessDue}
          disabled={processing}
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {processing ? 'Processing...' : 'Process Due Cycles'}
        </button>
      </div>

      <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Customer</label>
          <select
            value={form.customerId}
            onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))}
            className="w-52 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
          >
            <option value="">Select a customer</option>
            {(customers || []).map((c) => (
              <option key={c.customerId} value={c.customerId}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Amount (₹)</label>
          <input
            type="number"
            min="1"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            placeholder="2000"
            className="w-32 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Interval</label>
          <select
            value={form.interval}
            onChange={(e) => setForm((f) => ({ ...f, interval: e.target.value }))}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
          >
            {INTERVALS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {submitting ? 'Creating...' : 'Create Subscription'}
        </button>
      </form>

      {loading && <LoadingState label="Loading subscriptions..." />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && subscriptions?.items?.length === 0 && (
        <EmptyState title="No subscriptions yet" description="Create one above." />
      )}

      {!loading && !error && subscriptions?.items?.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Subscription ID</th>
                <th className="px-4 py-3">Amount / Interval</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Next Billing</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.items.map((s) => (
                <tr key={s.subscriptionId} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{s.subscriptionId}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {formatCurrency(s.amount)} / {s.interval}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDateTime(s.nextBillingAt)}</td>
                  <td className="px-4 py-3 space-x-2">
                    {s.status === 'active' && (
                      <button
                        onClick={() => handleStatus(s.subscriptionId, 'paused')}
                        disabled={updatingId === s.subscriptionId}
                        className="text-xs font-medium text-amber-600 hover:underline disabled:opacity-50"
                      >
                        Pause
                      </button>
                    )}
                    {s.status === 'paused' && (
                      <button
                        onClick={() => handleStatus(s.subscriptionId, 'active')}
                        disabled={updatingId === s.subscriptionId}
                        className="text-xs font-medium text-emerald-600 hover:underline disabled:opacity-50"
                      >
                        Resume
                      </button>
                    )}
                    {['active', 'paused', 'created'].includes(s.status) && (
                      <button
                        onClick={() => handleStatus(s.subscriptionId, 'cancelled')}
                        disabled={updatingId === s.subscriptionId}
                        className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
