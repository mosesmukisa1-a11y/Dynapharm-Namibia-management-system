import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import Landing from './pages/Landing';
import Shop from './pages/Shop';
import HealthCheckup from './pages/HealthCheckup';
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

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/checkup" element={<HealthCheckup />} />
        <Route path="/distributor" element={<ProtectedRoute portalId="distributor"><DistributorPortal /></ProtectedRoute>} />
        <Route path="/frontdesk" element={<ProtectedRoute portalId="frontdesk"><FrontDeskPortal /></ProtectedRoute>} />
        <Route path="/consultant" element={<ProtectedRoute portalId="consultant"><ConsultantPortal /></ProtectedRoute>} />
        <Route path="/branch" element={<ProtectedRoute portalId="branch"><BranchPortal /></ProtectedRoute>} />
        <Route path="/hr" element={<ProtectedRoute portalId="hr"><HRPortal /></ProtectedRoute>} />
        <Route path="/finance" element={<ProtectedRoute portalId="finance"><FinancePortal /></ProtectedRoute>} />
        <Route path="/gm" element={<ProtectedRoute portalId="gm"><GMPortal /></ProtectedRoute>} />
        <Route path="/director" element={<ProtectedRoute portalId="director"><DirectorPortal /></ProtectedRoute>} />
        <Route path="/mis" element={<ProtectedRoute portalId="mis"><MISPortal /></ProtectedRoute>} />
        <Route path="/stock" element={<ProtectedRoute portalId="stock"><StockPortal /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute portalId="admin"><AdminPortal /></ProtectedRoute>} />
        <Route path="/training" element={<ProtectedRoute portalId="training"><TrainingPortal /></ProtectedRoute>} />
      </Route>
    </Routes>
  );
}
