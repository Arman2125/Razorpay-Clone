import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createRefund, listRefunds, getRefundById } from '../controllers/refundController.js';

const router = Router();

router.use(requireAuth);

router.post('/', createRefund);
router.get('/', listRefunds);
router.get('/:refundId', getRefundById);

export default router;
