import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
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
        <Route path="/distributor" element={<DistributorPortal />} />
        <Route path="/frontdesk" element={<FrontDeskPortal />} />
        <Route path="/consultant" element={<ConsultantPortal />} />
        <Route path="/branch" element={<BranchPortal />} />
        <Route path="/hr" element={<HRPortal />} />
        <Route path="/finance" element={<FinancePortal />} />
        <Route path="/gm" element={<GMPortal />} />
        <Route path="/director" element={<DirectorPortal />} />
        <Route path="/mis" element={<MISPortal />} />
        <Route path="/stock" element={<StockPortal />} />
        <Route path="/admin" element={<AdminPortal />} />
        <Route path="/training" element={<TrainingPortal />} />
      </Route>
    </Routes>
  );
}
