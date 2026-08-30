import { success } from '../utils/apiResponse.js';
import { getAnalyticsSummary } from '../services/analyticsService.js';

export async function summary(req, res, next) {
  try {
    const data = await getAnalyticsSummary(req.user.merchantId);
    return success(res, data);
  } catch (err) {
    next(err);
  }
}
