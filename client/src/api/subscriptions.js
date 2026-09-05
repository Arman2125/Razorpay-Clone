import apiClient from './client';

export const listSubscriptions = (params) => apiClient.get('/subscriptions', { params }).then((r) => r.data.data);

export const createSubscription = (body) => apiClient.post('/subscriptions', body).then((r) => r.data.data);

export const updateSubscriptionStatus = (subscriptionId, status, atCycleEnd) =>
  apiClient.patch(`/subscriptions/${subscriptionId}/status`, { status, atCycleEnd }).then((r) => r.data.data);

export const processDueSubscriptions = () =>
  apiClient.post('/subscriptions/process-due').then((r) => r.data.data);
