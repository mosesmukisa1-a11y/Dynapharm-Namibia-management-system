import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import Landing from './pages/Landing';
import PublicOutlets from './pages/PublicOutlets';
import PublicAbout from './pages/PublicAbout';
import Shop from './pages/Shop';
import HealthCheckup from './pages/HealthCheckup';
import DistributorRefPage from './pages/DistributorRefPage';
import DistributorPortal from './pages/portals/DistributorPortal';
import FrontDeskPortal from './pages/portals/FrontDeskPortal';
import ConsultantPortal from './pages/portals/ConsultantPortal';
import BranchPortal from './pages/portals/BranchPortal';
import HRPortal from './pages/portals/HRPortal';
import FinancePortal from './pages/portals/FinancePortal';
import GMPortal from './pages/portals/GMPortal';
import DirectorPortal from './pages/portals/DirectorPortal';
import MISPortal from './pages/portals/MISPortal';
import StockPortal from './pages/portals/StockPortal';
import AdminPortal from './pages/portals/AdminPortal';
import TrainingPortal from './pages/portals/TrainingPortal';
import SupportStaffPortal from './pages/portals/SupportStaffPortal';
import { api } from './lib/api';
import { setLivePrices } from './lib/pricing';
import { OfflineBanner } from './components/OfflineBanner.jsx';

export default function App() {
  useEffect(() => {
    let mounted = true;
    const refreshPrices = () => {
      api.prices.list()
        .then(prices => { if (mounted && Array.isArray(prices)) setLivePrices(prices); })
        .catch(() => {});
    };
    refreshPrices();
    const intervalId = window.setInterval(refreshPrices, 60_000);
    window.addEventListener('focus', refreshPrices);
    window.addEventListener('online', refreshPrices);
    return () => {
      mounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshPrices);
      window.removeEventListener('online', refreshPrices);
    };
  }, []);

  return (
    <>
      <OfflineBanner />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/outlets" element={<PublicOutlets />} />
        <Route path="/about" element={<PublicAbout />} />
      <Route element={<Layout />}>
        <Route path="/shop" element={<Shop />} />
        <Route path="/checkup" element={<HealthCheckup />} />
        <Route path="/ref/:nbCode" element={<DistributorRefPage />} />

        <Route path="/distributor" element={
          <ProtectedRoute portalId="distributor"><DistributorPortal /></ProtectedRoute>
        } />
        <Route path="/frontdesk" element={
          <ProtectedRoute portalId="frontdesk"><FrontDeskPortal /></ProtectedRoute>
        } />
        <Route path="/consultant" element={
          <ProtectedRoute portalId="consultant"><ConsultantPortal /></ProtectedRoute>
        } />
        <Route path="/branch" element={
          <ProtectedRoute portalId="branch"><BranchPortal /></ProtectedRoute>
        } />
        <Route path="/hr" element={
          <ProtectedRoute portalId="hr"><HRPortal /></ProtectedRoute>
        } />
        <Route path="/finance" element={
          <ProtectedRoute portalId="finance"><FinancePortal /></ProtectedRoute>
        } />
        <Route path="/gm" element={
          <ProtectedRoute portalId="gm"><GMPortal /></ProtectedRoute>
        } />
        <Route path="/director" element={
          <ProtectedRoute portalId="director"><DirectorPortal /></ProtectedRoute>
        } />
        <Route path="/mis" element={
          <ProtectedRoute portalId="mis"><MISPortal /></ProtectedRoute>
        } />
        <Route path="/stock" element={
          <ProtectedRoute portalId="stock"><StockPortal /></ProtectedRoute>
        } />
        <Route path="/admin" element={
          <ProtectedRoute portalId="admin"><AdminPortal /></ProtectedRoute>
        } />
        <Route path="/training" element={
          <ProtectedRoute portalId="training"><TrainingPortal /></ProtectedRoute>
        } />
        <Route path="/support-staff" element={
          <ProtectedRoute portalId="support_staff"><SupportStaffPortal /></ProtectedRoute>
        } />
      </Route>
    </Routes>
    </>
  );
}
