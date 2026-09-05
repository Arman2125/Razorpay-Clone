import Payment from '../models/Payment.js';
import Refund from '../models/Refund.js';
import Order from '../models/Order.js';
import Invoice from '../models/Invoice.js';
import PaymentLink from '../models/PaymentLink.js';
import Settlement from '../models/Settlement.js';

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

  // ---- Additive: refunds, orders, invoices, payment links, settlements ----
  // None of the fields above are touched — everything below is new keys on
  // the response object, so existing dashboard consumers see no change.

  const [refundAgg] = await Refund.aggregate([
    { $match: { merchantId, status: 'refunded' } },
    { $group: { _id: null, totalRefunded: { $sum: '$amount' }, refundCount: { $sum: 1 } } },
  ]);
  const paidVolume = overview?.totalVolume
    ? statusBreakdown.find((s) => s._id === 'paid')?.amount || 0
    : 0;
  const refunds = {
    totalRefunded: refundAgg?.totalRefunded ?? 0,
    refundCount: refundAgg?.refundCount ?? 0,
    refundableVolume: Math.max(0, paidVolume - (refundAgg?.totalRefunded ?? 0)),
  };

  const [orderAgg] = await Order.aggregate([
    { $match: { merchantId } },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalOrderAmount: { $sum: '$amount' },
        paidOrders: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] } },
        cancelledOrders: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
      },
    },
  ]);
  const orders = {
    totalOrders: orderAgg?.totalOrders ?? 0,
    totalOrderAmount: orderAgg?.totalOrderAmount ?? 0,
    paidOrders: orderAgg?.paidOrders ?? 0,
    cancelledOrders: orderAgg?.cancelledOrders ?? 0,
  };

  const [invoiceAgg] = await Invoice.aggregate([
    { $match: { merchantId } },
    {
      $group: {
        _id: null,
        totalInvoices: { $sum: 1 },
        totalInvoiceAmount: { $sum: '$amount' },
        paidAmount: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0] } },
        outstandingAmount: {
          $sum: { $cond: [{ $in: ['$status', ['issued', 'overdue']] }, '$amount', 0] },
        },
        overdueAmount: { $sum: { $cond: [{ $eq: ['$status', 'overdue'] }, '$amount', 0] } },
      },
    },
  ]);
  const invoices = {
    totalInvoices: invoiceAgg?.totalInvoices ?? 0,
    totalInvoiceAmount: invoiceAgg?.totalInvoiceAmount ?? 0,
    paidAmount: invoiceAgg?.paidAmount ?? 0,
    outstandingAmount: invoiceAgg?.outstandingAmount ?? 0,
    overdueAmount: invoiceAgg?.overdueAmount ?? 0,
  };

  const [linkAgg] = await PaymentLink.aggregate([
    { $match: { merchantId } },
    {
      $group: {
        _id: null,
        totalLinks: { $sum: 1 },
        paidLinks: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] } },
      },
    },
  ]);
  const paymentLinks = {
    totalLinks: linkAgg?.totalLinks ?? 0,
    paidLinks: linkAgg?.paidLinks ?? 0,
    conversionRate: linkAgg?.totalLinks ? Number(((linkAgg.paidLinks / linkAgg.totalLinks) * 100).toFixed(2)) : 0,
  };

  const [settlementAgg] = await Settlement.aggregate([
    { $match: { merchantId } },
    {
      $group: {
        _id: null,
        totalSettled: { $sum: { $cond: [{ $eq: ['$status', 'processed'] }, '$amount', 0] } },
        pendingSettlement: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] } },
      },
    },
  ]);
  const settlements = {
    totalSettled: settlementAgg?.totalSettled ?? 0,
    pendingSettlement: settlementAgg?.pendingSettlement ?? 0,
  };

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
    refunds,
    orders,
    invoices,
    paymentLinks,
    settlements,
  };
}
