import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LoginModal } from '../components/LoginModal';
import { DistributorLoginModal } from '../components/DistributorLoginModal';
import { useState, useEffect, useRef } from 'react';
import {
  Heart, Leaf, Globe, Users, ShieldCheck, Award,
  ChevronRight, LogIn, ShoppingCart, Stethoscope,
  MapPin, Phone, UserCircle, ArrowRight, Zap, Building2,
  Coffee, Sparkles, Wrench, Apple, Package, Star,
} from 'lucide-react';
import { BRANCH_DETAILS, COMPANY_INFO } from '../lib/constants';

const REGIONS = BRANCH_DETAILS.reduce((acc, b) => {
  const r = b.region || 'Other';
  if (!acc[r]) acc[r] = [];
  acc[r].push(b);
  return acc;
}, {});

function useCountUp(targetStr, duration, active) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active) return;
    const num = parseInt((targetStr || '').replace(/\D/g, '')) || 0;
    let raf;
    let start = null;
    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      setVal(Math.floor(p * num));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active, targetStr, duration]);
  return val;
}

function StatItem({ icon: Icon, value, label, animate, border }) {
  const num = useCountUp(value, 1600, animate);
  const suffix = value.replace(/[0-9]/g, '');
  return (
    <div style={{
      textAlign: 'center', padding: '28px 16px',
      borderRight: border ? '1px solid rgba(255,255,255,0.1)' : 'none',
    }}>
      <Icon size={26} style={{ color: '#fca5a5', margin: '0 auto 10px', display: 'block' }} />
      <div style={{ fontSize: '2.2rem', fontWeight: 900, color: '#fff', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
        {animate ? `${num}${suffix}` : value}
      </div>
      <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)', marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600 }}>
        {label}
      </div>
    </div>
  );
}

const CAT_META = {
  'Beverages':          { icon: Coffee,    color: '#f59e0b', grad: 'linear-gradient(135deg,#78350f,#b45309)' },
  'Health Supplements': { icon: Heart,     color: '#60a5fa', grad: 'linear-gradient(135deg,#1e3a5f,#1d4ed8)' },
  'Personal Care':      { icon: Sparkles,  color: '#f472b6', grad: 'linear-gradient(135deg,#4a0a2a,#be185d)' },
  'Agriculture':        { icon: Leaf,      color: '#4ade80', grad: 'linear-gradient(135deg,#14532d,#15803d)' },
  'Food & Nutrition':   { icon: Apple,     color: '#fb923c', grad: 'linear-gradient(135deg,#431407,#c2410c)' },
  'Equipment':          { icon: Wrench,    color: '#94a3b8', grad: 'linear-gradient(135deg,#1e293b,#475569)' },
  'General':            { icon: Package,   color: '#c084fc', grad: 'linear-gradient(135deg,#2e1065,#7c3aed)' },
};

const HERO_FALLBACK = [
  'linear-gradient(135deg,#12020a 0%,#5a0f1e 55%,#8b1726 100%)',
  'linear-gradient(135deg,#08101e 0%,#1e3a5f 55%,#2a527a 100%)',
  'linear-gradient(135deg,#120208 0%,#7b1226 55%,#c41e3a 100%)',
];

export default function Landing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loginOpen, setLoginOpen] = useState(false);
  const [distLoginOpen, setDistLoginOpen] = useState(false);
  const [slide, setSlide] = useState(0);
  const [heroImgs, setHeroImgs] = useState([]);
  const [scrolled, setScrolled] = useState(false);
  const [statsOn, setStatsOn] = useState(false);
  const statsRef = useRef(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [products, setProducts] = useState([]);
  const [activeCategory, setActiveCategory] = useState('all');

  useEffect(() => {
    fetch('/api/media?upload_type=training', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const rows = Array.isArray(data) ? data : [];
        setHeroImgs(rows.filter(r => (r.mime_type || '').startsWith('image/') || r.media_type === 'photo'));
      })
      .catch(() => {});
  }, []);

  const slideCount = heroImgs.length || 3;
  useEffect(() => {
    const t = setInterval(() => setSlide(p => (p + 1) % slideCount), 5500);
    return () => clearInterval(t);
  }, [slideCount]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const el = statsRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setStatsOn(true); }, { threshold: 0.25 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    fetch('/api/products', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (Array.isArray(data)) setProducts(data); })
      .catch(() => {});
  }, []);

  const scrollTo = (id) => {
    setMobileMenuOpen(false);
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  return (
    <div style={{ fontFamily: 'system-ui,-apple-system,Inter,sans-serif', overflowX: 'hidden', background: '#080508' }}>

      {/* ── NAVBAR ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
        transition: 'all 0.3s',
        background: scrolled ? 'rgba(8,3,8,0.96)' : 'rgba(0,0,0,0)',
        backdropFilter: scrolled ? 'blur(14px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.07)' : '1px solid transparent',
        padding: scrolled ? '10px 0' : '16px 0',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          {/* Logo */}
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <img src={COMPANY_INFO.logo} alt="Dynapharm" style={{ height: 38, objectFit: 'contain' }} onError={e => { e.target.style.display = 'none'; }} />
            <span style={{ color: '#fff', fontWeight: 900, fontSize: '1rem', letterSpacing: '-0.01em' }}>
              DYNAPHARM <span style={{ color: '#fca5a5', fontWeight: 400, fontSize: '0.82rem' }}>Namibia</span>
            </span>
          </button>

          {/* Desktop links */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 28, flex: 1, justifyContent: 'center' }}>
            {[
              { label: 'Home', action: () => window.scrollTo({ top: 0, behavior: 'smooth' }) },
              { label: 'About', action: () => scrollTo('about') },
              { label: 'Products', action: () => scrollTo('products') },
              { label: 'Our Outlets', action: () => scrollTo('outlets') },
              { label: 'Health Check-Up', action: () => navigate('/checkup') },
            ].map(l => (
              <button key={l.label} onClick={l.action} style={{
                background: 'none', border: 'none', color: 'rgba(255,255,255,0.72)', fontSize: '0.84rem',
                fontWeight: 500, cursor: 'pointer', padding: 0, letterSpacing: '0.02em', transition: 'color 0.2s',
              }}
              onMouseOver={e => e.currentTarget.style.color = '#fff'}
              onMouseOut={e => e.currentTarget.style.color = 'rgba(255,255,255,0.72)'}
              >{l.label}</button>
            ))}
          </div>

          {/* CTA buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {!user && (
              <button onClick={() => setDistLoginOpen(true)} style={{
                padding: '8px 18px', background: '#c41e3a', color: '#fff', border: 'none',
                borderRadius: 99, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, transition: 'background 0.2s',
              }}
              onMouseOver={e => e.currentTarget.style.background = '#a01830'}
              onMouseOut={e => e.currentTarget.style.background = '#c41e3a'}
              ><UserCircle size={14} /> Distributor</button>
            )}
            {!user && (
              <button onClick={() => setLoginOpen(true)} style={{
                padding: '8px 14px', background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.7)',
                border: '1px solid rgba(255,255,255,0.15)', borderRadius: 99, fontSize: '0.78rem',
                fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.2s',
              }}
              onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = '#fff'; }}
              onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
              ><LogIn size={13} /> Staff</button>
            )}
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {/* Slide backgrounds */}
        {heroImgs.length > 0
          ? heroImgs.map((img, i) => (
            <div key={img.id || i} style={{
              position: 'absolute', inset: 0, transition: 'opacity 1.4s ease',
              opacity: slide === i ? 1 : 0,
              backgroundImage: `url(${img.file_url})`,
              backgroundSize: 'cover', backgroundPosition: 'center',
            }} />
          ))
          : HERO_FALLBACK.map((bg, i) => (
            <div key={i} style={{
              position: 'absolute', inset: 0, background: bg,
              opacity: slide === i ? 1 : 0, transition: 'opacity 1.4s ease',
            }} />
          ))
        }

        {/* Dark gradient overlay */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(8,3,8,0.45) 0%, rgba(8,3,8,0.65) 50%, rgba(8,3,8,0.92) 100%)' }} />

        {/* Ambient glows */}
        <div style={{ position: 'absolute', top: '10%', right: '8%', width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle, rgba(196,30,58,0.18) 0%, transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '15%', left: '5%', width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(196,30,58,0.12) 0%, transparent 65%)', pointerEvents: 'none' }} />

        {/* Content */}
        <div style={{ position: 'relative', maxWidth: 860, margin: '0 auto', padding: '140px 24px 100px', textAlign: 'center', color: '#fff', zIndex: 2 }}>

          {/* Badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.14)', borderRadius: 99,
            padding: '7px 18px 7px 10px', marginBottom: 36,
          }}>
            <img src={COMPANY_INFO.logo} alt="" style={{ height: 28, objectFit: 'contain' }} onError={e => { e.target.style.display = 'none'; }} />
            <span style={{ fontSize: '0.73rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>
              Dynapharm Namibia
            </span>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
          </div>

          {/* Headline */}
          <h1 style={{ fontSize: 'clamp(2.6rem, 6.5vw, 4.4rem)', fontWeight: 900, lineHeight: 1.06, marginBottom: 22, letterSpacing: '-0.025em' }}>
            Health, Wealth &amp;{' '}
            <span style={{ background: 'linear-gradient(90deg,#f87171,#fca5a5 60%,#f87171)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Freedom
            </span>
            {' '}— For All
          </h1>

          {/* Tagline */}
          <p style={{ fontSize: '1.12rem', color: 'rgba(255,255,255,0.7)', maxWidth: 520, margin: '0 auto 14px', lineHeight: 1.7 }}>
            {COMPANY_INFO.tagline}
          </p>
          <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.45)', maxWidth: 480, margin: '0 auto 44px', lineHeight: 1.75 }}>
            Fifteen outlets across Namibia — bringing natural wellness to communities from Windhoek to the Caprivi Strip.
          </p>

          {/* Action buttons */}
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 12 }}>
            <button onClick={() => navigate('/shop')} style={{
              padding: '14px 34px', background: '#c41e3a', color: '#fff', border: 'none', borderRadius: 99,
              fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.25s',
              display: 'flex', alignItems: 'center', gap: 8,
              boxShadow: '0 6px 28px rgba(196,30,58,0.45)',
            }}
            onMouseOver={e => { e.currentTarget.style.background = '#a01830'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 36px rgba(196,30,58,0.55)'; }}
            onMouseOut={e => { e.currentTarget.style.background = '#c41e3a'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 6px 28px rgba(196,30,58,0.45)'; }}
            ><ShoppingCart size={17} /> Online Shop</button>

            <button onClick={() => navigate('/checkup')} style={{
              padding: '14px 34px', background: 'rgba(255,255,255,0.09)', backdropFilter: 'blur(8px)',
              color: '#fff', border: '1.5px solid rgba(255,255,255,0.28)', borderRadius: 99,
              fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.25s',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
            onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.16)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.09)'; e.currentTarget.style.transform = 'none'; }}
            ><Stethoscope size={17} /> Health Check-Up</button>

            {!user && (
              <>
                <button onClick={() => setDistLoginOpen(true)} style={{
                  padding: '14px 34px', background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(8px)',
                  color: 'rgba(255,255,255,0.8)', border: '1.5px solid rgba(255,255,255,0.16)', borderRadius: 99,
                  fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.25s',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
                onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.transform = 'none'; }}
                ><UserCircle size={17} /> Distributor Login</button>

                <button onClick={() => setLoginOpen(true)} style={{
                  padding: '12px 22px', background: 'transparent', color: 'rgba(255,255,255,0.42)',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 99, fontSize: '0.83rem',
                  fontWeight: 500, cursor: 'pointer', transition: 'all 0.25s',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
                onMouseOver={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.75)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; }}
                onMouseOut={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.42)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                ><LogIn size={14} /> Staff Login</button>
              </>
            )}
          </div>

          {/* Slide indicators */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 56 }}>
            {Array.from({ length: slideCount }).map((_, i) => (
              <button key={i} onClick={() => setSlide(i)} style={{
                width: slide === i ? 28 : 8, height: 8, borderRadius: 99, border: 'none',
                background: slide === i ? '#c41e3a' : 'rgba(255,255,255,0.28)',
                cursor: 'pointer', transition: 'all 0.35s', padding: 0,
              }} />
            ))}
          </div>
        </div>

        {/* Bottom wave */}
        <div style={{ position: 'absolute', bottom: -1, left: 0, right: 0, lineHeight: 0, zIndex: 3 }}>
          <svg viewBox="0 0 1440 64" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', width: '100%' }}>
            <path d="M0,32 C240,64 480,0 720,32 C960,64 1200,16 1440,40 L1440,64 L0,64 Z" fill="#0d0d10" />
          </svg>
        </div>
      </section>

      {/* ── STATS STRIP ── */}
      <section ref={statsRef} style={{ background: '#0d0d10', padding: '0 24px 60px' }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto',
          background: 'linear-gradient(135deg,#1f0309 0%,#7b1226 45%,#1f0309 100%)',
          borderRadius: 20, transform: 'translateY(-28px)',
          boxShadow: '0 24px 64px rgba(196,30,58,0.3)',
          display: 'grid', gridTemplateColumns: 'repeat(4,1fr)',
          overflow: 'hidden',
        }}>
          {[
            { icon: Building2, value: '15+', label: 'Outlets' },
            { icon: MapPin,     value: '14+', label: 'Towns Covered' },
            { icon: Leaf,       value: '90+', label: 'Natural Products' },
            { icon: Award,      value: '20+', label: 'Years of Excellence' },
          ].map((s, i) => (
            <StatItem key={i} {...s} animate={statsOn} border={i < 3} />
          ))}
        </div>
      </section>

      {/* ── ABOUT ── */}
      <section id="about" style={{ background: '#0d0d10', padding: '20px 24px 100px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 72, alignItems: 'center' }}>

          {/* Left text */}
          <div>
            <div style={{ display: 'inline-block', background: 'rgba(196,30,58,0.14)', color: '#fca5a5', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', padding: '5px 14px', borderRadius: 99, marginBottom: 22, border: '1px solid rgba(252,165,165,0.2)' }}>
              About Us
            </div>
            <h2 style={{ fontSize: 'clamp(1.9rem,3.2vw,2.8rem)', fontWeight: 900, color: '#fff', lineHeight: 1.12, marginBottom: 22, letterSpacing: '-0.02em' }}>
              Bringing Natural Wellness<br />to Every Namibian Community
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.55)', lineHeight: 1.8, marginBottom: 16, fontSize: '0.93rem' }}>
              Dynapharm Namibia is the local franchise of Dynapharm International, serving Namibian families and entrepreneurs with a comprehensive range of natural health products — Spirulina, Ganoderma coffees, Chlorophyll, herbal supplements, personal care and more.
            </p>
            <p style={{ color: 'rgba(255,255,255,0.55)', lineHeight: 1.8, marginBottom: 36, fontSize: '0.93rem' }}>
              With fifteen outlets spread across the country, we combine global product quality with deeply local presence. Whether you are in the capital, on the coast, or up in the far north, there is a Dynapharm shop within reach.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button onClick={() => navigate('/shop')} style={{
                padding: '12px 28px', background: '#c41e3a', color: '#fff', border: 'none',
                borderRadius: 99, fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s',
              }}
              onMouseOver={e => { e.currentTarget.style.background = '#a01830'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseOut={e => { e.currentTarget.style.background = '#c41e3a'; e.currentTarget.style.transform = 'none'; }}
              >Explore Products <ArrowRight size={15} /></button>

              <button onClick={() => scrollTo('outlets')} style={{
                padding: '12px 28px', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.75)',
                border: '1px solid rgba(255,255,255,0.14)', borderRadius: 99, fontWeight: 600,
                fontSize: '0.88rem', cursor: 'pointer', transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
              onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
              onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
              ><MapPin size={15} /> Find a Branch</button>
            </div>
          </div>

          {/* Right feature grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[
              { icon: Heart,      color: '#ef4444', title: 'Health First',       desc: 'Products developed for holistic well-being — body, mind and spirit.' },
              { icon: Leaf,       color: '#22c55e', title: 'Natural Origin',     desc: 'Backed by science, rooted in nature. Every formula quality-tested.' },
              { icon: Users,      color: '#3b82f6', title: 'Community Driven',   desc: 'Supporting distributors, families, and entrepreneurs across Namibia.' },
              { icon: ShieldCheck,color: '#f59e0b', title: 'Trusted Quality',    desc: 'International standards, certified ingredients, local accountability.' },
            ].map((f, i) => (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 18, padding: '22px 18px', transition: 'all 0.25s',
                cursor: 'default',
              }}
              onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; e.currentTarget.style.transform = 'translateY(-4px)'; }}
              onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.transform = 'none'; }}
              >
                <div style={{ width: 42, height: 42, borderRadius: 12, background: `${f.color}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  <f.icon size={20} style={{ color: f.color }} />
                </div>
                <div style={{ fontWeight: 800, color: '#fff', fontSize: '0.88rem', marginBottom: 8 }}>{f.title}</div>
                <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.78rem', lineHeight: 1.65 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRODUCTS ── */}
      {(() => {
        const allCats = ['all', ...Object.keys(
          products.reduce((a, p) => { a[p.category || 'General'] = true; return a; }, {})
        )];
        const catCounts = products.reduce((a, p) => {
          const c = p.category || 'General'; a[c] = (a[c] || 0) + 1; return a;
        }, {});
        const filtered = (activeCategory === 'all' ? products : products.filter(p => (p.category || 'General') === activeCategory)).slice(0, 12);
        return (
          <section id="products" style={{ background: '#0d0d10', padding: '20px 24px 100px' }}>
            <div style={{ maxWidth: 1100, margin: '0 auto' }}>

              {/* Heading */}
              <div style={{ textAlign: 'center', marginBottom: 48 }}>
                <div style={{ display: 'inline-block', background: 'rgba(196,30,58,0.14)', color: '#fca5a5', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', padding: '5px 16px', borderRadius: 99, marginBottom: 18, border: '1px solid rgba(252,165,165,0.2)' }}>
                  Dynapharm Product Range
                </div>
                <h2 style={{ fontSize: 'clamp(1.9rem,3.2vw,2.8rem)', fontWeight: 900, color: '#fff', lineHeight: 1.12, letterSpacing: '-0.02em', marginBottom: 14 }}>
                  Our Products
                </h2>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.93rem', maxWidth: 480, margin: '0 auto' }}>
                  Over 90 premium natural products — crafted from nature's finest ingredients for health, vitality and wellness.
                </p>

                {/* Stats pills */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 22, flexWrap: 'wrap' }}>
                  {[
                    { label: `${products.length}+ PRODUCTS`, icon: Package },
                    { label: `${allCats.length - 1} CATEGORIES`, icon: Star },
                  ].map(({ label, icon: Icon }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 99, padding: '7px 18px', fontSize: '0.78rem', fontWeight: 700, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.08em' }}>
                      <Icon size={14} style={{ color: '#fca5a5' }} /> {label}
                    </div>
                  ))}
                </div>
              </div>

              {/* Category filter pills */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginBottom: 40 }}>
                {allCats.map(cat => {
                  const meta = cat !== 'all' ? (CAT_META[cat] || CAT_META['General']) : null;
                  const isActive = activeCategory === cat;
                  return (
                    <button key={cat} onClick={() => setActiveCategory(cat)} style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      padding: '9px 20px', borderRadius: 99, border: 'none', cursor: 'pointer',
                      fontWeight: 700, fontSize: '0.82rem', transition: 'all 0.2s',
                      background: isActive
                        ? (meta ? meta.grad : '#c41e3a')
                        : 'rgba(255,255,255,0.07)',
                      color: isActive ? '#fff' : 'rgba(255,255,255,0.6)',
                      boxShadow: isActive ? '0 4px 16px rgba(0,0,0,0.3)' : 'none',
                      transform: isActive ? 'translateY(-1px)' : 'none',
                    }}
                    onMouseOver={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = '#fff'; } }}
                    onMouseOut={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; } }}
                    >
                      {meta && <meta.icon size={14} style={{ color: isActive ? '#fff' : meta.color }} />}
                      {cat === 'all' ? 'All Products' : cat}
                      <span style={{ fontSize: '0.72rem', opacity: 0.75, fontWeight: 600 }}>
                        ({cat === 'all' ? products.length : (catCounts[cat] || 0)})
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Product grid */}
              {products.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', padding: '60px 0', fontSize: '0.9rem' }}>
                  Loading products…
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 16 }}>
                  {filtered.map((p, i) => {
                    const cat = p.category || 'General';
                    const meta = CAT_META[cat] || CAT_META['General'];
                    const CatIcon = meta.icon;
                    const firstImg = p.images?.[0];
                    const imgSrc = firstImg
                      ? (firstImg.image_data
                          ? `data:image/${firstImg.image_type || 'jpeg'};base64,${firstImg.image_data}`
                          : firstImg.image_url || null)
                      : null;
                    return (
                      <div key={p.id || i}
                        onClick={() => navigate('/shop')}
                        style={{
                          borderRadius: 18, overflow: 'hidden', cursor: 'pointer',
                          background: '#18151a', border: '1px solid rgba(255,255,255,0.07)',
                          transition: 'all 0.3s', display: 'flex', flexDirection: 'column',
                        }}
                        onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-6px)'; e.currentTarget.style.boxShadow = '0 16px 48px rgba(0,0,0,0.5)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'; }}
                        onMouseOut={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; }}
                      >
                        {/* Photo or gradient banner */}
                        {imgSrc ? (
                          <div style={{ height: 180, overflow: 'hidden', position: 'relative', background: meta.grad, flexShrink: 0 }}>
                            <img
                              src={imgSrc}
                              alt={p.name}
                              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.5s ease' }}
                              onMouseOver={e => { e.target.style.transform = 'scale(1.06)'; }}
                              onMouseOut={e => { e.target.style.transform = 'scale(1)'; }}
                            />
                            {/* Category pill overlay */}
                            <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', borderRadius: 99, padding: '4px 10px' }}>
                              <CatIcon size={11} style={{ color: meta.color }} />
                              <span style={{ fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#fff' }}>{cat}</span>
                            </div>
                          </div>
                        ) : (
                          <div style={{ height: 140, background: meta.grad, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
                            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.12)' }} />
                            <div style={{ position: 'absolute', top: -18, right: -18, width: 90, height: 90, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
                            <div style={{ position: 'absolute', bottom: -10, left: -10, width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
                            <CatIcon size={42} style={{ color: 'rgba(255,255,255,0.88)', position: 'relative', zIndex: 1 }} />
                            {/* Category pill overlay */}
                            <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)', borderRadius: 99, padding: '4px 10px' }}>
                              <span style={{ fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.9)' }}>{cat}</span>
                            </div>
                          </div>
                        )}

                        {/* Card body */}
                        <div style={{ padding: '14px 16px 18px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                          <p style={{ fontWeight: 700, color: '#fff', fontSize: '0.84rem', lineHeight: 1.45, marginBottom: 12, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {p.name}
                          </p>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
                            <span style={{ fontSize: '0.92rem', fontWeight: 900, color: '#fca5a5' }}>
                              N$ {parseFloat(p.cp || p.dp || 0).toFixed(2)}
                            </span>
                            <span style={{ fontSize: '0.67rem', color: 'rgba(255,255,255,0.28)', fontWeight: 600 }}>Consumer Price</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* View All */}
              <div style={{ textAlign: 'center', marginTop: 44 }}>
                <button onClick={() => navigate('/shop')} style={{
                  padding: '14px 40px', background: '#c41e3a', color: '#fff', border: 'none',
                  borderRadius: 99, fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 8, transition: 'all 0.25s',
                  boxShadow: '0 6px 24px rgba(196,30,58,0.4)',
                }}
                onMouseOver={e => { e.currentTarget.style.background = '#a01830'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 32px rgba(196,30,58,0.5)'; }}
                onMouseOut={e => { e.currentTarget.style.background = '#c41e3a'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(196,30,58,0.4)'; }}
                >
                  View All Products <ChevronRight size={17} />
                </button>
                <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.78rem', marginTop: 12 }}>
                  Showing {filtered.length} of {activeCategory === 'all' ? products.length : (catCounts[activeCategory] || 0)} products
                </p>
              </div>
            </div>
          </section>
        );
      })()}

      {/* ── WAVE TO LIGHT ── */}
      <div style={{ background: '#0d0d10', lineHeight: 0 }}>
        <svg viewBox="0 0 1440 56" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', width: '100%' }}>
          <path d="M0,0 C360,56 720,0 1080,40 C1260,56 1380,20 1440,0 L1440,56 L0,56 Z" fill="#f3f4f6" />
        </svg>
      </div>

      {/* ── OUTLETS / BRANCHES ── */}
      <section id="outlets" style={{ background: '#f3f4f6', padding: '80px 24px 100px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>

          {/* Heading */}
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <div style={{ display: 'inline-block', background: 'rgba(196,30,58,0.09)', color: '#c41e3a', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', padding: '5px 14px', borderRadius: 99, marginBottom: 18, border: '1px solid rgba(196,30,58,0.18)' }}>
              Our Presence
            </div>
            <h2 style={{ fontSize: 'clamp(1.9rem,3.2vw,2.8rem)', fontWeight: 900, color: '#12020a', lineHeight: 1.12, letterSpacing: '-0.02em', marginBottom: 14 }}>
              {BRANCH_DETAILS.length} Outlets Across Namibia
            </h2>
            <p style={{ color: '#6b7280', fontSize: '0.93rem', maxWidth: 440, margin: '0 auto' }}>
              From the capital city to the far north and east — a Dynapharm shop is always within reach.
            </p>
          </div>

          {/* Region groups */}
          {Object.entries(REGIONS).map(([region, branches]) => (
            <div key={region} style={{ marginBottom: 48 }}>
              {/* Region header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                <div style={{ width: 4, height: 22, background: '#c41e3a', borderRadius: 2, flexShrink: 0 }} />
                <span style={{ fontWeight: 900, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: '#1a0508' }}>{region}</span>
                <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                <span style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {branches.length} outlet{branches.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Branch cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 14 }}>
                {branches.map((b, i) => (
                  <div key={i} style={{
                    background: '#fff', borderRadius: 16, padding: '20px',
                    border: '1px solid #ece9ea',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
                    transition: 'all 0.25s', cursor: 'default',
                  }}
                  onMouseOver={e => { e.currentTarget.style.boxShadow = '0 8px 32px rgba(196,30,58,0.13)'; e.currentTarget.style.borderColor = '#fecaca'; e.currentTarget.style.transform = 'translateY(-3px)'; }}
                  onMouseOut={e => { e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.04)'; e.currentTarget.style.borderColor = '#ece9ea'; e.currentTarget.style.transform = 'none'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                      <h3 style={{ fontWeight: 900, color: '#12020a', fontSize: '0.9rem', lineHeight: 1.3 }}>{b.name}</h3>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: '#fff5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: 8 }}>
                        <MapPin size={13} style={{ color: '#c41e3a' }} />
                      </div>
                    </div>
                    <p style={{ fontSize: '0.76rem', color: '#6b7280', lineHeight: 1.65, marginBottom: 12 }}>{b.address}</p>
                    <a href={`tel:${b.phone}`} style={{ fontSize: '0.76rem', color: '#c41e3a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none', transition: 'color 0.2s' }}
                    onMouseOver={e => e.currentTarget.style.color = '#8b0000'}
                    onMouseOut={e => e.currentTarget.style.color = '#c41e3a'}
                    ><Phone size={12} /> {b.phone}</a>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── WAVE BACK TO DARK ── */}
      <div style={{ background: '#f3f4f6', lineHeight: 0 }}>
        <svg viewBox="0 0 1440 56" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', width: '100%' }}>
          <path d="M0,56 C360,0 720,56 1080,20 C1260,4 1380,46 1440,56 L1440,56 L0,56 Z" fill="#0d0d10" />
        </svg>
      </div>

      {/* ── CTA SECTION ── */}
      <section style={{ background: '#0d0d10', padding: '80px 24px 100px' }}>
        <div style={{
          maxWidth: 860, margin: '0 auto', textAlign: 'center',
          background: 'linear-gradient(135deg,rgba(196,30,58,0.12) 0%,rgba(196,30,58,0.06) 100%)',
          border: '1px solid rgba(196,30,58,0.2)', borderRadius: 28,
          padding: '64px 40px',
        }}>
          <div style={{ width: 60, height: 60, borderRadius: 18, background: 'rgba(196,30,58,0.15)', border: '1px solid rgba(196,30,58,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <Zap size={26} style={{ color: '#f87171' }} />
          </div>
          <h2 style={{ fontSize: 'clamp(1.9rem,3.2vw,2.6rem)', fontWeight: 900, color: '#fff', lineHeight: 1.12, marginBottom: 16, letterSpacing: '-0.02em' }}>
            Start Your Wellness Journey Today
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.95rem', maxWidth: 460, margin: '0 auto 40px', lineHeight: 1.75 }}>
            Browse our natural health products online or visit your nearest branch — a healthier life is within reach.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 14 }}>
            <button onClick={() => navigate('/shop')} style={{
              padding: '14px 36px', background: '#c41e3a', color: '#fff', border: 'none',
              borderRadius: 99, fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.25s',
              boxShadow: '0 8px 28px rgba(196,30,58,0.4)',
            }}
            onMouseOver={e => { e.currentTarget.style.background = '#a01830'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseOut={e => { e.currentTarget.style.background = '#c41e3a'; e.currentTarget.style.transform = 'none'; }}
            >Browse Products <ChevronRight size={17} /></button>

            <button onClick={() => navigate('/checkup')} style={{
              padding: '14px 36px', background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.82)',
              border: '1.5px solid rgba(255,255,255,0.2)', borderRadius: 99, fontWeight: 600,
              fontSize: '0.95rem', cursor: 'pointer', transition: 'all 0.25s',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
            onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.13)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.transform = 'none'; }}
            ><Stethoscope size={17} /> Book a Check-Up</button>

            {!user && (
              <button onClick={() => setDistLoginOpen(true)} style={{
                padding: '14px 28px', background: 'transparent', color: 'rgba(255,255,255,0.42)',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 99, fontWeight: 500,
                fontSize: '0.85rem', cursor: 'pointer', transition: 'color 0.2s',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
              onMouseOver={e => e.currentTarget.style.color = 'rgba(255,255,255,0.75)'}
              onMouseOut={e => e.currentTarget.style.color = 'rgba(255,255,255,0.42)'}
              ><UserCircle size={15} /> Distributor Login</button>
            )}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background: '#05030a', borderTop: '1px solid rgba(255,255,255,0.05)', padding: '56px 24px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 56, marginBottom: 48 }}>

            {/* Brand */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                <img src={COMPANY_INFO.logo} alt="Dynapharm" style={{ height: 36, objectFit: 'contain' }} onError={e => { e.target.style.display = 'none'; }} />
                <span style={{ color: '#fff', fontWeight: 900, fontSize: '0.95rem' }}>
                  DYNAPHARM <span style={{ color: '#fca5a5', fontWeight: 400 }}>Namibia</span>
                </span>
              </div>
              <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.83rem', lineHeight: 1.75, maxWidth: 280, marginBottom: 22 }}>
                A World of Health, Wealth &amp; Freedom. Natural health solutions for Namibian families and entrepreneurs.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                {[
                  { label: 'FB', href: COMPANY_INFO.socialMedia?.facebook },
                  { label: 'IG', href: COMPANY_INFO.socialMedia?.instagram },
                  { label: 'TT', href: COMPANY_INFO.socialMedia?.tiktok },
                ].filter(s => s.href).map(s => (
                  <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" style={{
                    width: 36, height: 36, borderRadius: 9, background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', color: 'rgba(255,255,255,0.55)', textDecoration: 'none',
                    fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.02em', transition: 'all 0.2s',
                  }}
                  onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = '#fff'; }}
                  onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.55)'; }}
                  >{s.label}</a>
                ))}
              </div>
            </div>

            {/* Quick links */}
            <div>
              <div style={{ fontWeight: 800, color: '#fff', fontSize: '0.82rem', marginBottom: 18, letterSpacing: '0.04em' }}>Quick Links</div>
              {[
                { label: 'Online Shop',       action: () => navigate('/shop') },
                { label: 'Health Check-Up',   action: () => navigate('/checkup') },
                { label: 'Our Outlets',       action: () => scrollTo('outlets') },
                { label: 'Distributor Login', action: () => setDistLoginOpen(true) },
                { label: 'Staff Login',       action: () => setLoginOpen(true) },
              ].map((l, i) => (
                <button key={i} onClick={l.action} style={{
                  display: 'block', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
                  fontSize: '0.83rem', cursor: 'pointer', padding: '4px 0', transition: 'color 0.2s', textAlign: 'left',
                }}
                onMouseOver={e => e.currentTarget.style.color = 'rgba(255,255,255,0.8)'}
                onMouseOut={e => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}
                >{l.label}</button>
              ))}
            </div>

            {/* Contact */}
            <div>
              <div style={{ fontWeight: 800, color: '#fff', fontSize: '0.82rem', marginBottom: 18, letterSpacing: '0.04em' }}>Head Office</div>
              <div style={{ color: 'rgba(255,255,255,0.38)', fontSize: '0.83rem', lineHeight: 1.9 }}>
                <p>269 Independence Avenue</p>
                <p>Shop No 1, Continental Building</p>
                <p>Windhoek CBD, Namibia</p>
                <p style={{ marginTop: 10 }}>
                  <a href="tel:+264817499757" style={{ color: '#fca5a5', textDecoration: 'none', fontWeight: 700 }}>+264 817 499 757</a>
                </p>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <p style={{ color: 'rgba(255,255,255,0.22)', fontSize: '0.76rem' }}>
              &copy; {new Date().getFullYear()} {COMPANY_INFO.name}. All rights reserved.
            </p>
            <p style={{ color: 'rgba(255,255,255,0.18)', fontSize: '0.73rem' }}>Cloud Health Management System</p>
          </div>
        </div>
      </footer>

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
      <DistributorLoginModal open={distLoginOpen} onClose={() => setDistLoginOpen(false)} />
    </div>
  );
}
