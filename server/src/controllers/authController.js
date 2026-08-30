import jwt from 'jsonwebtoken';
import Merchant from '../models/Merchant.js';
import { success } from '../utils/apiResponse.js';
import { Errors } from '../utils/apiResponse.js';
import { isValidPhone } from '../utils/validators.js';

function signToken(merchant) {
  return jwt.sign(
    { merchantId: merchant.merchantId, businessName: merchant.businessName },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

export async function login(req, res, next) {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) throw Errors.badRequest('phoneNumber is required');
    if (!isValidPhone(phoneNumber)) throw Errors.badRequest('phoneNumber is not a valid phone number', 'INVALID_PHONE');

    const merchant = await Merchant.findOne({ phoneNumber });
    if (!merchant) throw Errors.unauthorized('No merchant found for this phone number');
    if (merchant.status !== 'active') throw Errors.unauthorized('Merchant account is not active');

    const token = signToken(merchant);
    return success(res, { token, merchant: merchant.toObject() });
  } catch (err) {
    next(err);
  }
}

export async function listDemoMerchants(req, res, next) {
  try {
    const merchants = await Merchant.find({ status: 'active' }).select(
      'merchantId businessName ownerName phoneNumber businessType'
    );
    return success(res, merchants);
  } catch (err) {
    next(err);
  }
}

export async function me(req, res, next) {
  try {
    const merchant = await Merchant.findOne({ merchantId: req.user.merchantId });
    if (!merchant) throw Errors.notFound('Merchant');
    return success(res, merchant);
  } catch (err) {
    next(err);
  }
}
