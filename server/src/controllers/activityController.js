import Activity from '../models/Activity.js';
import { success } from '../utils/apiResponse.js';

export async function listActivity(req, res, next) {
  try {
    const merchantId = req.user.merchantId;
    const { action, entityType, from, to, page = 1, limit = 50 } = req.query;

    const filter = { merchantId };
    if (action) filter.action = action;
    if (entityType) filter.entityType = entityType;

    const dateRange = {};
    if (from) dateRange.$gte = new Date(from);
    if (to) dateRange.$lte = new Date(to);
    if (Object.keys(dateRange).length) filter.createdAt = dateRange;

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(200, Math.max(1, Number(limit)));

    const [items, total] = await Promise.all([
      Activity.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Activity.countDocuments(filter),
    ]);

    return success(res, { items, page: pageNum, limit: limitNum, total });
  } catch (err) {
    next(err);
  }
}
