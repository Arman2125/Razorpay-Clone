import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  listPayments,
  listPendingPayments,
  listPendingWithPriority,
  listOverduePayments,
  getPaymentsSummary,
  getPaymentById,
  getPaymentStatus,
  searchPayments,
  updatePaymentStatusHandler,
  listPaymentRefunds,
  getPaymentRefundable,
} from '../controllers/paymentController.js';

const router = Router();

router.use(requireAuth);

router.get('/pending/priority', listPendingWithPriority);
router.get('/pending', listPendingPayments);
router.get('/overdue', listOverduePayments);
router.get('/summary', getPaymentsSummary);
router.post('/search', searchPayments);
router.get('/', listPayments);
router.get('/:paymentId', getPaymentById);
router.get('/:paymentId/status', getPaymentStatus);
router.patch('/:paymentId/status', updatePaymentStatusHandler);
router.get('/:paymentId/refunds', listPaymentRefunds);
router.get('/:paymentId/refundable', getPaymentRefundable);

export default router;
