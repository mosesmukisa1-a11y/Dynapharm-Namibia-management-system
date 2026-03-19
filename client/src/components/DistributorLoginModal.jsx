import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { Modal, Input, Button, Alert } from './ui';

export function DistributorLoginModal({ open, onClose }) {
  const [tab, setTab] = useState('login');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

  const [nbNumber, setNbNumber] = useState('');
  const [password, setPassword] = useState('');

  const [regForm, setRegForm] = useState({
    nb_number: '', password: '', confirmPassword: '', phone: '', email: '',
  });
  const [distributorInfo, setDistributorInfo] = useState(null);
  const [lookupDone, setLookupDone] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!nbNumber.trim() || !password) {
      setError('Please enter your NB number and password');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const user = await login(nbNumber.trim().toLowerCase(), password);
      onClose();
      setNbNumber('');
      setPassword('');
      navigate('/distributor');
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleNBLookup = async () => {
    const code = regForm.nb_number.trim().toUpperCase();
    if (!code) {
      setError('Please enter your NB number');
      return;
    }
    setError('');
    setLookupLoading(true);
    try {
      const data = await api.get(`/auth/distributor-register?code=${encodeURIComponent(code)}`);
      setDistributorInfo(data);
      setRegForm(f => ({
        ...f,
        nb_number: data.distributor_code || code,
      }));
      setLookupDone(true);
    } catch (err) {
      setError(err.message || 'NB number not found');
      setDistributorInfo(null);
      setLookupDone(false);
    } finally {
      setLookupLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    if (!regForm.password || regForm.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (regForm.password !== regForm.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const result = await api.post('/auth/distributor-register', {
        nb_number: regForm.nb_number.trim().toUpperCase(),
        password: regForm.password,
        phone: regForm.phone,
        email: regForm.email,
      });
      setSuccess(result.message || 'Account created! Pending admin approval.');
      setRegForm({ nb_number: '', password: '', confirmPassword: '', phone: '', email: '' });
      setDistributorInfo(null);
      setLookupDone(false);
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const resetState = () => {
    setError('');
    setSuccess('');
    setDistributorInfo(null);
    setLookupDone(false);
  };

  return (
    <Modal open={open} onClose={() => { onClose(); resetState(); }} title="Distributor Access" size="sm">
      <div className="px-6 pt-4">
        <div className="flex bg-gray-100 rounded-lg p-1 mb-4">
          <button
            onClick={() => { setTab('login'); resetState(); }}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all cursor-pointer ${tab === 'login' ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}
          >
            Login
          </button>
          <button
            onClick={() => { setTab('register'); resetState(); }}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all cursor-pointer ${tab === 'register' ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}
          >
            Sign Up
          </button>
        </div>
      </div>

      {tab === 'login' ? (
        <form onSubmit={handleLogin} className="px-6 pb-6 space-y-4">
          {error && <Alert type="error">{error}</Alert>}
          <Input
            label="NB Number"
            value={nbNumber}
            onChange={e => setNbNumber(e.target.value.toUpperCase())}
            placeholder="e.g. NB005676"
            required
            autoFocus
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Enter your password"
            required
          />
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
          <p className="text-xs text-gray-400 text-center">
            Use your NB number as your username to login
          </p>
        </form>
      ) : (
        <div className="px-6 pb-6">
          {success ? (
            <div className="space-y-4">
              <Alert type="success">{success}</Alert>
              <Button className="w-full" onClick={() => { setTab('login'); resetState(); }}>Go to Login</Button>
            </div>
          ) : !lookupDone ? (
            <div className="space-y-4">
              {error && <Alert type="error">{error}</Alert>}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800 font-medium">Step 1: Verify your NB Number</p>
                <p className="text-xs text-blue-600 mt-1">Enter your distributor NB number to auto-fill your details.</p>
              </div>
              <Input
                label="NB Number"
                value={regForm.nb_number}
                onChange={e => setRegForm(f => ({ ...f, nb_number: e.target.value.toUpperCase() }))}
                placeholder="e.g. NB005676"
                required
                autoFocus
              />
              <Button className="w-full" onClick={handleNBLookup} disabled={lookupLoading}>
                {lookupLoading ? 'Looking up...' : 'Verify NB Number'}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              {error && <Alert type="error">{error}</Alert>}
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-sm text-green-800 font-medium">Step 2: Create your password</p>
                <p className="text-xs text-green-600 mt-1">Your details have been verified. Set a password to complete registration.</p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">NB Number:</span>
                  <span className="font-bold text-gray-800">{distributorInfo?.distributor_code}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Name:</span>
                  <span className="font-bold text-gray-800">{distributorInfo?.distributor_name}</span>
                </div>
                {distributorInfo?.branch && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Branch:</span>
                    <span className="text-gray-700">{distributorInfo.branch}</span>
                  </div>
                )}
              </div>

              <Input
                label="Phone Number"
                type="tel"
                value={regForm.phone}
                onChange={e => setRegForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="+264 81 123 4567"
              />
              <Input
                label="Email (optional)"
                type="email"
                value={regForm.email}
                onChange={e => setRegForm(f => ({ ...f, email: e.target.value }))}
                placeholder="name@example.com"
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Password"
                  type="password"
                  value={regForm.password}
                  onChange={e => setRegForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Min 6 characters"
                  required
                />
                <Input
                  label="Confirm Password"
                  type="password"
                  value={regForm.confirmPassword}
                  onChange={e => setRegForm(f => ({ ...f, confirmPassword: e.target.value }))}
                  placeholder="Re-enter password"
                  required
                />
              </div>
              <div className="flex gap-3 pt-1">
                <Button variant="secondary" type="button" className="flex-1" onClick={() => { setLookupDone(false); setDistributorInfo(null); setError(''); }}>
                  Back
                </Button>
                <Button type="submit" className="flex-1" disabled={loading}>
                  {loading ? 'Creating...' : 'Create Account'}
                </Button>
              </div>
              <p className="text-xs text-gray-400 text-center">Your account will be reviewed and approved by an administrator.</p>
            </form>
          )}
        </div>
      )}
    </Modal>
  );
}
