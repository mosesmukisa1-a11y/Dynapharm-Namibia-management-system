import { useState } from 'react';
import { X, Bell, CheckCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';

export function PostLoginUpdates() {
  const { user, postLoginNotifications, dismissPostLoginNotifications } = useAuth();
  const [marking, setMarking] = useState(false);

  if (!postLoginNotifications || postLoginNotifications.length === 0) return null;

  const handleMarkAllRead = async () => {
    if (!user) return;
    setMarking(true);
    try {
      await api.notifications.markAllRead(user.username || user.id);
    } catch (e) {
    } finally {
      setMarking(false);
      dismissPostLoginNotifications();
    }
  };

  const typeColor = (type) => {
    switch (type) {
      case 'success': return 'text-green-700 bg-green-50 border-green-200';
      case 'warning': return 'text-amber-700 bg-amber-50 border-amber-200';
      case 'error': return 'text-red-700 bg-red-50 border-red-200';
      default: return 'text-blue-700 bg-blue-50 border-blue-200';
    }
  };

  return (
    <div className="fixed top-4 right-4 z-50 w-full max-w-sm shadow-lg rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-primary" />
          <span className="font-semibold text-sm text-gray-800">
            {postLoginNotifications.length} new notification{postLoginNotifications.length > 1 ? 's' : ''} since last login
          </span>
        </div>
        <button
          onClick={dismissPostLoginNotifications}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </div>

      <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
        {postLoginNotifications.map(notif => (
          <div key={notif.id} className="px-4 py-3">
            <div className="flex items-start gap-2">
              <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-xs font-medium border ${typeColor(notif.type)}`}>
                {notif.type || 'info'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{notif.title}</p>
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notif.message}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 px-4 py-3 bg-gray-50 border-t border-gray-200">
        <button
          onClick={handleMarkAllRead}
          disabled={marking}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
        >
          <CheckCheck size={14} />
          {marking ? 'Marking...' : 'Mark all as read'}
        </button>
        <button
          onClick={dismissPostLoginNotifications}
          className="flex-1 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
