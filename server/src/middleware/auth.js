import jwt from 'jsonwebtoken';
import { Errors } from '../utils/apiResponse.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(Errors.unauthorized('Missing or malformed Authorization header'));
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { merchantId: payload.merchantId, businessName: payload.businessName };
    next();
  } catch {
    next(Errors.unauthorized('Invalid or expired token'));
  }
}
