import { customAlphabet } from 'nanoid';

const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
const nano = customAlphabet(alphabet, 12);

const PREFIXES = {
  merchant: 'mer',
  customer: 'cus',
  payment: 'pay',
  reminder: 'rem',
  settlement: 'stl',
  activity: 'act',
  paymentLink: 'plink',
  refund: 'ref',
  order: 'order',
  invoice: 'inv',
  subscription: 'sub',
};

export function generateId(type) {
  const prefix = PREFIXES[type];
  if (!prefix) {
    throw new Error(`Unknown id type: ${type}`);
  }
  return `${prefix}_${nano()}`;
}
