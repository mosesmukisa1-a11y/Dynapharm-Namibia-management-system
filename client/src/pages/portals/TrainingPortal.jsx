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

  const goToUpload = (type) => {
    if (isTrainer) setActiveTab('upload');
  };

  return (
    <div>
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        {activeTab === 'materials' && <MaterialsTab isTrainer={isTrainer} onUpload={goToUpload} />}
        {activeTab === 'videos' && <VideosTab isTrainer={isTrainer} onUpload={goToUpload} />}
        {activeTab === 'photos' && <PhotosTab isTrainer={isTrainer} onUpload={goToUpload} />}
        {activeTab === 'upload' && isTrainer && <UploadTab />}
        {activeTab === 'schedule' && <ScheduleTab isTrainer={isTrainer} />}
        {activeTab === 'staffServices' && <StaffServicesTab accentColor="#065f46" />}
        {activeTab === 'messages' && <StaffMessagesTab accentColor="#065f46" />}
      </div>
    </div>
  );
}

function MaterialsTab({ isTrainer, onUpload }) {
  const [search, setSearch] = useState('');
  const [uploaded, setUploaded] = useState([]);
  const [loadingUploaded, setLoadingUploaded] = useState(true);

  useEffect(() => {
    api.get('/media?upload_type=training')
      .then(data => {
        const rows = Array.isArray(data) ? data : [];
        setUploaded(rows.filter(r =>
          (r.media_type === 'document' || r.category === 'document') ||
          (r.mime_type || '').startsWith('application/') ||
          (r.mime_type || '').startsWith('text/')
        ));
      })
      .catch(() => setUploaded([]))
      .finally(() => setLoadingUploaded(false));
  }, []);

  const staticMaterials = [
    { id: 'static-1', title: 'Product Knowledge Guide', type: 'PDF', category: 'Products', description: 'Comprehensive guide to all Dynapharm products, ingredients, and benefits.', file_url: null },
    { id: 'static-2', title: 'Sales Techniques Manual', type: 'PDF', category: 'Sales', description: 'Effective sales strategies for distributors and branch staff.', file_url: null },
    { id: 'static-3', title: 'Health Assessment Protocol', type: 'PDF', category: 'Health', description: 'Standard procedures for conducting full body check-ups.', file_url: null },
    { id: 'static-4', title: 'Distributor Onboarding Pack', type: 'PDF', category: 'Onboarding', description: 'Complete onboarding guide for new distributors.', file_url: null },
    { id: 'static-5', title: 'Branch Operations Manual', type: 'PDF', category: 'Operations', description: 'Standard operating procedures for branch management.', file_url: null },
  ];

  const uploadedMapped = uploaded.map(u => ({
    id: u.id,
    title: u.entity_name || u.filename || 'Uploaded Material',
    type: (u.mime_type || '').includes('pdf') ? 'PDF' : (u.mime_type || '').includes('word') ? 'DOCX' : 'DOC',
    category: u.category || 'General',
    description: u.description || '',
    file_url: u.file_url,
    uploaded_at: u.uploaded_at,
    isReal: true,
  }));

  const allMaterials = [...uploadedMapped, ...staticMaterials];
  const filtered = allMaterials.filter(m =>
    !search || m.title.toLowerCase().includes(search.toLowerCase()) || (m.category || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-0">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search training materials..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
        {isTrainer && (
          <button onClick={onUpload}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: '#c41e3a', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(196,30,58,0.25)' }}>
            <Upload size={15} /> Upload Material
          </button>
        )}
      </div>

      {uploadedMapped.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Uploaded by Training Team</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {uploadedMapped.filter(m => !search || m.title.toLowerCase().includes(search.toLowerCase())).map(mat => (
              <Card key={mat.id} className="hover:shadow-md transition-shadow border-l-4 border-l-primary">
                <CardBody>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                      <FileText size={20} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 text-sm leading-snug">{mat.title}</h3>
                      {mat.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{mat.description}</p>}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge variant="info">{mat.category}</Badge>
                        <Badge variant="success">{mat.type}</Badge>
                        {mat.uploaded_at && <span className="text-xs text-gray-400">{new Date(mat.uploaded_at).toLocaleDateString()}</span>}
                      </div>
                    </div>
                  </div>
                  {mat.file_url ? (
                    <a href={mat.file_url} target="_blank" rel="noreferrer" download
                      className="w-full mt-3 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-white bg-primary no-underline">
                      <Eye size={13} /> View / Download
                    </a>
                  ) : (
                    <Button size="sm" variant="secondary" className="w-full mt-3" disabled>
                      <Eye size={14} /> View Material
                    </Button>
                  )}
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      )}

      {uploadedMapped.length > 0 && (
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Standard Reference Materials</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {staticMaterials.filter(m => !search || m.title.toLowerCase().includes(search.toLowerCase()) || m.category.toLowerCase().includes(search.toLowerCase())).map(mat => (
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
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-8 text-gray-400">No materials matching "{search}"</div>
        )}
      </div>

      {isTrainer && (
        <div className="mt-6 p-4 rounded-xl border-2 border-dashed border-gray-200 text-center">
          <p className="text-sm text-gray-500 mb-3">Have a document, guide, or training file to share?</p>
          <button onClick={onUpload}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 20px', background: '#c41e3a', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', boxShadow: '0 2px 8px rgba(196,30,58,0.25)' }}>
            <Upload size={15} /> Upload Training Material
          </button>
        </div>
      )}
    </div>
  );
}

function VideoPlayerModal({ video, onClose }) {
  const videoRef = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 860, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: '1rem', flex: 1, minWidth: 0 }}>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {video.entity_name || video.filename || 'Training Video'}
            </div>
            {video.category && video.category !== 'video' && (
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 2 }}>{video.category}</div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, shrink: 0 }}>
            {video.file_url && (
              <a
                href={video.file_url}
                target="_blank"
                rel="noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 8, background: '#1e293b', color: '#cbd5e1', fontSize: '0.8rem', fontWeight: 600, textDecoration: 'none', border: '1px solid #334155' }}
              >
                <ExternalLink size={13} /> Open in Player
              </a>
            )}
            <button
              onClick={onClose}
              style={{ width: 36, height: 36, borderRadius: 8, background: '#1e293b', border: '1px solid #334155', color: '#cbd5e1', fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >✕</button>
          </div>
        </div>

        {/* Player */}
        <div style={{ background: '#000', borderRadius: 12, overflow: 'hidden', boxShadow: '0 24px 48px rgba(0,0,0,0.6)' }}>
          <video
            ref={videoRef}
            src={video.file_url}
            controls
            autoPlay
            playsInline
            controlsList="nodownload"
            style={{ width: '100%', maxHeight: '72vh', display: 'block', outline: 'none' }}
          />
        </div>

        {video.description && (
          <p style={{ color: '#94a3b8', fontSize: '0.82rem', lineHeight: 1.5, margin: 0 }}>{video.description}</p>
        )}
      </div>
    </div>
  );
}

function VideosTab({ isTrainer, onUpload }) {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeVideo, setActiveVideo] = useState(null);

  useEffect(() => {
    api.get('/media?upload_type=training')
      .then(data => {
        const rows = Array.isArray(data) ? data : [];
        setVideos(rows.filter(r =>
          (r.mime_type || '').startsWith('video/') ||
          r.media_type === 'video' || r.category === 'video'
        ));
      })
      .catch(() => setVideos([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      {activeVideo && <VideoPlayerModal video={activeVideo} onClose={() => setActiveVideo(null)} />}

      {isTrainer && (
        <div className="flex justify-end mb-4">
          <button onClick={onUpload}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: '#c41e3a', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', boxShadow: '0 2px 8px rgba(196,30,58,0.25)' }}>
            <Upload size={15} /> Upload Video
          </button>
        </div>
      )}

      {videos.length === 0 ? (
        <EmptyState
          icon={<Video size={48} />}
          title="No Training Videos Yet"
          description={isTrainer ? 'Click "Upload Video" above to add the first training video.' : 'Training videos will appear here once uploaded by trainers.'}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {videos.map(vid => (
            <Card key={vid.id} className="overflow-hidden" style={{ cursor: vid.file_url ? 'pointer' : 'default' }}>
              {/* Thumbnail / preview — click to open modal player */}
              <div
                onClick={() => vid.file_url && setActiveVideo(vid)}
                style={{ background: '#0f172a', position: 'relative', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
              >
                {vid.file_url ? (
                  <video
                    src={vid.file_url + '#t=0.5'}
                    preload="metadata"
                    playsInline
                    muted
                    style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
                  />
                ) : null}
                {/* Play overlay */}
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.15)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.35)'}
                >
                  <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(196,30,58,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}>
                    <Play size={22} color="#fff" style={{ marginLeft: 3 }} />
                  </div>
                </div>
              </div>

              <CardBody>
                <h3 className="font-semibold text-gray-900 text-sm leading-snug mb-1">
                  {vid.entity_name || vid.filename || 'Untitled Video'}
                </h3>
                {vid.description && <p className="text-xs text-gray-500 line-clamp-2 mb-2">{vid.description}</p>}
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  {vid.category && vid.category !== 'video' && <Badge variant="info">{vid.category}</Badge>}
                  {vid.uploaded_by && <span className="text-xs text-gray-400">by {vid.uploaded_by}</span>}
                  {vid.file_size && <span className="text-xs text-gray-400">{(vid.file_size / 1024 / 1024).toFixed(1)} MB</span>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => vid.file_url && setActiveVideo(vid)}
                    disabled={!vid.file_url}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, background: vid.file_url ? '#c41e3a' : '#e2e8f0', color: vid.file_url ? '#fff' : '#94a3b8', border: 'none', fontWeight: 700, fontSize: '0.8rem', cursor: vid.file_url ? 'pointer' : 'not-allowed' }}
                  >
                    <Play size={13} /> Play
                  </button>
                  {vid.file_url && (
                    <a
                      href={vid.file_url}
                      target="_blank"
                      rel="noreferrer"
                      title="Open in device media player"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 10px', borderRadius: 8, background: '#f1f5f9', color: '#475569', textDecoration: 'none', border: '1px solid #e2e8f0' }}
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {isTrainer && videos.length > 0 && (
        <div className="mt-5 p-4 rounded-xl border-2 border-dashed border-gray-200 text-center">
          <button onClick={onUpload}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 20px', background: '#c41e3a', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', boxShadow: '0 2px 8px rgba(196,30,58,0.25)' }}>
            <Upload size={15} /> Upload Another Video
          </button>
        </div>
      )}
    </div>
  );
}

function PhotosTab({ isTrainer, onUpload }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/media?upload_type=training')
      .then(data => {
        const rows = Array.isArray(data) ? data : [];
        setPhotos(rows.filter(r =>
          (r.mime_type || '').startsWith('image/') ||
          r.media_type === 'photo' || r.category === 'photo'
        ));
      })
      .catch(() => setPhotos([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      {isTrainer && (
        <div className="flex justify-end mb-4">
          <button onClick={onUpload}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: '#c41e3a', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', boxShadow: '0 2px 8px rgba(196,30,58,0.25)' }}>
            <Upload size={15} /> Upload Photo
          </button>
        </div>
      )}
      {photos.length === 0 ? (
        <EmptyState
          icon={<Image size={48} />}
          title="No Training Photos Yet"
          description={isTrainer ? 'Click "Upload Photo" above to add training event photos.' : 'Training photos and event galleries will appear here once uploaded.'}
        />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {photos.map(photo => (
            <a key={photo.id} href={photo.file_url} target="_blank" rel="noreferrer"
              style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0', background: '#f8fafc', display: 'block', textDecoration: 'none' }}
              className="hover:shadow-md transition-shadow">
              <div className="h-40 bg-gray-100">
                <img src={photo.file_url} alt={photo.entity_name || photo.filename}
                  className="w-full h-full object-cover"
                  onError={e => { e.target.style.display = 'none'; }}
                />
              </div>
              <div style={{ padding: '6px 10px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p className="text-xs text-gray-700 truncate">{photo.entity_name || photo.filename || 'Photo'}</p>
                <span style={{ fontSize: '0.7rem', color: '#c41e3a', fontWeight: 700 }}>View ↗</span>
              </div>
            </a>
          ))}
        </div>
      )}
      {isTrainer && photos.length > 0 && (
        <div className="mt-5 p-4 rounded-xl border-2 border-dashed border-gray-200 text-center">
          <button onClick={onUpload}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 20px', background: '#c41e3a', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', boxShadow: '0 2px 8px rgba(196,30,58,0.25)' }}>
            <Upload size={15} /> Upload More Photos
          </button>
        </div>
      )}
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
      formData.append('mediaType', uploadType);
      if (form.description) formData.append('description', form.description);
      formData.append('category', form.category || uploadType);

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

function getIsPast(event) {
  if (!event.date) return false;
  const timeStr = event.time || '23:59';
  const dt = new Date(`${event.date}T${timeStr}`);
  return dt < new Date();
}

function MeetingCard({ event, isTrainer, onDelete, onEdit }) {
  const platform = getPlatform(event.platform || 'in_person');
  const audience = getAudience(event.target_audience || 'all');
  const isOnline = event.platform && event.platform !== 'in_person';
  const isPast = getIsPast(event);
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
            <Badge variant={isPast ? 'default' : 'info'}>{isPast ? 'Ended' : 'Upcoming'}</Badge>
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
  if (!showPast) visible = visible.filter(e => !getIsPast(e));
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
