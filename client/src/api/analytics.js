import apiClient from './client';

export const getAnalyticsSummary = () => apiClient.get('/analytics/summary').then((r) => r.data.data);
