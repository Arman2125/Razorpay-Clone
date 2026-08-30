import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardLayout from './layouts/DashboardLayout';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Payments from './pages/Payments';
import PaymentDetail from './pages/PaymentDetail';
import PaymentLinks from './pages/PaymentLinks';
import Customers from './pages/Customers';
import CustomerDetail from './pages/CustomerDetail';
import CustomerDashboard from './pages/CustomerDashboard';
import CustomerDashboardDetail from './pages/CustomerDashboardDetail';
import PendingCollections from './pages/PendingCollections';
import Settlements from './pages/Settlements';
import Reminders from './pages/Reminders';
import Analytics from './pages/Analytics';
import Activity from './pages/Activity';

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="payments" element={<Payments />} />
              <Route path="payments/:paymentId" element={<PaymentDetail />} />
              <Route path="payment-links" element={<PaymentLinks />} />
              <Route path="customers" element={<Customers />} />
              <Route path="customers/:customerId" element={<CustomerDetail />} />
              <Route path="customer-dashboard" element={<CustomerDashboard />} />
              <Route path="customer-dashboard/:customerId" element={<CustomerDashboardDetail />} />
              <Route path="pending" element={<PendingCollections />} />
              <Route path="settlements" element={<Settlements />} />
              <Route path="reminders" element={<Reminders />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="activity" element={<Activity />} />
            </Route>
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
