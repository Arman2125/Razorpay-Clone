// One-off, idempotent maintenance script: rewrites the stored `shortUrl` on
// any PaymentLink whose URL still points at a localhost dev server (created
// before PUBLIC_BASE_URL was set correctly on Render) so existing "Copy
// link" buttons produce a working public URL. Only touches shortUrl —
// nothing else on the document, and nothing outside the PaymentLink
// collection. Safe to re-run: links already on the correct base are
// skipped.
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import PaymentLink from '../models/PaymentLink.js';

const NEW_BASE_URL = 'https://razorpay-clone-p7km.onrender.com';

async function run() {
  await connectDB(process.env.MONGODB_URI);

  const staleLinks = await PaymentLink.find({ shortUrl: { $regex: 'localhost' } });
  console.log(`Found ${staleLinks.length} payment link(s) with a localhost shortUrl.`);

  let updated = 0;
  for (const link of staleLinks) {
    const oldUrl = link.shortUrl;
    const newUrl = `${NEW_BASE_URL}/pay/${link.paymentLinkId}`;
    link.shortUrl = newUrl;
    await link.save();
    console.log(`Updated ${link.paymentLinkId}: ${oldUrl} -> ${newUrl}`);
    updated++;
  }

  console.log(`\nDone. Updated ${updated} link(s).`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Fixing payment link shortUrls failed:', err);
  process.exit(1);
});
