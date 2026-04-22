import { useState, useEffect, useRef } from 'react';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/constants';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, Alert, Modal } from '../../components/ui';
import { GraduationCap, Video, Image, Upload, Search, Play, Eye, FileText, Users, BookOpen, Trash2, ExternalLink, Globe, MapPin } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import StaffServicesTab from '../../components/StaffServicesTab';
import StaffMessagesTab from '../../components/StaffMessagesTab';

export default function TrainingPortal() {
  const [activeTab, setActiveTab] = useState('materials');
  const { user } = useAuth();
  const isTrainer = user?.role === 'admin' || user?.role === 'training' || user?.role === 'trainer' || user?.role === 'gm';

  const tabs = [
    { id: 'materials', label: 'Training Materials', icon: '📚' },
    { id: 'videos', label: 'Videos', icon: '🎬' },
    { id: 'photos', label: 'Photos', icon: '📷' },
    ...(isTrainer ? [{ id: 'upload', label: 'Upload Content', icon: '📤' }] : []),
    { id: 'schedule', label: 'Schedule', icon: '📅' },
    { id: 'staffServices', label: 'Staff Services', icon: '👤' },
    { id: 'messages', label: 'My Messages', icon: '📨' },
  ];

  return (
    <div>
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        {activeTab === 'materials' && <MaterialsTab />}
        {activeTab === 'videos' && <VideosTab />}
        {activeTab === 'photos' && <PhotosTab />}
        {activeTab === 'upload' && isTrainer && <UploadTab />}
        {activeTab === 'schedule' && <ScheduleTab isTrainer={isTrainer} />}
        {activeTab === 'staffServices' && <StaffServicesTab accentColor="#065f46" />}
        {activeTab === 'messages' && <StaffMessagesTab accentColor="#065f46" />}
      </div>
    </div>
  );
}

