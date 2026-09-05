import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { notFound, errorHandler } from './middleware/errorHandler.js';

import authRoutes from './routes/authRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import reminderRoutes from './routes/reminderRoutes.js';
import settlementRoutes from './routes/settlementRoutes.js';
import activityRoutes from './routes/activityRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import paymentLinkRoutes from './routes/paymentLinkRoutes.js';
import refundRoutes from './routes/refundRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import invoiceRoutes from './routes/invoiceRoutes.js';
import subscriptionRoutes from './routes/subscriptionRoutes.js';
import { renderPaymentLinkPage } from './controllers/publicPageController.js';

// ESM has no __dirname; derive it from the module's own URL so the path to
// the built client (client/dist) resolves regardless of the working
// directory the process is started from (e.g. Render's build/start steps).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDistPath = path.join(__dirname, '../../client/dist');

// App wiring lives here, separate from server.js's listen()/connectDB()
// bootstrap, so integration tests can import `app` directly and drive it
// with supertest against a test database, without binding a real port.
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
app.use('/api/refunds', refundRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/subscriptions', subscriptionRoutes);

// Serve the built React app and hand off client-side routing (BrowserRouter)
// to it for any other GET request — but only after every /api, /pay, and
// /health route above has had a chance to match, so their existing 404/JSON
// behavior is untouched.
app.use(express.static(clientDistPath));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/pay') || req.path === '/health') {
    return next();
  }
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

app.use(notFound);
app.use(errorHandler);

export default app;
