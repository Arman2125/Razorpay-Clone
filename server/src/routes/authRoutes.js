import { Router } from 'express';
import { login, me, listDemoMerchants } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/demo-merchants', listDemoMerchants);
router.post('/login', login);
router.get('/me', requireAuth, me);

export default router;
