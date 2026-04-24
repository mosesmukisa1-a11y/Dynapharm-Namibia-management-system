import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { Card, CardBody, CardHeader, Badge, Button, LoadingSpinner, EmptyState } from './ui';
import { Bell, AlertTriangle, UserX, MessageSquare, CheckCheck, FileText } from 'lucide-react';
import { generateStaffLetter } from '../lib/labourLetter';

function formatDateTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('en-NA', { year: 'numeric', month: 'short', day: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-NA', { hour: '2-digit', minute: '2-digit' });
}

function formatAck(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleString('en-NA', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function MessageCard({ msg, onMarkRead, currentUser }) {
  const isTermination = msg.type === 'termination';
  const isWarning    = msg.type === 'warning';
  const isHR         = isTermination || isWarning;

  let meta = {};
  try { meta = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata || '{}') : (msg.metadata || {}); } catch(e) {}

  const storageKey = `ack_${msg.id}`;
  const [acknowledged, setAcknowledged] = useState(() => {
    try { return !!localStorage.getItem(storageKey); } catch { return false; }
  });
  const [acknowledgedAt, setAcknowledgedAt] = useState(() => {
    try { return localStorage.getItem(storageKey) || null; } catch { return null; }
  });
  const [checking, setChecking] = useState(false);

  const borderColor = isTermination ? 'border-red-400' : isWarning ? 'border-amber-400' : 'border-blue-300';
  const bgColor     = isTermination ? 'bg-red-50'      : isWarning ? 'bg-amber-50'      : 'bg-blue-50';
  const badgeVariant = isTermination ? 'danger' : isWarning ? 'warning' : 'info';
  const Icon = isTermination ? UserX : isWarning ? AlertTriangle : MessageSquare;

  const handleAcknowledge = async () => {
    if (acknowledged || checking) return;
    setChecking(true);
    const ts = new Date().toISOString();
    const formatted = formatAck(ts);
    try {
      localStorage.setItem(storageKey, formatted);
      setAcknowledged(true);
      setAcknowledgedAt(formatted);
      if (!msg.is_read) await onMarkRead(msg.id);
    } catch (e) {
      console.warn('Ack error:', e);
    } finally {
      setChecking(false);
    }
  };

  const handleViewLetter = () => {
    const employeeName = meta.employee_name || currentUser?.full_name || currentUser?.username || 'Employee';
    generateStaffLetter(
      { ...msg, metadata: { ...meta, employee_name: employeeName } },
      acknowledgedAt
    );
  };

  return (
    <div className={`border-l-4 ${borderColor} ${bgColor} rounded-lg p-4 ${!msg.is_read ? 'ring-1 ring-inset ' + (isTermination ? 'ring-red-200' : isWarning ? 'ring-amber-200' : 'ring-blue-200') : 'opacity-90'}`}>

      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1">
          <Icon size={18} className={isTermination ? 'text-red-600 mt-0.5' : isWarning ? 'text-amber-600 mt-0.5' : 'text-blue-600 mt-0.5'} />
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-900 text-sm">{msg.title}</span>
              <Badge variant={badgeVariant}>
                {isTermination ? 'Termination' : isWarning ? 'Warning' : 'Message'}
              </Badge>
              {!msg.is_read && <Badge variant="primary">New</Badge>}
              {acknowledged && (
                <span style={{ fontSize: '0.72rem', color: '#166534', background: '#dcfce7', padding: '1px 8px', borderRadius: 9999, fontWeight: 600 }}>
                  ✔ Acknowledged
                </span>
              )}
            </div>
            <p className="text-sm text-gray-700 mt-1">{msg.message}</p>
            {meta.issued_by && (
              <p className="text-xs text-gray-500 mt-1">Issued by: <strong>{meta.issued_by}</strong></p>
            )}
            <p className="text-xs text-gray-400 mt-1">{formatDateTime(msg.created_at)}</p>
          </div>
        </div>

        {!msg.is_read && !isHR && (
          <button
            onClick={() => onMarkRead(msg.id)}
            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 whitespace-nowrap cursor-pointer flex-shrink-0"
          >
            <CheckCheck size={13} /> Mark read
          </button>
        )}
      </div>

      {/* HR-specific actions: acknowledge + letter */}
      {isHR && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(0,0,0,0.07)' }}>

          {/* Checkbox */}
          {!acknowledged ? (
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={false}
                onChange={handleAcknowledge}
                disabled={checking}
                style={{ marginTop: 2, width: 16, height: 16, cursor: 'pointer', accentColor: '#166534' }}
              />
              <span style={{ fontSize: '0.82rem', color: '#374151', fontWeight: 500, lineHeight: 1.4 }}>
                I have read and understood the contents of this {isTermination ? 'termination notice' : 'warning letter'}.
                By checking this box I acknowledge receipt of this document.
              </span>
            </label>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.8rem', color: '#166534', fontWeight: 600 }}>
                ✔ Acknowledged on {acknowledgedAt}
              </span>
            </div>
          )}

          {/* Letter button — shows after acknowledgement */}
          {acknowledged && (
            <button
              onClick={handleViewLetter}
              style={{
                marginTop: 10,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 16px',
                fontSize: '0.8rem',
                fontWeight: 600,
                background: isTermination ? '#7f1d1d' : '#1e3a5f',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
              }}
              title="Open your personalised letter with your acknowledgement pre-filled"
            >
              <FileText size={14} /> View My Letter (PDF)
            </button>
          )}

          {/* Prompt before acknowledging */}
          {!acknowledged && (
            <p style={{ marginTop: 8, fontSize: '0.75rem', color: '#6b7280' }}>
              Please tick the box above to confirm receipt. Your letter will then be available to download.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function StaffMessagesTab({ accentColor }) {
  const { user } = useAuth();
  const [messages, setMessages]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [markingAll, setMarkingAll] = useState(false);

  const username = user?.username?.toLowerCase();

  const load = async () => {
    if (!username) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ recipient_type: 'staff', recipient_id: username });
      const data = await api.get(`/notifications?${params}`);
      const list = Array.isArray(data) ? data : data.notifications || [];
      list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setMessages(list);
    } catch (err) {
      setError('Could not load messages');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [username]);

  const handleMarkRead = async (id) => {
    try {
      await api.put('/notifications', { id, recipient_id: username });
      setMessages(prev => prev.map(m => m.id === id ? { ...m, is_read: true } : m));
    } catch {}
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await api.put('/notifications', { markAllRead: true, recipient_id: username });
      setMessages(prev => prev.map(m => ({ ...m, is_read: true })));
    } catch {}
    setMarkingAll(false);
  };

  const unreadCount = messages.filter(m => !m.is_read).length;

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell size={18} style={{ color: accentColor || '#dc2626' }} />
              <h3 className="font-bold text-gray-800">My Messages &amp; Notifications</h3>
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5">{unreadCount}</span>
              )}
            </div>
            {unreadCount > 0 && (
              <Button size="sm" variant="secondary" onClick={handleMarkAllRead} disabled={markingAll}>
                <CheckCheck size={13} /> Mark all read
              </Button>
            )}
          </div>
        </CardHeader>
        <CardBody>
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

          {messages.length === 0 ? (
            <EmptyState
              icon={<Bell size={40} className="text-gray-300" />}
              title="No messages yet"
              description="HR messages, warnings, and important communications will appear here."
            />
          ) : (
            <div className="space-y-3">
              {messages.map(msg => (
                <MessageCard
                  key={msg.id}
                  msg={msg}
                  onMarkRead={handleMarkRead}
                  currentUser={user}
                />
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {messages.length > 0 && (
        <p className="text-xs text-gray-400 text-center">
          Showing {messages.length} message{messages.length !== 1 ? 's' : ''} · {unreadCount} unread
        </p>
      )}
    </div>
  );
}
