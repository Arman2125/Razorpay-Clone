import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDB } from './config/db.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

import authRoutes from './routes/authRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import reminderRoutes from './routes/reminderRoutes.js';
import settlementRoutes from './routes/settlementRoutes.js';
import activityRoutes from './routes/activityRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import paymentLinkRoutes from './routes/paymentLinkRoutes.js';
import { renderPaymentLinkPage } from './controllers/publicPageController.js';

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ success: true, data: { status: 'ok' } }));

// Public, human-facing payment link page — not a JSON API route, so it
// lives outside /api. Renders real MongoDB state, no auth (the link ID
// itself is the capability, same as a real Razorpay/Stripe payment link).
app.get('/pay/:paymentLinkId', renderPaymentLinkPage);

app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/settlements', settlementRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/payment-links', paymentLinkRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

async function start() {
  await connectDB(process.env.MONGODB_URI);
  app.listen(PORT, () => console.log(`Mini Razorpay API listening on port ${PORT}`));
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
