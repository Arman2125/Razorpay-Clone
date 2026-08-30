import apiClient from './client';

export const listReminders = (params) => apiClient.get('/reminders', { params }).then((r) => r.data.data);

export const sendReminder = (paymentId) =>
  apiClient.post('/reminders', { paymentId }).then((r) => r.data.data);
