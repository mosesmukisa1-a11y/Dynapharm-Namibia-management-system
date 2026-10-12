import { Link } from 'react-router-dom';
import { ArrowRight, Heart, MapPin, Package, Stethoscope } from 'lucide-react';
import { PublicCTA, PublicLayout } from '../components/public/PublicLayout';
import { CatalogState, CategoryGrid, FeaturedProducts } from '../components/public/CatalogPreview';
import { OutletFinder } from '../components/public/OutletFinder';
import { usePublicCatalog } from '../hooks/usePublicCatalog';

export default function Landing() {
  const catalog = usePublicCatalog();
  const { products, loading, error } = catalog;
  const available = !loading && !error && products.length > 0;
  return <PublicLayout>
    <div className="pub-container">
      <section className="pub-hero" aria-labelledby="welcome-title">
        <div className="pub-hero-copy"><div className="pub-eyebrow">Welcome to Dynapharm Namibia</div><h1 id="welcome-title">Natural wellness,<br /><span>closer to home.</span></h1><p>Explore Dynapharm products and find your nearest outlet in Namibia.</p><div className="pub-actions"><Link className="pub-button" to="/shop">Shop Products <ArrowRight size={17} /></Link><Link className="pub-button outline" to="/outlets"><MapPin size={16} /> Find an Outlet</Link></div><p className="pub-slogan"><Heart size={14} /> Health, Wealth &amp; Freedom</p></div>
        <div className="pub-hero-visual">
          <div className="pub-hero-packshots">
            <img src="/brand/arabica-coffee.webp" alt="Dynapharm Arabica coffee product packaging" width="260" height="320" decoding="async" fetchPriority="high" />
            <img src="/brand/goats-milk.webp" alt="Dynapharm goat milk product packaging" width="200" height="260" decoding="async" />
          </div>
          <div className="pub-photo-note"><span>Explore the Dynapharm range</span><Link to="/shop">Explore <ArrowRight size={13} style={{ display: 'inline' }} /></Link></div>
        </div>
      </section>
      <div className="pub-quick">{[
        { icon: Package, title: 'Explore Products', text: 'Find your favourites in our current product catalogue.', to: '/shop' },
        { icon: MapPin, title: 'Find an Outlet', text: 'Look up a local outlet and contact the team before visiting.', to: '/outlets' },
        { icon: Stethoscope, title: 'Health Check-Up', text: 'Complete a health questionnaire for consultant review.', to: '/checkup' },
      ].map(({ icon: Icon, title, text, to }) => <Link key={to} to={to}><Icon className="pub-icon" aria-hidden="true" /><div><h3>{title}</h3><p>{text}</p></div><ArrowRight size={16} color="#c41e3a" style={{ marginTop: 10 }} /></Link>)}</div>
    </div>
    <section className="pub-section tinted" id="categories"><div className="pub-container"><div className="pub-section-heading"><div><div className="pub-eyebrow">The product range</div><h2>A good place to start.</h2><p>Browse by category and find what you’re looking for.</p></div><Link className="pub-text-link" to="/shop">Browse the catalogue <ArrowRight size={15} /></Link></div>{available ? <CategoryGrid products={products} /> : <CatalogState {...catalog} empty={!products.length} />}</div></section>
    <section className="pub-section" id="products"><div className="pub-container"><div className="pub-section-heading"><div><div className="pub-eyebrow">From our catalogue</div><h2>Discover Dynapharm products.</h2><p>{available ? `${products.length} products in the public catalogue. Explore a selection below.` : 'Explore a selection from our product range.'}</p></div><Link className="pub-text-link" to="/shop">View all products <ArrowRight size={15} /></Link></div>{available ? <FeaturedProducts products={products} /> : <CatalogState {...catalog} empty={!products.length} />}</div></section>
    <section className="pub-section tinted"><div className="pub-container pub-about"><div className="pub-about-image pub-brand-photo"><img src="/brand/dynapharm-personal-care.webp" alt="Official Dynapharm manufacturer photograph featuring personal-care products" loading="lazy" decoding="async" width="1024" height="1024" /></div><div><div className="pub-eyebrow">Here in Namibia</div><h2>Products to explore.<br />People to connect with.</h2><p>Dynapharm Namibia brings together an online product catalogue and a local outlet directory. Browse the range at your own pace, then contact an outlet for help with product availability and your next visit.</p><Link className="pub-text-link" to="/about">Learn about us <ArrowRight size={15} /></Link></div></div></section>
    <section className="pub-section" id="outlets"><div className="pub-container"><div className="pub-section-heading"><div><div className="pub-eyebrow">Your local connection</div><h2>Find an outlet near you.</h2><p>Search your town, get directions and speak to the team.</p></div><Link className="pub-text-link" to="/outlets">Our Outlets <ArrowRight size={15} /></Link></div><OutletFinder preview /></div></section>
    <PublicCTA />
  </PublicLayout>;
}
