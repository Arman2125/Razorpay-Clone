import apiClient from './client';

export const listPaymentLinks = (params) => apiClient.get('/payment-links', { params }).then((r) => r.data.data);

export const createPaymentLink = (body) =>
  apiClient.post('/payment-links', body).then((r) => r.data.data);

export const cancelPaymentLink = (paymentLinkId) =>
  apiClient
    .patch(`/payment-links/${paymentLinkId}/status`, { status: 'cancelled' })
    .then((r) => r.data.data);
