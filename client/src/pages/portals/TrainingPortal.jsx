import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/constants';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, Alert, Modal } from '../../components/ui';
import { GraduationCap, Video, Image, Upload, Search, Play, Eye, FileText, Users, BookOpen } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export default function TrainingPortal() {
  const [activeTab, setActiveTab] = useState('materials');
  const { user } = useAuth();
  const isTrainer = user?.role === 'admin' || user?.role === 'training' || user?.role === 'gm';

  const tabs = [
    { id: 'materials', label: 'Training Materials', icon: '📚' },
    { id: 'videos', label: 'Videos', icon: '🎬' },
    { id: 'photos', label: 'Photos', icon: '📷' },
    ...(isTrainer ? [{ id: 'upload', label: 'Upload Content', icon: '📤' }] : []),
    { id: 'schedule', label: 'Schedule', icon: '📅' },
  ];

  return (
    <div>
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        {activeTab === 'materials' && <MaterialsTab />}
        {activeTab === 'videos' && <VideosTab />}
        {activeTab === 'photos' && <PhotosTab />}
        {activeTab === 'upload' && isTrainer && <UploadTab />}
        {activeTab === 'schedule' && <ScheduleTab />}
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
  return (
    <div>
      <EmptyState
        icon={<Video size={48} />}
        title="Training Videos"
        description="Training videos will appear here once uploaded by trainers. Videos cover product knowledge, sales techniques, and health assessment procedures."
      />
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { title: 'Product Introduction', duration: '15:30', category: 'Products' },
          { title: 'Sales Closing Techniques', duration: '22:45', category: 'Sales' },
          { title: 'Health Check-Up Procedures', duration: '18:20', category: 'Health' },
        ].map((vid, idx) => (
          <Card key={idx} className="hover:shadow-md transition-shadow">
            <div className="h-40 bg-gray-100 flex items-center justify-center rounded-t-xl">
              <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center">
                <Play size={24} className="text-primary ml-1" />
              </div>
            </div>
            <CardBody>
              <h3 className="font-semibold text-gray-900 text-sm">{vid.title}</h3>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="info">{vid.category}</Badge>
                <span className="text-xs text-gray-400">{vid.duration}</span>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PhotosTab() {
  return (
    <div>
      <EmptyState
        icon={<Image size={48} />}
        title="Training Photos"
        description="Training photos and event galleries will be displayed here once uploaded by trainers."
      />
    </div>
  );
}

function UploadTab() {
  const [uploadType, setUploadType] = useState('video');
  const [form, setForm] = useState({ title: '', description: '', category: 'Products', file: null });
  const [message, setMessage] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title) { setMessage('Error: Please enter a title'); return; }
    setMessage('Content uploaded successfully! It will be reviewed and made available to staff and distributors.');
    setForm({ title: '', description: '', category: 'Products', file: null });
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
          <Button type="submit"><Upload size={14} /> Upload {uploadType}</Button>
        </form>
      </CardBody>
    </Card>
  );
}

function ScheduleTab() {
  return (
    <Card>
      <CardHeader>
        <h3 className="font-bold text-gray-800 flex items-center gap-2"><BookOpen size={18} /> Training Schedule</h3>
      </CardHeader>
      <CardBody>
        <div className="space-y-4">
          {[
            { title: 'New Product Launch Training', date: '2025-04-15', time: '09:00', location: 'Windhoek CBD', trainer: 'Head Office' },
            { title: 'Sales Mastery Workshop', date: '2025-04-22', time: '14:00', location: 'Online (Zoom)', trainer: 'Sales Team' },
            { title: 'Health Assessment Certification', date: '2025-05-01', time: '08:30', location: 'Ondangwa Branch', trainer: 'Medical Team' },
          ].map((event, idx) => (
            <div key={idx} className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex flex-col items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-primary">{new Date(event.date).toLocaleDateString('en', { month: 'short' })}</span>
                <span className="text-sm font-bold text-gray-800">{new Date(event.date).getDate()}</span>
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-gray-800 text-sm">{event.title}</h4>
                <p className="text-xs text-gray-500 mt-1">{event.time} | {event.location}</p>
                <p className="text-xs text-gray-400">Trainer: {event.trainer}</p>
              </div>
              <Badge variant="info">Upcoming</Badge>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