function MaterialsTab() {
  const [search, setSearch] = useState('');

  const materials = [
    { id: 1, title: 'Product Knowledge Guide', type: 'PDF', category: 'Products', description: 'Comprehensive guide to all Dynapharm products, ingredients, and benefits.' },
    { id: 2, title: 'Sales Techniques Manual', type: 'PDF', category: 'Sales', description: 'Effective sales strategies for distributors and branch staff.' },
    { id: 3, title: 'Health Assessment Protocol', type: 'PDF', category: 'Health', description: 'Standard procedures for conducting full body check-ups.' },
    { id: 4, title: 'Distributor Onboarding Pack', type: 'PDF', category: 'Onboarding', description: 'Complete onboarding guide for new distributors.' },
    { id: 5, title: 'Branch Operations Manual', type: 'PDF', category: 'Operations', description: 'Standard operating procedures for branch management.' },
  ];

  const filtered = materials.filter(m =>
    !search || m.title.toLowerCase().includes(search.toLowerCase()) || m.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search training materials..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(mat => (
          <Card key={mat.id} className="hover:shadow-md transition-shadow">
            <CardBody>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <FileText size={20} className="text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 text-sm">{mat.title}</h3>
                  <p className="text-xs text-gray-500 mt-1">{mat.description}</p>
                  <div className="flex items-center gap-2 mt-3">
                    <Badge variant="info">{mat.category}</Badge>
                    <Badge variant="default">{mat.type}</Badge>
                  </div>
                </div>
              </div>
              <Button size="sm" variant="secondary" className="w-full mt-3">
                <Eye size={14} /> View Material
              </Button>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}

function VideosTab() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/media?upload_type=training')
      .then(data => {
        const rows = Array.isArray(data) ? data : [];
        setVideos(rows.filter(r => r.mime_type?.startsWith('video/')));
      })
      .catch(() => setVideos([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  if (videos.length === 0) {
    return (
      <EmptyState
        icon={<Video size={48} />}
        title="No Training Videos Yet"
        description="Training videos will appear here once uploaded by trainers. Videos cover product knowledge, sales techniques, and health assessment procedures."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {videos.map(vid => (
        <Card key={vid.id} className="hover:shadow-md transition-shadow overflow-hidden">
          <div className="bg-black rounded-t-xl overflow-hidden">
            {vid.file_url ? (
              <video
                src={vid.file_url}
                controls
                preload="metadata"
                className="w-full max-h-52 object-contain"
              />
            ) : (
              <div className="h-40 flex items-center justify-center bg-gray-800">
                <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center">
                  <Play size={24} className="text-primary ml-1" />
                </div>
              </div>
            )}
          </div>
          <CardBody>
            <h3 className="font-semibold text-gray-900 text-sm">{vid.entity_name || vid.filename || 'Untitled Video'}</h3>
            {vid.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{vid.description}</p>}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {vid.category && <Badge variant="info">{vid.category}</Badge>}
              {vid.uploaded_by && <span className="text-xs text-gray-400">by {vid.uploaded_by}</span>}
              {vid.file_size && <span className="text-xs text-gray-400">{(vid.file_size / 1024 / 1024).toFixed(1)} MB</span>}
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

function PhotosTab() {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/media?upload_type=training')
      .then(data => {
        const rows = Array.isArray(data) ? data : [];
        setPhotos(rows.filter(r => r.mime_type?.startsWith('image/')));
      })
      .catch(() => setPhotos([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  if (photos.length === 0) {
    return (
      <EmptyState
        icon={<Image size={48} />}
        title="No Training Photos Yet"
        description="Training photos and event galleries will be displayed here once uploaded by trainers."
      />
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {photos.map(photo => (
        <Card key={photo.id} className="hover:shadow-md transition-shadow overflow-hidden">
          <div className="h-40 bg-gray-100">
            <img src={photo.file_url} alt={photo.entity_name || photo.filename} className="w-full h-full object-cover" />
          </div>
          <CardBody className="py-2 px-3">
            <p className="text-xs text-gray-700 truncate">{photo.entity_name || photo.filename || 'Photo'}</p>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

function UploadTab() {
  const [uploadType, setUploadType] = useState('video');
  const [form, setForm] = useState({ title: '', description: '', category: 'Products', file: null });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef(null);

  const resetForm = () => {
    setForm({ title: '', description: '', category: 'Products', file: null });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const fileSizeMB = form.file ? (form.file.size / 1024 / 1024).toFixed(1) : null;
  const isLargeFile = form.file && form.file.size > 100 * 1024 * 1024;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title) { setMessage('Error: Please enter a title'); return; }
    if (!form.file) { setMessage('Error: Please select a file'); return; }

    setLoading(true);
    setProgress(0);
    setMessage('');

    try {
      const formData = new FormData();
      formData.append('file', form.file);
      formData.append('type', 'training');
      formData.append('entityName', form.title);
      formData.append('uploadType', 'training');
      if (form.description) formData.append('description', form.description);
      if (form.category) formData.append('category', form.category);

      // Use XHR for upload progress tracking (fetch doesn't support it)
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/upload');
        xhr.withCredentials = true;
        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) {
            setProgress(Math.round((evt.loaded / evt.total) * 100));
          }
        };
        xhr.onload = () => {
          if (xhr.status === 413) {
            reject(new Error('File too large for the server to accept. Please compress the video to under 200 MB and try again.'));
            return;
          }
          if (xhr.status === 0 || xhr.status >= 500) {
            reject(new Error(`Server error (${xhr.status || 'no response'}) — please try again or contact support.`));
            return;
          }
          try {
            const data = JSON.parse(xhr.responseText);
            if (data.success) resolve(data);
            else reject(new Error(data.error || 'Upload failed'));
          } catch {
            reject(new Error(`Server returned an unexpected response (status ${xhr.status})`));
          }
        };
        xhr.onerror = () => reject(new Error('Network error — check your connection and try again'));
        xhr.ontimeout = () => reject(new Error('Upload timed out — the file may be too large. Try compressing the video first.'));
        xhr.timeout = 15 * 60 * 1000; // 15 minutes for large video files
        xhr.send(formData);
      });

      setProgress(100);
      setMessage('Content uploaded successfully! It will be available to staff and distributors.');
      resetForm();
    } catch (err) {
      setMessage('Error: ' + (err.message || 'Upload failed'));
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  return (
    <Card>
      <CardHeader>
        <h3 className="font-bold text-gray-800 flex items-center gap-2"><Upload size={18} /> Upload Training Content</h3>
      </CardHeader>
      <CardBody>
        {message && <Alert type={message.startsWith('Error') ? 'error' : 'success'} className="mb-4">{message}</Alert>}

        <div className="flex gap-2 mb-4">
          {['video', 'photo', 'document'].map(type => (
            <button key={type} onClick={() => setUploadType(type)}
              className={`px-4 py-2 text-sm rounded-lg capitalize transition-all cursor-pointer ${uploadType === type ? 'bg-primary text-white font-semibold' : 'bg-gray-100 text-gray-600'}`}>
              {type}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
          <Input label="Title *" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Enter content title" />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20 min-h-[80px] resize-y"
              placeholder="Brief description of the content..." />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Category</label>
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
              <option>Products</option>
              <option>Sales</option>
              <option>Health</option>
              <option>Onboarding</option>
              <option>Operations</option>
              <option>General</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Upload File</label>
            <input
              ref={fileInputRef}
              type="file"
              accept={uploadType === 'video' ? 'video/*' : uploadType === 'photo' ? 'image/*' : '.pdf,.doc,.docx'}
              onChange={e => setForm({ ...form, file: e.target.files?.[0] || null })}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-primary/10 file:text-primary"
            />
            {fileSizeMB && (
              <p className={`text-xs mt-1 ${isLargeFile ? 'text-amber-600 font-medium' : 'text-gray-400'}`}>
                {isLargeFile ? `⚠ Large file (${fileSizeMB} MB) — upload may take several minutes on a slow connection.` : `File size: ${fileSizeMB} MB`}
              </p>
            )}
          </div>
          {loading && progress > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-600">
                <span>Uploading{uploadType === 'video' ? ' video' : ''}…</span>
                <span className="font-semibold">{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-gray-400">Please keep this tab open until the upload completes.</p>
            </div>
          )}
          <Button type="submit" disabled={loading}>
            <Upload size={14} /> {loading ? (progress > 0 ? `Uploading… ${progress}%` : 'Preparing…') : `Upload ${uploadType}`}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

const MEETING_PLATFORMS = [
  { id: 'zoom',       label: 'Zoom',              icon: '🎥', color: '#2D8CFF', bg: '#eff6ff' },
  { id: 'teams',      label: 'Microsoft Teams',   icon: '💼', color: '#5b5ea6', bg: '#f5f3ff' },
  { id: 'meet',       label: 'Google Meet',       icon: '📹', color: '#0F9D58', bg: '#f0fdf4' },
  { id: 'webex',      label: 'Cisco Webex',       icon: '🌐', color: '#00A0D1', bg: '#ecfeff' },
  { id: 'skype',      label: 'Skype',             icon: '💬', color: '#00AFF0', bg: '#eff6ff' },
  { id: 'goto',       label: 'GoTo Meeting',      icon: '🖥️', color: '#f97316', bg: '#fff7ed' },
  { id: 'whatsapp',   label: 'WhatsApp Video',    icon: '📱', color: '#25D366', bg: '#f0fdf4' },
  { id: 'in_person',  label: 'In-Person',         icon: '📍', color: '#64748b', bg: '#f8fafc' },
];

const TARGET_AUDIENCES = [
  { id: 'all',          label: 'Everyone',       icon: '🌍' },
  { id: 'distributors', label: 'Distributors',   icon: '🏪' },
  { id: 'branch_staff', label: 'Branch Staff',   icon: '🏬' },
  { id: 'consultants',  label: 'Consultants',    icon: '🩺' },
  { id: 'all_staff',    label: 'All Staff',      icon: '👥' },
];

function getPlatform(id) {
  return MEETING_PLATFORMS.find(p => p.id === id) || MEETING_PLATFORMS[MEETING_PLATFORMS.length - 1];
}

function getAudience(id) {
  return TARGET_AUDIENCES.find(a => a.id === id) || TARGET_AUDIENCES[0];
}

function MeetingCard({ event, isTrainer, onDelete, onEdit }) {
  const platform = getPlatform(event.platform || 'in_person');
  const audience = getAudience(event.target_audience || 'all');
  const isOnline = event.platform && event.platform !== 'in_person';
  const isPast = new Date(event.date) < new Date(new Date().toDateString());
  const hasLink = !!event.meeting_link;

  return (
    <div className={`rounded-xl border-2 overflow-hidden transition-shadow hover:shadow-md ${isPast ? 'opacity-70' : ''}`}
      style={{ borderColor: hasLink && !isPast ? '#16a34a55' : isOnline ? platform.color + '55' : '#e2e8f0' }}>
      <div className="flex items-center gap-3 px-4 py-2 text-xs font-semibold"
        style={{ background: platform.bg, color: platform.color }}>
        <span className="text-base">{platform.icon}</span>
        <span>{platform.label}</span>
        <span className="ml-auto flex items-center gap-1.5">
          <span>{audience.icon}</span> {audience.label}
        </span>
      </div>
      <div className="p-4 bg-white">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl flex flex-col items-center justify-center flex-shrink-0 border-2"
            style={{ background: platform.bg, borderColor: platform.color + '44' }}>
            <span className="text-xs font-bold uppercase" style={{ color: platform.color }}>
              {new Date(event.date).toLocaleDateString('en', { month: 'short' })}
            </span>
            <span className="text-xl font-black text-gray-800 leading-tight">{new Date(event.date).getDate()}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-gray-900 text-base leading-tight">{event.title}</h4>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5">
              {event.time && (
                <span className="text-xs text-gray-500 flex items-center gap-1">🕐 {event.time}</span>
              )}
              {event.location && (
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <MapPin size={11} /> {event.location}
                </span>
              )}
              {event.trainer && (
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Users size={11} /> {event.trainer}
                </span>
              )}
            </div>
            {event.description && (
              <p className="text-xs text-gray-600 mt-2 leading-relaxed line-clamp-2">{event.description}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <Badge variant={isPast ? 'default' : 'info'}>{isPast ? 'Past' : 'Upcoming'}</Badge>
            {isTrainer && (
              <div className="flex gap-2 mt-1">
                <button onClick={() => onEdit(event)}
                  className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700">
                  ✏️ Edit
                </button>
                <button onClick={() => onDelete(event.id)}
                  className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600">
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {hasLink && (
        <div style={{ borderTop: `1px solid ${isPast ? '#e2e8f0' : '#bbf7d0'}`, background: isPast ? '#f8fafc' : '#f0fdf4', padding: '9px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '0.78rem', color: isPast ? '#94a3b8' : '#15803d', fontWeight: 600, flex: 1 }}>
            {isPast ? '🔗 Meeting link (session ended)' : '🟢 Online meeting link is active — click to join'}
          </span>
          <a href={event.meeting_link} target="_blank" rel="noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, fontWeight: 800, fontSize: '0.82rem', textDecoration: 'none', background: isPast ? '#94a3b8' : '#16a34a', color: '#fff', boxShadow: isPast ? 'none' : '0 2px 8px rgba(22,163,74,0.3)' }}>
            <ExternalLink size={13} /> {isPast ? 'View Link' : 'Join Now'}
          </a>
        </div>
      )}
    </div>
  );
}

function ScheduleTab({ isTrainer }) {
  const emptyForm = {
    title: '', date: '', time: '', location: '', trainer: '',
    platform: 'in_person', meeting_link: '', target_audience: 'all', description: '',
  };
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [filterAudience, setFilterAudience] = useState('');
  const [filterPlatform, setFilterPlatform] = useState('');
  const [showPast, setShowPast] = useState(false);

  const loadSchedules = () => {
    setLoading(true);
    api.get('/training-schedules')
      .then(data => setEvents(Array.isArray(data) ? data : []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadSchedules(); }, []);

  const handleEdit = (event) => {
    setForm({
      title: event.title || '',
      date: event.date || '',
      time: event.time || '',
      location: event.location || '',
      trainer: event.trainer || '',
      platform: event.platform || 'in_person',
      meeting_link: event.meeting_link || '',
      target_audience: event.target_audience || 'all',
      description: event.description || '',
    });
    setEditingId(event.id);
    setShowForm(true);
    setMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.title || !form.date) { setMessage('Error: Title and date are required'); return; }
    if (form.platform !== 'in_person' && !form.meeting_link) {
      setMessage('Error: Please enter the meeting link for online sessions'); return;
    }
    setSaving(true);
    setMessage('');
    try {
      if (editingId) {
        await api.put('/training-schedules', { ...form, id: editingId });
        setMessage('Session updated successfully!');
      } else {
        await api.post('/training-schedules', form);
        setMessage('Session scheduled successfully!');
      }
      setForm(emptyForm);
      setShowForm(false);
      setEditingId(null);
      loadSchedules();
    } catch (err) {
      setMessage('Error: ' + (err.message || 'Failed to save'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Remove this training event?')) return;
    try {
      await api.delete(`/training-schedules?id=${id}`);
      setEvents(prev => prev.filter(e => e.id !== id));
      setMessage('Event removed.');
    } catch (err) { setMessage('Error: ' + err.message); }
  };

  const selectedPlatform = getPlatform(form.platform);
  const isOnlinePlatform = form.platform !== 'in_person';

  let visible = events;
  if (!showPast) visible = visible.filter(e => new Date(e.date) >= new Date(new Date().toDateString()));
  if (filterAudience) visible = visible.filter(e => (e.target_audience || 'all') === filterAudience);
  if (filterPlatform) visible = visible.filter(e => (e.platform || 'in_person') === filterPlatform);

  return (
    <div className="space-y-4">
      {message && <Alert type={message.startsWith('Error') ? 'error' : 'success'}>{message}</Alert>}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="font-bold text-gray-800 flex items-center gap-2"><BookOpen size={18} /> Training Schedule</h3>
            {isTrainer && (
              <Button size="sm" onClick={() => { setShowForm(v => !v); setEditingId(null); setForm(emptyForm); setMessage(''); }}>
                {showForm ? 'Cancel' : '+ Schedule Session'}
              </Button>
            )}
          </div>
          {showForm && editingId && (
            <p className="text-xs text-blue-600 font-semibold mt-1 px-1">✏️ Editing existing session — save to update</p>
          )}
        </CardHeader>

        {showForm && isTrainer && (
          <CardBody className="border-t border-gray-100 bg-gray-50">
            <form onSubmit={handleSave} className="space-y-4">
              <Input label="Session Title *" value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Monthly Distributor Briefing" />

              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Platform *</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {MEETING_PLATFORMS.map(p => (
                    <button key={p.id} type="button"
                      onClick={() => setForm({ ...form, platform: p.id })}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 text-sm font-semibold transition-all"
                      style={{
                        borderColor: form.platform === p.id ? p.color : '#e2e8f0',
                        background: form.platform === p.id ? p.bg : '#fff',
                        color: form.platform === p.id ? p.color : '#64748b',
                      }}>
                      <span>{p.icon}</span>
                      <span className="text-xs">{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <Input
                label={isOnlinePlatform ? `${selectedPlatform.label} Meeting Link *` : 'Online Meeting Link (optional — for hybrid sessions)'}
                type="url" value={form.meeting_link}
                onChange={e => setForm({ ...form, meeting_link: e.target.value })}
                placeholder={isOnlinePlatform ? `Paste your ${selectedPlatform.label} invite link here` : 'e.g. https://zoom.us/j/... (leave blank if no online component)'} />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input label="Date *" type="date" value={form.date}
                  onChange={e => setForm({ ...form, date: e.target.value })} />
                <Input label="Time" type="time" value={form.time}
                  onChange={e => setForm({ ...form, time: e.target.value })} />
              </div>

              <Input label={isOnlinePlatform ? 'Physical Location (optional)' : 'Physical Location'} value={form.location}
                onChange={e => setForm({ ...form, location: e.target.value })}
                placeholder="e.g. Head Office Training Room, Windhoek" />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input label="Presenter / Trainer" value={form.trainer}
                  onChange={e => setForm({ ...form, trainer: e.target.value })}
                  placeholder="e.g. Mr. Johnson" />
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Target Audience *</label>
                  <select value={form.target_audience}
                    onChange={e => setForm({ ...form, target_audience: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                    {TARGET_AUDIENCES.map(a => (
                      <option key={a.id} value={a.id}>{a.icon} {a.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Agenda / Description</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={3} placeholder="Briefly describe what will be covered in this session…"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
              </div>

              <div className="flex gap-3">
                <Button type="submit" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Update Session' : 'Schedule Session'}</Button>
                <Button type="button" variant="secondary" onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm); }}>Cancel</Button>
              </div>
            </form>
          </CardBody>
        )}
      </Card>

      <Card>
        <CardBody>
          <div className="flex flex-wrap gap-3 items-center">
            <select value={filterAudience} onChange={e => setFilterAudience(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none">
              <option value="">All Audiences</option>
              {TARGET_AUDIENCES.map(a => <option key={a.id} value={a.id}>{a.icon} {a.label}</option>)}
            </select>
            <select value={filterPlatform} onChange={e => setFilterPlatform(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none">
              <option value="">All Platforms</option>
              {MEETING_PLATFORMS.map(p => <option key={p.id} value={p.id}>{p.icon} {p.label}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={showPast} onChange={e => setShowPast(e.target.checked)} className="rounded" />
              Show past sessions
            </label>
            <span className="ml-auto text-xs text-gray-400">{visible.length} session{visible.length !== 1 ? 's' : ''}</span>
          </div>
        </CardBody>
      </Card>

      {loading ? (
        <LoadingSpinner />
      ) : visible.length === 0 ? (
        <div className="text-center py-12">
          <BookOpen size={48} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">No upcoming sessions scheduled</p>
          <p className="text-gray-400 text-sm mt-1">
            {isTrainer ? 'Click "Schedule Session" to add one.' : 'Check back soon for upcoming training events.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(event => (
            <MeetingCard key={event.id} event={event} isTrainer={isTrainer} onDelete={handleDelete} onEdit={handleEdit} />
          ))}
        </div>
      )}
    </div>
  );
}
