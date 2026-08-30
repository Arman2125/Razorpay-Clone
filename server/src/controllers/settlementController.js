import Settlement from '../models/Settlement.js';
import { success, Errors } from '../utils/apiResponse.js';
import { logActivity } from '../services/activityService.js';

export async function listSettlements(req, res, next) {
  try {
    const merchantId = req.user.merchantId;
    const settlements = await Settlement.find({ merchantId }).sort({ settlementDate: -1 }).lean();

    const totalSettled = settlements
      .filter((s) => s.status === 'processed')
      .reduce((sum, s) => sum + s.amount, 0);
    const pendingSettlement = settlements
      .filter((s) => s.status === 'pending')
      .reduce((sum, s) => sum + s.amount, 0);
    const latestSettlement = settlements[0] || null;

    return success(res, {
      items: settlements,
      summary: { totalSettled, pendingSettlement, latestSettlement },
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
