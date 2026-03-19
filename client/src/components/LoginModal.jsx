import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Modal, Input, Button, Alert } from './ui';
import { BRANCHES } from '../lib/constants';

const DEPARTMENTS = ['Operations', 'Sales', 'Finance', 'Human Resources', 'IT', 'Warehouse', 'Health Services', 'Marketing', 'Administration'];
const WAREHOUSES = ['Windhoek Warehouse', 'Ondangwa Warehouse'];

const STOCK_ROLES = ['stock', 'warehouse'];

function isBranchRole(role) {
  return ['frontdesk', 'consultant', 'dispenser', 'branch_manager'].includes(role);
}

function isWarehouseRole(role) {
  return STOCK_ROLES.includes(role);
}

export function LoginModal({ open, onClose }) {
  const [tab, setTab] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [regStep, setRegStep] = useState(1);
  const [regForm, setRegForm] = useState({
    username: '', fullName: '', dob: '', role: 'frontdesk', password: '', confirmPassword: '',
    position: '', department: '', branch: '', warehouseRole: 'stock', warehouseLocation: '',
    phone: '', email: '', id_number: '', gender: '', address: ''
  });
  const [regSuccess, setRegSuccess] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(username, password);
      onClose();
      setUsername('');
      setPassword('');
      const firstPortal = user.role === 'admin' ? 'admin' :
        user.role === 'frontdesk' ? 'frontdesk' :
        user.role === 'consultant' ? 'consultant' :
        user.role === 'dispenser' || user.role === 'branch_manager' ? 'branch' :
        user.role === 'hr_manager' ? 'hr' :
        user.role === 'gm' ? 'gm' :
        user.role === 'director' ? 'director' :
        user.role === 'mis' ? 'mis' :
        user.role === 'stock' || user.role === 'warehouse' ? 'stock' :
        user.role === 'finance' ? 'finance' : 'distributor';
      navigate(`/${firstPortal}`);
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const validateStep1 = () => {
    if (!regForm.username.trim()) return 'Username is required';
    if (!/^[a-zA-Z0-9._-]+$/.test(regForm.username.trim())) return 'Username can only contain letters, numbers, dots, dashes, and underscores';
    if (regForm.username.trim().length < 3) return 'Username must be at least 3 characters';
    if (!regForm.fullName.trim()) return 'Full name is required';
    if (!regForm.dob) return 'Date of birth is required';
    if (!regForm.password || regForm.password.length < 6) return 'Password must be at least 6 characters';
    if (regForm.password !== regForm.confirmPassword) return 'Passwords do not match';
    return null;
  };

  const handleNextStep = () => {
    const err = validateStep1();
    if (err) { setError(err); return; }
    setError('');
    setRegStep(2);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    if (!regForm.position.trim()) { setError('Position/Job title is required'); return; }
    if (isWarehouseRole(regForm.role)) {
      if (!regForm.warehouseLocation) { setError('Please select your warehouse location'); return; }
    } else {
      if (!regForm.branch) { setError('Please select your branch'); return; }
    }
    setLoading(true);
    try {
      const apiModule = await import('../lib/api');
      const payload = {
        username: regForm.username.trim().toLowerCase(),
        full_name: regForm.fullName,
        dob: regForm.dob,
        role: isWarehouseRole(regForm.role) ? regForm.warehouseRole : regForm.role,
        password: regForm.password,
        email: regForm.email || undefined,
        position: regForm.position,
        department: regForm.department,
        branch: isWarehouseRole(regForm.role) ? regForm.warehouseLocation : regForm.branch,
        phone: regForm.phone,
        id_number: regForm.id_number,
        gender: regForm.gender,
        address: regForm.address,
      };
      if (isWarehouseRole(regForm.role)) {
        payload.warehouse_location = regForm.warehouseLocation;
        payload.warehouse_role = regForm.warehouseRole;
      }
      await apiModule.api.auth.register(payload);
      setRegSuccess('Registration submitted! Your account is pending admin approval.');
      setRegForm({
        username: '', fullName: '', dob: '', role: 'frontdesk', password: '', confirmPassword: '',
        position: '', department: '', branch: '', warehouseRole: 'stock', warehouseLocation: '',
        phone: '', email: '', id_number: '', gender: '', address: ''
      });
      setRegStep(1);
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const showWarehouse = isWarehouseRole(regForm.role);
  const showBranchNote = regForm.role === 'branch_manager';

  return (
    <Modal open={open} onClose={() => { onClose(); setRegStep(1); setError(''); }} title="Staff Access" size={tab === 'register' && regStep === 2 ? 'md' : 'sm'}>
      <div className="px-6 pt-4">
        <div className="flex bg-gray-100 rounded-lg p-1 mb-4">
          <button
            onClick={() => { setTab('login'); setError(''); setRegSuccess(''); }}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all cursor-pointer ${tab === 'login' ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}
          >
            Login
          </button>
          <button
            onClick={() => { setTab('register'); setError(''); setRegSuccess(''); }}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all cursor-pointer ${tab === 'register' ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}
          >
            Sign Up
          </button>
        </div>
      </div>

      {tab === 'login' ? (
        <form onSubmit={handleLogin} className="px-6 pb-6 space-y-4">
          {error && <Alert type="error">{error}</Alert>}
          <Input label="Username" value={username} onChange={e => setUsername(e.target.value)} placeholder="Enter your username" required autoFocus />
          <Input label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" required />
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>
      ) : (
        <div className="px-6 pb-6">
          {regSuccess ? (
            <div className="space-y-4">
              <Alert type="success">{regSuccess}</Alert>
              <Button className="w-full" onClick={() => { setTab('login'); setRegSuccess(''); }}>Go to Login</Button>
            </div>
          ) : regStep === 1 ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">1</div>
                <div className="text-sm font-medium text-gray-700">Account Details</div>
                <div className="flex-1 h-0.5 bg-gray-200 mx-2" />
                <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-400 flex items-center justify-center text-sm font-bold">2</div>
                <div className="text-sm text-gray-400">Staff Info</div>
              </div>
              {error && <Alert type="error">{error}</Alert>}
              <Input label="Username" value={regForm.username} onChange={e => setRegForm(f => ({ ...f, username: e.target.value }))} placeholder="Choose your username" required autoFocus />
              <Input label="Full Name" value={regForm.fullName} onChange={e => setRegForm(f => ({ ...f, fullName: e.target.value }))} placeholder="Enter your full name" required />
              <Input label="Date of Birth" type="date" value={regForm.dob} onChange={e => setRegForm(f => ({ ...f, dob: e.target.value }))} required />
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Role</label>
                <select
                  value={regForm.role}
                  onChange={e => setRegForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
                >
                  <option value="frontdesk">Front Desk</option>
                  <option value="consultant">Consultant</option>
                  <option value="dispenser">Branch Staff</option>
                  <option value="branch_manager">Branch Manager</option>
                  <option value="hr_manager">HR Manager</option>
                  <option value="finance">Finance</option>
                  <option value="gm">General Manager</option>
                  <option value="director">Director</option>
                  <option value="mis">MIS</option>
                  <option value="stock_warehouse" disabled style={{color:'#999'}}>── Stock / Warehouse ──</option>
                  <option value="stock">Stock Manager</option>
                  <option value="warehouse">Warehouse Manager</option>
                </select>
              </div>
              {showWarehouse && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
                  <strong>Stock / Warehouse role:</strong> You will be assigned to a specific warehouse. Select your exact location on the next step.
                </div>
              )}
              {showBranchNote && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                  <strong>Branch Manager:</strong> Your portal access will be restricted to your assigned branch only. Select your branch on the next step.
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Input label="Password" type="password" value={regForm.password} onChange={e => setRegForm(f => ({ ...f, password: e.target.value }))} placeholder="Min 6 characters" required />
                <Input label="Confirm Password" type="password" value={regForm.confirmPassword} onChange={e => setRegForm(f => ({ ...f, confirmPassword: e.target.value }))} required />
              </div>
              <Button className="w-full" onClick={handleNextStep}>Next: Staff Information</Button>
            </div>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center text-sm font-bold">&#10003;</div>
                <div className="text-sm text-green-600 font-medium">Account</div>
                <div className="flex-1 h-0.5 bg-primary mx-2" />
                <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">2</div>
                <div className="text-sm font-medium text-gray-700">Staff Information</div>
              </div>
              {error && <Alert type="error">{error}</Alert>}
              <Input label="Position / Job Title" value={regForm.position} onChange={e => setRegForm(f => ({ ...f, position: e.target.value }))} placeholder="e.g. Receptionist, Pharmacist" required />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">Department</label>
                  <select
                    value={regForm.department}
                    onChange={e => setRegForm(f => ({ ...f, department: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
                  >
                    <option value="">Select Department</option>
                    {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>

                {showWarehouse ? (
                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-gray-700">Warehouse Location *</label>
                    <select
                      value={regForm.warehouseLocation}
                      onChange={e => setRegForm(f => ({ ...f, warehouseLocation: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
                      required
                    >
                      <option value="">Select Warehouse</option>
                      {WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-gray-700">
                      {showBranchNote ? 'Your Branch * (portal access)' : 'Branch *'}
                    </label>
                    <select
                      value={regForm.branch}
                      onChange={e => setRegForm(f => ({ ...f, branch: e.target.value }))}
                      className={`w-full px-3 py-2.5 rounded-lg border bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20 ${showBranchNote ? 'border-amber-400' : 'border-gray-300'}`}
                      required
                    >
                      <option value="">Select Branch</option>
                      {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {showWarehouse && (
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">Warehouse Sub-role</label>
                  <select
                    value={regForm.warehouseRole}
                    onChange={e => setRegForm(f => ({ ...f, warehouseRole: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
                  >
                    <option value="stock">Stock Manager (stock management, receiving, issuing)</option>
                    <option value="warehouse">Warehouse Manager (overall warehouse operations)</option>
                  </select>
                </div>
              )}

              {showBranchNote && regForm.branch && (
                <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                  Your branch portal will be restricted to: <strong>{regForm.branch}</strong>. Admin approval is required.
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Input label="Phone Number" type="tel" value={regForm.phone} onChange={e => setRegForm(f => ({ ...f, phone: e.target.value }))} placeholder="+264 81 123 4567" />
                <Input label="Email" type="email" value={regForm.email} onChange={e => setRegForm(f => ({ ...f, email: e.target.value }))} placeholder="name@example.com" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="ID/Passport Number" value={regForm.id_number} onChange={e => setRegForm(f => ({ ...f, id_number: e.target.value }))} placeholder="National ID or Passport" />
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">Gender</label>
                  <select
                    value={regForm.gender}
                    onChange={e => setRegForm(f => ({ ...f, gender: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
                  >
                    <option value="">Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
              <Input label="Address" value={regForm.address} onChange={e => setRegForm(f => ({ ...f, address: e.target.value }))} placeholder="Physical address" />
              <div className="flex gap-3 pt-2">
                <Button variant="secondary" type="button" className="flex-1" onClick={() => { setRegStep(1); setError(''); }}>Back</Button>
                <Button type="submit" className="flex-1" disabled={loading}>
                  {loading ? 'Submitting...' : 'Submit Registration'}
                </Button>
              </div>
              <p className="text-xs text-gray-400 text-center">Your account will be reviewed by an administrator.</p>
            </form>
          )}
        </div>
      )}
    </Modal>
  );
}
