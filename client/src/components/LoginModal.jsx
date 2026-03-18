import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Modal, Input, Button, Alert } from './ui';

export function LoginModal({ open, onClose }) {
  const [tab, setTab] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [regForm, setRegForm] = useState({ fullName: '', dob: '', role: 'frontdesk', password: '', confirmPassword: '' });
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
        user.role === 'stock' ? 'stock' :
        user.role === 'finance' ? 'finance' : 'distributor';
      navigate(`/${firstPortal}`);
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    if (regForm.password !== regForm.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const apiModule = await import('../lib/api');
      await apiModule.api.auth.register({
        full_name: regForm.fullName,
        dob: regForm.dob,
        role: regForm.role,
        password: regForm.password,
      });
      setRegSuccess('Registration submitted! Your account is pending admin approval.');
      setRegForm({ fullName: '', dob: '', role: 'frontdesk', password: '', confirmPassword: '' });
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Staff Access" size="sm">
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
        <form onSubmit={handleRegister} className="px-6 pb-6 space-y-4">
          {error && <Alert type="error">{error}</Alert>}
          {regSuccess && <Alert type="success">{regSuccess}</Alert>}
          <Input label="Full Name" value={regForm.fullName} onChange={e => setRegForm(f => ({ ...f, fullName: e.target.value }))} required />
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
              <option value="stock">Stock</option>
            </select>
          </div>
          <Input label="Password" type="password" value={regForm.password} onChange={e => setRegForm(f => ({ ...f, password: e.target.value }))} required />
          <Input label="Confirm Password" type="password" value={regForm.confirmPassword} onChange={e => setRegForm(f => ({ ...f, confirmPassword: e.target.value }))} required />
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Submitting...' : 'Submit Registration'}
          </Button>
          <p className="text-xs text-gray-400 text-center">Your account will be reviewed by an administrator.</p>
        </form>
      )}
    </Modal>
  );
}
