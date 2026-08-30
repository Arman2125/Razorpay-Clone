import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { listSettlements, getSettlementById } from '../controllers/settlementController.js';

const router = Router();

router.use(requireAuth);

router.get('/', listSettlements);
router.get('/:settlementId', getSettlementById);

export default router;
