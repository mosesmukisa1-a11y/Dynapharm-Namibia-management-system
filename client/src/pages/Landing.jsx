import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LoginModal } from '../components/LoginModal';
import { DistributorLoginModal } from '../components/DistributorLoginModal';
import { useState, useEffect } from 'react';
import { Heart, Leaf, Globe, Users, ShieldCheck, Award, ChevronRight, LogIn, ShoppingCart, Stethoscope, MapPin, Phone, UserCircle } from 'lucide-react';
import { BRANCH_DETAILS, COMPANY_INFO } from '../lib/constants';

const FALLBACK_SLIDES = [
  { bg: 'from-primary to-primary-dark' },
  { bg: 'from-[#1a5276] to-[#2c3e50]' },
  { bg: 'from-[#6c3483] to-[#4a235a]' },
];

export default function Landing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loginOpen, setLoginOpen] = useState(false);
  const [distributorLoginOpen, setDistributorLoginOpen] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [heroImages, setHeroImages] = useState([]);

  useEffect(() => {
    fetch('/api/media?upload_type=training', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const rows = Array.isArray(data) ? data : [];
        const photos = rows.filter(r =>
          (r.mime_type || '').startsWith('image/') ||
          r.media_type === 'photo' || r.category === 'photo'
        );
        setHeroImages(photos);
      })
      .catch(() => {});
  }, []);

  const slideCount = heroImages.length > 0 ? heroImages.length : FALLBACK_SLIDES.length;

  useEffect(() => {
    setCurrentSlide(0);
    const timer = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % slideCount);
    }, 6000);
    return () => clearInterval(timer);
  }, [slideCount]);

  return (
    <div className="min-h-screen">
      <section className="relative text-white overflow-hidden" style={{ background: '#7b1226' }}>

        {/* Photo slideshow backgrounds */}
        {heroImages.length > 0 ? (
          <>
            {heroImages.map((img, idx) => (
              <div key={img.id || idx} className="absolute inset-0 transition-opacity duration-1000"
                style={{
                  opacity: currentSlide === idx ? 1 : 0,
                  backgroundImage: `url(${img.file_url})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                }}
              />
            ))}
            {/* Dark overlay so text stays readable */}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.52) 0%, rgba(90,10,20,0.72) 100%)' }} />
          </>
        ) : (
          <>
            {/* Gradient fallback slides */}
            {FALLBACK_SLIDES.map((slide, idx) => (
              <div key={idx} className={`absolute inset-0 bg-gradient-to-br ${slide.bg} transition-opacity duration-1000`}
                style={{ opacity: currentSlide === idx ? 1 : 0 }} />
            ))}
            <div className="absolute inset-0 opacity-10">
              <div className="absolute -top-40 -right-40 w-96 h-96 bg-white rounded-full" />
              <div className="absolute -bottom-20 -left-20 w-72 h-72 bg-white rounded-full" />
              <div className="absolute top-20 left-1/3 w-48 h-48 bg-white rounded-full" />
            </div>
          </>
        )}

        <div className="relative max-w-[1200px] mx-auto px-6 py-24 text-center">
          <img src={COMPANY_INFO.logo} alt="Dynapharm" className="h-20 mx-auto mb-6 drop-shadow-lg" onError={e => { e.target.style.display = 'none'; }} />
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-4 leading-tight">
            Welcome to the World of Dynapharm!
          </h1>
          <p className="text-xl md:text-2xl opacity-90 mb-3">{COMPANY_INFO.tagline}</p>
          <p className="text-base opacity-80 max-w-2xl mx-auto mb-10 leading-relaxed">
            Where dreams come true through science, knowledge, and new ideas. Dynapharm was established
            to help and share opportunities that improve the lives and health of individuals around the globe.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <button
              onClick={() => navigate('/shop')}
              className="px-8 py-3.5 bg-white text-primary font-bold rounded-full hover:bg-gray-100 transition-all hover:scale-105 shadow-lg cursor-pointer flex items-center gap-2"
            >
              <ShoppingCart size={18} /> Online Shop
            </button>
            <button
              onClick={() => navigate('/checkup')}
              className="px-8 py-3.5 bg-white/20 backdrop-blur text-white font-bold rounded-full border-2 border-white/40 hover:bg-white/30 transition-all cursor-pointer flex items-center gap-2"
            >
              <Stethoscope size={18} /> Full Body Check Up
            </button>
            {!user && (
              <>
                <button
                  onClick={() => setDistributorLoginOpen(true)}
                  className="px-8 py-3.5 bg-white/10 backdrop-blur text-white font-bold rounded-full border-2 border-white/30 hover:bg-white/20 transition-all cursor-pointer flex items-center gap-2"
                >
                  <UserCircle size={18} /> Distributor Login
                </button>
                <button
                  onClick={() => setLoginOpen(true)}
                  className="px-7 py-3 bg-white/5 backdrop-blur text-white/80 font-medium rounded-full border border-white/20 hover:bg-white/10 transition-all cursor-pointer flex items-center gap-2 text-sm"
                >
                  <LogIn size={16} /> Staff Login
                </button>
              </>
            )}
          </div>

          <div className="flex justify-center gap-2 mt-8">
            {Array.from({ length: slideCount }).map((_, idx) => (
              <button key={idx} onClick={() => setCurrentSlide(idx)}
                className={`w-3 h-3 rounded-full transition-all cursor-pointer ${currentSlide === idx ? 'bg-white scale-125' : 'bg-white/40'}`} />
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="max-w-[1200px] mx-auto px-6">
          <h2 className="text-3xl font-bold text-center text-secondary mb-12">What Drives Us</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: Heart, title: 'Health First', desc: 'We pioneer healthcare and lifestyle products for families, entrepreneurs, and communities.' },
              { icon: Leaf, title: 'Natural Products', desc: 'Our products are developed from natural ingredients, backed by scientific research.' },
              { icon: Globe, title: 'Global Reach', desc: 'Operating across multiple countries, bringing health solutions to communities worldwide.' },
            ].map((item, i) => (
              <div key={i} className="text-center p-8 rounded-xl bg-gray-50 hover:bg-white hover:shadow-lg transition-all group">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <item.icon size={28} className="text-primary" />
                </div>
                <h3 className="text-xl font-bold text-secondary mb-3">{item.title}</h3>
                <p className="text-gray-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-gray-50">
        <div className="max-w-[1200px] mx-auto px-6">
          <h2 className="text-3xl font-bold text-center text-secondary mb-12">Our Network</h2>
          <div className="grid md:grid-cols-4 gap-6">
            {[
              { icon: Users, value: '50,000+', label: 'Active Distributors' },
              { icon: Globe, value: '15+', label: 'Countries' },
              { icon: ShieldCheck, value: '95+', label: 'Products' },
              { icon: Award, value: '20+', label: 'Years of Excellence' },
            ].map((stat, i) => (
              <div key={i} className="text-center p-6 bg-white rounded-xl shadow-sm">
                <stat.icon size={32} className="text-primary mx-auto mb-3" />
                <div className="text-3xl font-bold text-secondary">{stat.value}</div>
                <div className="text-sm text-gray-500 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-[1200px] mx-auto px-6">
          <h2 className="text-3xl font-bold text-center text-secondary mb-4">Our Outlets</h2>
          <p className="text-center text-gray-500 mb-10">Visit any of our {BRANCH_DETAILS.length} branches across Namibia</p>
          <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-4">
            {BRANCH_DETAILS.map((branch, i) => (
              <div key={i} className="p-4 bg-gray-50 rounded-xl hover:shadow-md transition-all border border-gray-100">
                <h3 className="font-bold text-gray-900 text-sm mb-2 flex items-center gap-1.5">
                  <MapPin size={14} className="text-primary flex-shrink-0" /> {branch.name}
                </h3>
                <p className="text-xs text-gray-500 mb-2 leading-relaxed">{branch.address}</p>
                <p className="text-xs text-primary font-medium flex items-center gap-1">
                  <Phone size={12} /> {branch.phone}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-gradient-to-br from-primary to-primary-dark text-white">
        <div className="max-w-[1200px] mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
          <p className="text-lg opacity-90 mb-8 max-w-xl mx-auto">
            Join the Dynapharm family and discover products that transform lives.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <button
              onClick={() => navigate('/shop')}
              className="px-8 py-3 bg-white text-primary font-bold rounded-full hover:bg-gray-100 transition-all flex items-center gap-2 cursor-pointer"
            >
              Browse Products <ChevronRight size={18} />
            </button>
            {!user && (
              <>
                <button
                  onClick={() => setDistributorLoginOpen(true)}
                  className="px-8 py-3 border-2 border-white text-white font-bold rounded-full hover:bg-white/10 transition-all cursor-pointer flex items-center gap-2"
                >
                  <UserCircle size={18} /> Distributor Login
                </button>
                <button
                  onClick={() => setLoginOpen(true)}
                  className="px-7 py-2.5 border border-white/50 text-white/80 font-medium rounded-full hover:bg-white/10 transition-all cursor-pointer flex items-center gap-2 text-sm"
                >
                  <LogIn size={16} /> Staff Login
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      <footer className="py-8 bg-secondary text-gray-400">
        <div className="max-w-[1200px] mx-auto px-6 text-center text-sm">
          <p>&copy; {new Date().getFullYear()} {COMPANY_INFO.name}. All rights reserved.</p>
          <p className="mt-1 text-xs">Cloud Health Management System</p>
          <div className="flex justify-center gap-4 mt-3">
            {COMPANY_INFO.socialMedia.facebook && (
              <a href={COMPANY_INFO.socialMedia.facebook} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">Facebook</a>
            )}
            {COMPANY_INFO.socialMedia.instagram && (
              <a href={COMPANY_INFO.socialMedia.instagram} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">Instagram</a>
            )}
            {COMPANY_INFO.socialMedia.tiktok && (
              <a href={COMPANY_INFO.socialMedia.tiktok} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">TikTok</a>
            )}
          </div>
        </div>
      </footer>

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
      <DistributorLoginModal open={distributorLoginOpen} onClose={() => setDistributorLoginOpen(false)} />
    </div>
  );
}
