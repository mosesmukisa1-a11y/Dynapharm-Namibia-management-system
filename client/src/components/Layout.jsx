import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { PORTALS } from '../lib/constants';
import { LogOut, Menu, X } from 'lucide-react';
import * as Icons from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';
import { LoginModal } from './LoginModal';
import { DistributorLoginModal } from './DistributorLoginModal';

function PortalIcon({ name, size = 18 }) {
  const Icon = Icons[name];
  return Icon ? <Icon size={size} /> : null;
}

export function Layout() {
  const { user, logout, getAccessiblePortals } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [distributorLoginOpen, setDistributorLoginOpen] = useState(false);

  const accessiblePortals = getAccessiblePortals();
  const visiblePortals = PORTALS.filter(p => accessiblePortals.includes(p.id));

  const currentPortal = location.pathname.split('/')[1] || '';

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
              <img src="/assets/dynapharm-logo.png" alt="Dynapharm" className="h-9 w-9 object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
              <span className="font-bold text-lg text-primary hidden sm:block">DYNAPHARM</span>
            </div>

            {!user ? (
              <div className="flex items-center gap-3">
                <button onClick={() => navigate('/')} className="text-sm text-gray-600 hover:text-primary cursor-pointer">Home</button>
                <button onClick={() => navigate('/shop')} className="text-sm text-gray-600 hover:text-primary cursor-pointer">Shop</button>
                <button onClick={() => navigate('/checkup')} className="text-sm text-gray-600 hover:text-primary cursor-pointer">Health Check</button>
                <button onClick={() => setDistributorLoginOpen(true)} className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-colors cursor-pointer">
                  Distributor Login
                </button>
                <button onClick={() => setLoginOpen(true)} className="px-3 py-2 text-sm text-gray-600 hover:text-primary cursor-pointer">
                  Staff Login
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500 hidden md:block">
                  {user.full_name || user.username} ({user.role})
                </span>
                <button onClick={handleLogout} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer">
                  <LogOut size={16} />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {user && visiblePortals.length > 0 && (
          <>
            <div className="border-t border-gray-100 hidden md:block">
              <div className="max-w-[1400px] mx-auto px-4">
                <nav className="flex gap-1 overflow-x-auto scrollbar-thin py-1">
                  {visiblePortals.map(portal => (
                    <button
                      key={portal.id}
                      onClick={() => navigate(`/${portal.id}`)}
                      className={clsx(
                        'flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-t-lg transition-all relative whitespace-nowrap cursor-pointer',
                        currentPortal === portal.id
                          ? 'bg-white text-primary font-semibold shadow-sm after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[3px] after:bg-primary after:rounded-t'
                          : 'text-gray-500 hover:text-primary hover:bg-primary/5'
                      )}
                    >
                      <PortalIcon name={portal.icon} size={16} />
                      {portal.label}
                    </button>
                  ))}
                </nav>
              </div>
            </div>
            <button
              className="md:hidden absolute top-3 right-14 p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            {mobileMenuOpen && (
              <div className="md:hidden border-t border-gray-100 bg-white shadow-lg">
                <div className="grid grid-cols-3 gap-1 p-3">
                  {visiblePortals.map(portal => (
                    <button
                      key={portal.id}
                      onClick={() => { navigate(`/${portal.id}`); setMobileMenuOpen(false); }}
                      className={clsx(
                        'flex flex-col items-center gap-1 p-3 rounded-lg text-xs font-medium transition-all cursor-pointer',
                        currentPortal === portal.id
                          ? 'bg-primary/10 text-primary'
                          : 'text-gray-500 hover:bg-gray-50'
                      )}
                    >
                      <PortalIcon name={portal.icon} />
                      {portal.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </header>

      <main className="max-w-[1400px] mx-auto px-4 py-6">
        <Outlet />
      </main>

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
      <DistributorLoginModal open={distributorLoginOpen} onClose={() => setDistributorLoginOpen(false)} />
    </div>
  );
}
