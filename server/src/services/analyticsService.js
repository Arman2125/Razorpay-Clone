import Payment from '../models/Payment.js';

export async function getAnalyticsSummary(merchantId) {
  const [overview] = await Payment.aggregate([
    { $match: { merchantId } },
    {
      $group: {
        _id: null,
        totalPayments: { $sum: 1 },
        totalVolume: { $sum: '$amount' },
        pendingAmount: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] },
        },
        successfulCount: {
          $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] },
        },
        failedCount: {
          $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] },
        },
        pendingCount: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
        },
      },
    },
  ]);

  const statusBreakdown = await Payment.aggregate([
    { $match: { merchantId } },
    { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
  ]);

  const methodBreakdown = await Payment.aggregate([
    { $match: { merchantId } },
    { $group: { _id: '$paymentMethod', count: { $sum: 1 } } },
  ]);

  const volumeOverTime = await Payment.aggregate([
    { $match: { merchantId } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        amount: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return {
    overview: overview || {
      totalPayments: 0,
      totalVolume: 0,
      pendingAmount: 0,
      successfulCount: 0,
      failedCount: 0,
      pendingCount: 0,
    },
    statusBreakdown: statusBreakdown.map((s) => ({ status: s._id, count: s.count, amount: s.amount })),
    methodBreakdown: methodBreakdown.map((m) => ({ method: m._id, count: m.count })),
    volumeOverTime: volumeOverTime.map((v) => ({ date: v._id, amount: v.amount, count: v.count })),
  };
}
