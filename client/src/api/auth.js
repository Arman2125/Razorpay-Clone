import apiClient from './client';

export const listDemoMerchants = () => apiClient.get('/auth/demo-merchants').then((r) => r.data.data);

export const login = (phoneNumber) =>
  apiClient.post('/auth/login', { phoneNumber }).then((r) => r.data.data);

export const getMe = () => apiClient.get('/auth/me').then((r) => r.data.data);
