import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { postReminder, listReminders, getReminderById } from '../controllers/reminderController.js';

const router = Router();

router.use(requireAuth);

router.get('/', listReminders);
router.post('/', postReminder);
router.get('/:reminderId', getReminderById);

export default router;
