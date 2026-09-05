import Settlement from '../models/Settlement.js';
import { success, Errors } from '../utils/apiResponse.js';
import { logActivity } from '../services/activityService.js';

export async function listSettlements(req, res, next) {
  try {
    const merchantId = req.user.merchantId;
    const { status, from, to } = req.query;

    // Additive, opt-in filters — an unfiltered call behaves exactly as
    // before, including the summary being computed over ALL settlements
    // (not just the filtered page), so existing dashboard consumers never
    // see a changed summary just because a new query param exists.
    const filter = { merchantId };
    if (status) filter.status = status;
    if (from || to) {
      filter.settlementDate = {};
      if (from) filter.settlementDate.$gte = new Date(from);
      if (to) filter.settlementDate.$lte = new Date(to);
    }

    const [settlements, allSettlements] = await Promise.all([
      Settlement.find(filter).sort({ settlementDate: -1 }).lean(),
      status || from || to ? Settlement.find({ merchantId }).lean() : null,
    ]);

    const summarySource = allSettlements || settlements;
    const totalSettled = summarySource
      .filter((s) => s.status === 'processed')
      .reduce((sum, s) => sum + s.amount, 0);
    const pendingSettlement = summarySource
      .filter((s) => s.status === 'pending')
      .reduce((sum, s) => sum + s.amount, 0);
    const failedSettlement = summarySource
      .filter((s) => s.status === 'failed')
      .reduce((sum, s) => sum + s.amount, 0);
    const latestSettlement =
      [...summarySource].sort((a, b) => new Date(b.settlementDate) - new Date(a.settlementDate))[0] || null;

    return success(res, {
      items: settlements,
      summary: { totalSettled, pendingSettlement, failedSettlement, latestSettlement },
    });
  } catch (err) {
    next(err);
  }
}

export async function getSettlementById(req, res, next) {
  try {
    const merchantId = req.user.merchantId;
    const settlement = await Settlement.findOne({
      settlementId: req.params.settlementId,
      merchantId,
    }).lean();
    if (!settlement) throw Errors.notFound('Settlement');

    await logActivity({
      merchantId,
      action: 'SETTLEMENT_VIEWED',
      entityType: 'settlement',
      entityId: settlement.settlementId,
      description: `Settlement ${settlement.settlementId} viewed`,
    });

    return success(res, settlement);
  } catch (err) {
    next(err);
  }
}
