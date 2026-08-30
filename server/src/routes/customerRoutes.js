import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  listCustomers,
  getCustomerById,
  getCustomerPayments,
  getCustomerReminders,
  getCustomerActivity,
  createCustomer,
  updateCustomer,
} from '../controllers/customerController.js';

const router = Router();

router.use(requireAuth);

router.get('/', listCustomers);
router.post('/', createCustomer);
router.get('/:customerId', getCustomerById);
router.get('/:customerId/payments', getCustomerPayments);
router.get('/:customerId/reminders', getCustomerReminders);
router.get('/:customerId/activity', getCustomerActivity);
router.put('/:customerId', updateCustomer);

export default router;
