import apiClient from './client';

export const listPayments = (params) => apiClient.get('/payments', { params }).then((r) => r.data.data);

export const getPayment = (paymentId) =>
  apiClient.get(`/payments/${paymentId}`).then((r) => r.data.data);

export const listPending = () => apiClient.get('/payments/pending').then((r) => r.data.data);

export const listPendingWithPriority = () =>
  apiClient.get('/payments/pending/priority').then((r) => r.data.data);

export const searchPayments = (body) =>
  apiClient.post('/payments/search', body).then((r) => r.data.data);
