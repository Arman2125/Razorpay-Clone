export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount ?? 0);
}

export function formatDate(date) {
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date));
}

export function formatDateTime(date) {
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

// A customer's total amount is defined as paid + pending (the sum of their
// active receivables), matching the "Total = Paid + Remaining" arithmetic
// used throughout the Customer Dashboard — never including failed/expired
// amounts, which aren't part of the recovery story.
export function customerTotalAmount(customer) {
  return (customer.paidAmount || 0) + (customer.pendingAmount || 0);
}

// Pure function of the customer's own aggregates — never persisted,
// recomputed fresh every time from actual payment state, so it can never
// go stale or be faked.
export function customerRecoveryStatus(customer) {
  if (!customer.totalPayments) return 'no_payments';
  return customer.pendingAmount > 0 ? 'pending' : 'recovered';
}

export function timeAgo(date) {
  if (!date) return '—';
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [name, secs] of units) {
    const value = Math.floor(seconds / secs);
    if (value >= 1) return `${value} ${name}${value > 1 ? 's' : ''} ago`;
  }
  return 'just now';
}
