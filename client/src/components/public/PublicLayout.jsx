import { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ArrowRight, Facebook, Instagram, Menu, MessageCircle, X } from 'lucide-react';
import { LoginModal } from '../LoginModal';
import { DistributorLoginModal } from '../DistributorLoginModal';
import { COMPANY_INFO } from '../../lib/constants';
import { PUBLIC_OUTLETS } from '../../lib/publicCatalog';
import './public.css';

const NAV = [['/', 'Home'], ['/shop', 'Products'], ['/outlets', 'Our Outlets'], ['/about', 'About'], ['/checkup', 'Health Check-Up']];

export function PublicLogo() {
  return <Link to="/" className="pub-logo" aria-label="Dynapharm Namibia home"><img src={COMPANY_INFO.logo} alt="" width="49" height="49" /><div><strong>DYNAPHARM</strong><span>NAMIBIA</span></div></Link>;
}

export function PublicCTA() {
  return <section className="pub-section"><div className="pub-container"><div className="pub-final"><div><h2>Find your next Dynapharm product.</h2><p>Explore the range online, or get in touch with an outlet.</p></div><div className="pub-actions"><Link to="/shop" className="pub-button">Browse Products <ArrowRight size={16} /></Link><Link to="/outlets" className="pub-button outline">Find an Outlet</Link></div></div></div></section>;
}

export function PublicLayout({ children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [staffOpen, setStaffOpen] = useState(false);
  const [distributorOpen, setDistributorOpen] = useState(false);
  const location = useLocation();
  const headOffice = PUBLIC_OUTLETS.find(outlet => outlet.id === 'townshop');
  const social = COMPANY_INFO.socialMedia || {};
  const access = <><button onClick={() => setStaffOpen(true)}>Staff Login</button><button onClick={() => setDistributorOpen(true)}>Distributor Login</button></>;
  return <div className="public-site">
    <a className="pub-skip" href="#public-main">Skip to content</a>
    <header className="pub-header"><div className="pub-container">
      <div className="pub-secondary">{access}</div>
      <nav className="pub-nav" aria-label="Main navigation" onKeyDown={event => {
        if (event.key === 'Escape' && menuOpen) {
          setMenuOpen(false);
          event.currentTarget.querySelector('.pub-menu-toggle')?.focus();
        }
      }}><PublicLogo />
        <button className="pub-menu-toggle" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="public-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={21} /> : <Menu size={21} />}</button>
        <div id="public-navigation" className={`pub-links ${menuOpen ? 'open' : ''}`}>{NAV.map(([to, label]) => <NavLink to={to} key={to} end={to === '/'} onClick={() => { setMenuOpen(false); if (location.pathname !== to) window.scrollTo(0, 0); }}>{label}</NavLink>)}</div>
        <Link to="/shop" className="pub-button">Shop Products <ArrowRight size={15} /></Link>
      </nav>
    </div></header>
    <main id="public-main">{children}</main>
    <footer className="pub-footer"><div className="pub-container"><div className="pub-footer-grid">
      <div><PublicLogo /><p>Explore Dynapharm products and connect with our local outlets in Namibia.</p><div className="pub-socials">
        {social.facebook && <a href={social.facebook} target="_blank" rel="noreferrer" aria-label="Dynapharm Namibia on Facebook"><Facebook size={17} /></a>}
        {social.instagram && <a href={social.instagram} target="_blank" rel="noreferrer" aria-label="Dynapharm Namibia on Instagram"><Instagram size={17} /></a>}
        {social.tiktok && <a href={social.tiktok} target="_blank" rel="noreferrer" aria-label="Dynapharm Namibia on TikTok"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M14 3v13a5 5 0 1 1-5-5v3a2 2 0 1 0 2 2V3h3c0 3 2 5 5 5v3a8 8 0 0 1-5-2" /></svg></a>}
        {social.whatsapp && <a href={`https://wa.me/${social.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" aria-label="Contact Dynapharm Namibia on WhatsApp"><MessageCircle size={17} /></a>}
      </div></div>
      <div><h3>Explore</h3><div className="pub-footer-list"><Link to="/shop">Products</Link><Link to="/outlets">Our Outlets</Link><Link to="/about">About Dynapharm Namibia</Link><Link to="/checkup">Health Check-Up</Link></div></div>
      <div><h3>Distributor &amp; staff access</h3><div className="pub-footer-list">{access}<Link to="/distributor">Distributor Portal</Link></div></div>
      <div><h3>Head-office contact</h3><div className="pub-footer-list">{headOffice && <><span>{headOffice.address}</span><span>{headOffice.name}, Namibia</span><a href={`tel:${headOffice.phone.replace(/[^\d+]/g, '')}`}>{headOffice.phone}</a></>}</div></div>
    </div><div className="pub-footer-bottom"><span>&copy; {new Date().getFullYear()} {COMPANY_INFO.name}</span><span>Health, Wealth &amp; Freedom</span></div></div></footer>
    <LoginModal open={staffOpen} onClose={() => setStaffOpen(false)} />
    <DistributorLoginModal open={distributorOpen} onClose={() => setDistributorOpen(false)} />
  </div>;
}
