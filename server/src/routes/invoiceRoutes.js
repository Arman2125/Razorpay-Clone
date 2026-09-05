import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  createInvoice,
  listInvoices,
  getInvoiceById,
  updateInvoice,
  updateInvoiceStatus,
} from '../controllers/invoiceController.js';

const router = Router();

router.use(requireAuth);

router.post('/', createInvoice);
router.get('/', listInvoices);
router.get('/:invoiceId', getInvoiceById);
router.patch('/:invoiceId', updateInvoice);
router.patch('/:invoiceId/status', updateInvoiceStatus);

export default router;
