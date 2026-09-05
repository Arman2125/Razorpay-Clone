import apiClient from './client';

export const listRefunds = (params) => apiClient.get('/refunds', { params }).then((r) => r.data.data);

export const createRefund = (body) => apiClient.post('/refunds', body).then((r) => r.data.data);

export const getRefundableAmount = (paymentId) =>
  apiClient.get(`/payments/${paymentId}/refundable`).then((r) => r.data.data);

export const getPaymentRefunds = (paymentId) =>
  apiClient.get(`/payments/${paymentId}/refunds`).then((r) => r.data.data);
