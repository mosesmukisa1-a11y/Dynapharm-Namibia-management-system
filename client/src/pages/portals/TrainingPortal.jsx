import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/constants';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, Alert, Modal } from '../../components/ui';
import { GraduationCap, Video, Image, Upload, Search, Play, Eye, FileText, Users, BookOpen } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import StaffServicesTab from '../../components/StaffServicesTab';

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
          try {
            const data = JSON.parse(xhr.responseText);
            if (data.success) resolve(data);
            else reject(new Error(data.error || 'Upload failed'));
          } catch {
            reject(new Error('Server error'));
          }
        };
        xhr.onerror = () => reject(new Error('Network error — check your connection'));
        xhr.ontimeout = () => reject(new Error('Upload timed out — file may be too large'));
        xhr.timeout = 10 * 60 * 1000; // 10 minutes for large video files
        xhr.send(formData);
      });

      setProgress(100);
      setMessage('Content uploaded successfully! It will be available to staff and distributors.');
      setForm({ title: '', description: '', category: 'Products', file: null });
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
            <input type="file" accept={uploadType === 'video' ? 'video/*' : uploadType === 'photo' ? 'image/*' : '.pdf,.doc,.docx'}
              onChange={e => setForm({ ...form, file: e.target.files?.[0] || null })}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-primary/10 file:text-primary" />
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

function ScheduleTab({ isTrainer }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', date: '', time: '', location: '', trainer: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const loadSchedules = () => {
    setLoading(true);
    api.get('/training-schedules')
      .then(data => setEvents(Array.isArray(data) ? data : []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadSchedules(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.title || !form.date) { setMessage('Error: Title and date are required'); return; }
    setSaving(true);
    setMessage('');
    try {
      await api.post('/training-schedules', form);
      setForm({ title: '', date: '', time: '', location: '', trainer: '' });
      setShowForm(false);
      loadSchedules();
    } catch (err) {
      setMessage('Error: ' + (err.message || 'Failed to save'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-800 flex items-center gap-2"><BookOpen size={18} /> Training Schedule</h3>
          {isTrainer && (
            <Button size="sm" onClick={() => setShowForm(v => !v)}>
              {showForm ? 'Cancel' : '+ Add Event'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardBody>
        {message && <Alert type={message.startsWith('Error') ? 'error' : 'success'} className="mb-4">{message}</Alert>}

        {showForm && isTrainer && (
          <form onSubmit={handleAdd} className="mb-6 p-4 bg-gray-50 rounded-xl space-y-3">
            <Input label="Title *" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Event title" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Date *" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              <Input label="Time" type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} />
            </div>
            <Input label="Location" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="e.g. Windhoek CBD" />
            <Input label="Trainer" value={form.trainer} onChange={e => setForm({ ...form, trainer: e.target.value })} placeholder="e.g. Head Office" />
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Event'}</Button>
          </form>
        )}

        {loading ? (
          <LoadingSpinner />
        ) : events.length === 0 ? (
          <EmptyState icon={<BookOpen size={48} />} title="No Scheduled Events" description="No training events have been scheduled yet." />
        ) : (
          <div className="space-y-4">
            {events.map(event => (
              <div key={event.id} className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex flex-col items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-primary">{new Date(event.date).toLocaleDateString('en', { month: 'short' })}</span>
                  <span className="text-sm font-bold text-gray-800">{new Date(event.date).getDate()}</span>
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-800 text-sm">{event.title}</h4>
                  {(event.time || event.location) && (
                    <p className="text-xs text-gray-500 mt-1">{[event.time, event.location].filter(Boolean).join(' | ')}</p>
                  )}
                  {event.trainer && <p className="text-xs text-gray-400">Trainer: {event.trainer}</p>}
                </div>
                <Badge variant={new Date(event.date) >= new Date() ? 'info' : 'default'}>
                  {new Date(event.date) >= new Date() ? 'Upcoming' : 'Past'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
