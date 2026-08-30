import apiClient from './client';

export const listSettlements = () => apiClient.get('/settlements').then((r) => r.data.data);

export const getSettlement = (settlementId) =>
  apiClient.get(`/settlements/${settlementId}`).then((r) => r.data.data);
