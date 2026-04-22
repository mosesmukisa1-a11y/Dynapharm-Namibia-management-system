import { useAuth } from '../contexts/AuthContext';
import { LoginModal } from './LoginModal';
import { useState } from 'react';
import { Lock } from 'lucide-react';
import { Button } from './ui';

export function ProtectedRoute({ portalId, children }) {
  const { user, hasPortalAccess, loading } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full w-8 h-8 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    if (portalId === 'distributor') {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <Lock size={28} className="text-gray-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-700 mb-2">Authentication Required</h2>
          <p className="text-gray-500 mb-6">Please sign in to access the Distributor Portal.</p>
          <Button onClick={() => window.dispatchEvent(new CustomEvent('openDistributorLogin'))}>
            Sign In
          </Button>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <Lock size={28} className="text-gray-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-700 mb-2">Authentication Required</h2>
        <p className="text-gray-500 mb-6">Please sign in to access this portal.</p>
        <Button onClick={() => setLoginOpen(true)}>Sign In</Button>
        <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
      </div>
    );
  }

  if (!hasPortalAccess(portalId)) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
          <Lock size={28} className="text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-700 mb-2">Access Denied</h2>
        <p className="text-gray-500">Your role does not have permission to access this portal.</p>
      </div>
    );
  }

  return children;
}
