import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Apple, ArrowRight, Coffee, Heart, Leaf, Package, Sparkles, Wrench } from 'lucide-react';
import { formatCurrency } from '../../lib/constants';
import { getPackSize, getPublicCategories } from '../../lib/publicCatalog';

export function productImage(product) {
  const image = product?.images?.[0];
  return typeof image === 'string' ? image : image?.image_data || image?.image_url || '';
}

export function ProductPhoto({ product, className = '', lazy = true }) {
  const [failed, setFailed] = useState(false);
  const source = productImage(product);
  return source && !failed ? <img src={source} alt={product.name} className={className} loading={lazy ? 'lazy' : 'eager'} decoding="async" onError={() => setFailed(true)} /> : <Package size={64} strokeWidth={1} color="#b4a9ab" aria-label="Product photograph unavailable" />;
}

export function CatalogState({ loading, error, retry, empty }) {
  if (loading) return <div className="pub-products" role="status" aria-label="Loading product catalogue">{[0, 1, 2, 3].map(value => <div className="pub-skeleton" key={value} />)}</div>;
  if (error) return <div className="pub-state" role="alert"><h3>We couldn’t load the catalogue</h3><p>{error}</p><button className="pub-button outline" onClick={retry}>Try again</button></div>;
  if (empty) return <div className="pub-state"><Package size={28} /><h3>The catalogue is being updated</h3><p>Please contact an outlet for current product availability.</p><Link to="/outlets" className="pub-text-link">Find an Outlet <ArrowRight size={15} /></Link></div>;
  return null;
}

const CATEGORY_ICONS = { Beverages: Coffee, 'Health Supplements': Heart, 'Personal Care': Sparkles, Agriculture: Leaf, 'Food & Nutrition': Apple, Equipment: Wrench };

export function CategoryGrid({ products }) {
  return <div className="pub-categories">{getPublicCategories(products).map(category => {
    const Icon = CATEGORY_ICONS[category] || Package;
    return <Link to={`/shop?category=${encodeURIComponent(category)}`} className="pub-category" key={category}><Icon size={28} strokeWidth={1.5} color="#c41e3a" aria-hidden="true" /><div><h3>{category}</h3><span>Browse <ArrowRight size={12} /></span></div></Link>;
  })}</div>;
}

export function FeaturedProducts({ products }) {
  const featured = [...products.filter(product => productImage(product)), ...products.filter(product => !productImage(product))].slice(0, 4);
  return <div className="pub-products">{featured.map(product => <article className="pub-product" key={product.id}>
    <Link className="pub-product-image" to={`/shop?product=${encodeURIComponent(product.id)}`} aria-label={`View ${product.name}`}><ProductPhoto product={product} /></Link>
    <div className="pub-product-info"><small>{product.category || 'General'}</small><h3>{product.name}</h3>{getPackSize(product) && <p>{getPackSize(product)}</p>}{Number.isFinite(Number(product.cp)) && Number(product.cp) > 0 && <div className="pub-price">{formatCurrency(product.cp)} <small style={{ fontSize: 10, fontWeight: 400, color: '#69656b' }}>Consumer price</small></div>}<Link className="pub-text-link" to={`/shop?product=${encodeURIComponent(product.id)}`}>View product <ArrowRight size={14} /></Link></div>
  </article>)}</div>;
}
