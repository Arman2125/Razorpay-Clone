import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createOrder, listOrders, getOrderById, updateOrderStatus } from '../controllers/orderController.js';

const router = Router();

router.use(requireAuth);

router.post('/', createOrder);
router.get('/', listOrders);
router.get('/:orderId', getOrderById);
router.patch('/:orderId/status', updateOrderStatus);

export default router;
