import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  createSubscription,
  listSubscriptions,
  getSubscriptionById,
  updateSubscriptionStatus,
  processDueSubscriptions,
} from '../controllers/subscriptionController.js';

const router = Router();

router.use(requireAuth);

router.post('/', createSubscription);
router.get('/', listSubscriptions);
router.post('/process-due', processDueSubscriptions);
router.get('/:subscriptionId', getSubscriptionById);
router.patch('/:subscriptionId/status', updateSubscriptionStatus);

export default router;
