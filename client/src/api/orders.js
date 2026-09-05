import apiClient from './client';

export const listOrders = (params) => apiClient.get('/orders', { params }).then((r) => r.data.data);

export const createOrder = (body) => apiClient.post('/orders', body).then((r) => r.data.data);

export const updateOrderStatus = (orderId, status, paymentId) =>
  apiClient.patch(`/orders/${orderId}/status`, { status, paymentId }).then((r) => r.data.data);
