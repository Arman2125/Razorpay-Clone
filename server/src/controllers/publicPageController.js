import Customer from '../models/Customer.js';
import Merchant from '../models/Merchant.js';
import Payment from '../models/Payment.js';
import Reminder from '../models/Reminder.js';
import * as paymentLinkService from '../services/paymentLinkService.js';
import { ApiError } from '../utils/apiResponse.js';

// This is the ONLY thing a customer following a payment/reminder link ever
// sees — no merchant auth, no navigation, no other merchant/customer data.
// Everything rendered here is looked up server-side from the paymentLinkId
// in the URL; nothing from the request body/query is trusted for what's
// shown or for what the "Pay Now" action actually does (see the inline
// script below — it POSTs with no body at all).

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
    amount ?? 0
  );
}

function formatDate(date) {
  if (!date) return '';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(date));
}

function formatDateTime(date) {
  if (!date) return '';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

function shell(bodyHtml) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Mini Razorpay — Payment</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #f6f7fb; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #16182b;
    padding: 24px;
  }
  .card { width: 100%; max-width: 380px; background: #fff; border: 1px solid #e5e7eb; border-radius: 16px;
    box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05); padding: 32px 28px; text-align: center; }
  .brand { display: inline-flex; align-items: center; gap: 8px; margin-bottom: 20px; }
  .brand .logo { width: 28px; height: 28px; border-radius: 8px; background: #4f46e5; color: #fff;
    display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; }
  .brand span { font-weight: 600; font-size: 15px; }
  .heading { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #6366f1; margin: 0 0 16px; }
  .greeting { font-size: 15px; font-weight: 600; margin: 0 0 20px; }
  .fields { margin: 0 0 4px; text-align: left; }
  .fields dt { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; margin: 14px 0 2px; }
  .fields dt:first-child { margin-top: 0; }
  .fields dd { margin: 0; font-size: 15px; font-weight: 600; color: #16182b; }
  .fields dd.amount-value { font-size: 28px; font-weight: 700; color: #4f46e5; }
  .reminder-note { margin: 20px 0 0; padding: 12px 14px; border-radius: 10px; background: #f8fafc; text-align: left; font-size: 13px; color: #475569; line-height: 1.5; }
  .reminder-note .tag { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; margin-bottom: 4px; }
  .badge { display: inline-block; font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 999px; margin: 20px 0 16px; }
  button.pay { width: 100%; padding: 14px; font-size: 15px; font-weight: 700; letter-spacing: 0.02em; color: #fff; background: #4f46e5;
    border: none; border-radius: 10px; cursor: pointer; margin-top: 8px; }
  button.pay:hover { background: #4338ca; }
  button.pay:disabled { opacity: 0.6; cursor: default; }
  .success-heading { font-size: 20px; font-weight: 700; color: #047857; margin: 8px 0 12px; }
  .success-amount { font-size: 15px; color: #16182b; margin: 0; }
  .meta { margin-top: 16px; font-size: 12px; color: #94a3b8; }
  .error { font-size: 14px; color: #be123c; }
  .disclaimer { margin-top: 20px; font-size: 11px; color: #cbd5e1; line-height: 1.5; }
</style>
</head>
<body>
${bodyHtml}
<script>
  const btn = document.getElementById('pay-btn');
  if (btn) {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Processing...';
      try {
        const res = await fetch(window.location.pathname.replace('/pay/', '/api/payment-links/') + '/pay', { method: 'POST' });
        const body = await res.json();
        if (!res.ok || !body.success) {
          alert(body.error?.message || 'Payment failed.');
          btn.disabled = false;
          btn.textContent = 'PAY NOW';
          return;
        }
        window.location.reload();
      } catch (e) {
        alert('Network error. Please try again.');
        btn.disabled = false;
        btn.textContent = 'PAY NOW';
      }
    });
  }
</script>
</body>
</html>`;
}

function brandHeader() {
  return `<div class="brand"><span class="logo">S</span><span>Mini Razorpay</span></div>`;
}

export async function renderPaymentLinkPage(req, res) {
  const { paymentLinkId } = req.params;

  let link;
  try {
    link = await paymentLinkService.getPublicPaymentLink(paymentLinkId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return res.status(404).send(
        shell(`
          <div class="card">
            ${brandHeader()}
            <p class="error">This payment link does not exist or has been removed.</p>
          </div>
        `)
      );
    }
    console.error(err);
    return res.status(500).send('Something went wrong.');
  }

  // Everything below is looked up server-side from the link's own stored
  // merchantId/customerId/existingPaymentId — never from anything the
  // client supplies — so a customer can only ever see the one payment
  // their own link resolves to.
  const [customer, merchant, linkedPayment, latestReminder] = await Promise.all([
    Customer.findOne({ customerId: link.customerId, merchantId: link.merchantId }).select('name').lean(),
    Merchant.findOne({ merchantId: link.merchantId }).select('businessName').lean(),
    link.existingPaymentId
      ? Payment.findOne({ paymentId: link.existingPaymentId, merchantId: link.merchantId }).select('dueDate').lean()
      : null,
    link.existingPaymentId
      ? Reminder.findOne({ paymentId: link.existingPaymentId, merchantId: link.merchantId }).sort({ createdAt: -1 }).lean()
      : null,
  ]);

  const customerName = escapeHtml(customer?.name || 'Customer');
  const businessName = escapeHtml(merchant?.businessName || 'Merchant');
  const amountText = formatCurrency(link.amount);

  if (link.status === 'paid') {
    const html = shell(`
      <div class="card">
        ${brandHeader()}
        <p class="success-heading">Payment Successful ✓</p>
        <p class="success-amount">${amountText} paid successfully.</p>
        <p class="meta">Paid on ${formatDateTime(link.paidAt)}</p>
      </div>
    `);
    return res.status(200).send(html);
  }

  if (link.status !== 'active') {
    const label = link.status === 'cancelled' ? 'cancelled' : 'expired';
    const html = shell(`
      <div class="card">
        ${brandHeader()}
        <p class="error">This payment request has been ${label} and can no longer be paid.</p>
      </div>
    `);
    return res.status(200).send(html);
  }

  const html = shell(`
    <div class="card">
      ${brandHeader()}
      <p class="heading">Payment Reminder</p>
      <p class="greeting">Hi ${customerName},</p>
      <dl class="fields">
        <dt>Merchant</dt>
        <dd>${businessName}</dd>
        <dt>Amount Due</dt>
        <dd class="amount-value" id="amount-text">${amountText}</dd>
        ${linkedPayment?.dueDate ? `<dt>Due Date</dt><dd>${formatDate(linkedPayment.dueDate)}</dd>` : ''}
      </dl>
      ${
        latestReminder
          ? `<p class="reminder-note"><span class="tag">Reminder</span>${escapeHtml(latestReminder.message)}</p>`
          : ''
      }
      <button class="pay" id="pay-btn">PAY NOW</button>
      <p class="disclaimer">This is a simulated Mini Razorpay payment link created for the Razorpay AI Buildathon prototype. No real money is processed.</p>
    </div>
  `);

  res.status(200).send(html);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
