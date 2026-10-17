import {useState} from 'react';
import {api} from '../lib/api';

export function RequiredPasswordChange({onComplete}) {
  const [currentPassword,setCurrent] = useState('');
  const [password,setPassword] = useState('');
  const [confirmation,setConfirmation] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (password !== confirmation) return setError('The replacement passwords do not match.');
    setBusy(true); setError('');
    try {
      await api.post('/auth/credential-security',
        {action:'change-own-password',currentPassword,password});
      setCurrent(''); setPassword(''); setConfirmation('');
      await onComplete();
    } catch(e) {setError(e.message || 'Password change failed');}
    finally {setBusy(false);}
  }
  return <main className="max-w-lg mx-auto my-12 p-6 bg-white border border-red-200 rounded-lg">
    <h1 className="text-xl font-bold text-red-700">Replace your temporary password</h1>
    <p className="my-3">Choose a private password before continuing. You will sign in again after this change.</p>
    <form onSubmit={submit} className="space-y-4">
      <label className="block">Current temporary password
        <input required type="password" autoComplete="current-password" value={currentPassword}
          onChange={e=>setCurrent(e.target.value)} className="block w-full border rounded p-2" />
      </label>
      <label className="block">New password (at least 12 characters)
        <input required type="password" minLength={12} autoComplete="new-password" value={password}
          onChange={e=>setPassword(e.target.value)} className="block w-full border rounded p-2" />
      </label>
      <label className="block">Confirm new password
        <input required type="password" minLength={12} autoComplete="new-password" value={confirmation}
          onChange={e=>setConfirmation(e.target.value)} className="block w-full border rounded p-2" />
      </label>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <button disabled={busy} className="bg-red-700 text-white rounded px-4 py-2">
        {busy?'Saving…':'Change password and sign out'}
      </button>
    </form>
  </main>;
}
