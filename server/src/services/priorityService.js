import Payment from '../models/Payment.js';

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const OVERDUE_CAP_DAYS = 30;
const AMOUNT_CAP = 100000;

const WEIGHTS = { overdue: 0.5, amount: 0.3, history: 0.2 };

/**
 * Deterministic, auditable collection-priority scoring.
 * Same inputs always produce the same score and the same factor breakdown.
 */
export async function calculatePriorityForPending(merchantId, pendingPayments) {
  const customerIds = [...new Set(pendingPayments.map((p) => p.customerId))];

  const paidHistory = await Payment.find({
    merchantId,
    customerId: { $in: customerIds },
    status: 'paid',
  }).lean();

  const onTimeRatioByCustomer = new Map();
  for (const customerId of customerIds) {
    const history = paidHistory.filter((p) => p.customerId === customerId);
    if (history.length === 0) {
      onTimeRatioByCustomer.set(customerId, 0.5); // no history: neutral assumption
      continue;
    }
    const onTimeCount = history.filter(
      (p) => p.paidAt && p.dueDate && p.paidAt <= p.dueDate
    ).length;
    onTimeRatioByCustomer.set(customerId, onTimeCount / history.length);
  }

  const now = Date.now();

  return pendingPayments.map((payment) => {
    const dueTime = payment.dueDate ? new Date(payment.dueDate).getTime() : now;
    const daysOverdue = Math.max(0, Math.floor((now - dueTime) / MS_PER_DAY));

    const overdueFactor = Math.min(daysOverdue / OVERDUE_CAP_DAYS, 1) * 100;
    const amountFactor = Math.min(payment.amount / AMOUNT_CAP, 1) * 100;
    const onTimeRatio = onTimeRatioByCustomer.get(payment.customerId) ?? 0.5;
    const historyFactor = (1 - onTimeRatio) * 100;

    const priorityScore = Math.round(
      overdueFactor * WEIGHTS.overdue + amountFactor * WEIGHTS.amount + historyFactor * WEIGHTS.history
    );

    return {
      ...payment,
      daysOverdue,
      priorityScore,
      priorityFactors: {
        overdueFactor: Math.round(overdueFactor),
        amountFactor: Math.round(amountFactor),
        historyFactor: Math.round(historyFactor),
        weights: WEIGHTS,
      },
    };
  });
}
