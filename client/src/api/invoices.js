import apiClient from './client';

export const listInvoices = (params) => apiClient.get('/invoices', { params }).then((r) => r.data.data);

export const createInvoice = (body) => apiClient.post('/invoices', body).then((r) => r.data.data);

export const updateInvoiceStatus = (invoiceId, status) =>
  apiClient.patch(`/invoices/${invoiceId}/status`, { status }).then((r) => r.data.data);
