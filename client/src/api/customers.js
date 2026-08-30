import apiClient from './client';

export const listCustomers = () => apiClient.get('/customers').then((r) => r.data.data);

export const getCustomer = (customerId) =>
  apiClient.get(`/customers/${customerId}`).then((r) => r.data.data);

export const getCustomerPayments = (customerId) =>
  apiClient.get(`/customers/${customerId}/payments`).then((r) => r.data.data);

export const getCustomerReminders = (customerId) =>
  apiClient.get(`/customers/${customerId}/reminders`).then((r) => r.data.data);

export const getCustomerActivity = (customerId) =>
  apiClient.get(`/customers/${customerId}/activity`).then((r) => r.data.data);

export const createCustomer = (body) => apiClient.post('/customers', body).then((r) => r.data.data);

export const updateCustomer = (customerId, body) =>
  apiClient.put(`/customers/${customerId}`, body).then((r) => r.data.data);
