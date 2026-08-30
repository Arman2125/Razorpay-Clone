import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  createPaymentLink,
  listPaymentLinks,
  getPaymentLink,
  updatePaymentLinkStatus,
  payPaymentLink,
} from '../controllers/paymentLinkController.js';

const router = Router();

// Public: paying a link is a payer action, not a merchant action — no
// merchant identity is available to check at this point in a real flow.
router.post('/:paymentLinkId/pay', payPaymentLink);

// Everything else is merchant-authenticated and merchant-scoped.
router.post('/', requireAuth, createPaymentLink);
router.get('/', requireAuth, listPaymentLinks);
router.get('/:paymentLinkId', requireAuth, getPaymentLink);
router.patch('/:paymentLinkId/status', requireAuth, updatePaymentLinkStatus);

export default router;
