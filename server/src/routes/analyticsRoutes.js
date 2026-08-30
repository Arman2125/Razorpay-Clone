import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { summary } from '../controllers/analyticsController.js';

const router = Router();

router.use(requireAuth);
router.get('/summary', summary);

export default router;
