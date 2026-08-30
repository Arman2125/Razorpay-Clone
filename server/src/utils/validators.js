const PHONE_REGEX = /^\+?[0-9]{7,15}$/;

export function isValidPhone(phone) {
  return typeof phone === 'string' && PHONE_REGEX.test(phone);
}

export function isValidAmount(amount, { allowZero = true } = {}) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return false;
  return allowZero ? amount >= 0 : amount > 0;
}
