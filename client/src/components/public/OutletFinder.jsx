import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, MapPin, Navigation, Phone, Search } from 'lucide-react';
import { ADDITIONAL_OUTLETS, PUBLIC_DIRECTORY_SOURCE, PUBLIC_OUTLETS, outletDirections, filterPublicOutlets } from '../../lib/publicCatalog';

export function OutletFinder({ preview = false }) {
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const matches = filterPublicOutlets(PUBLIC_OUTLETS, search);
  const shown = preview ? matches.slice(0, 3) : matches;
  return <div>
    <label className="pub-search"><Search size={19} aria-hidden="true" /><input aria-label="Search outlets by town or outlet name" type="search" placeholder="Search by town or outlet name" value={search} onChange={event => setSearch(event.target.value)} /></label>
    <p className="pub-directory-note" aria-live="polite" style={{ marginBottom: 18 }}>{search ? `${matches.length} matching ${matches.length === 1 ? 'outlet' : 'outlets'}` : `${PUBLIC_OUTLETS.length} listed outlets`}. Please confirm current contact details and availability before visiting.</p>
    {!preview && <a className="pub-text-link" href={PUBLIC_DIRECTORY_SOURCE} target="_blank" rel="noreferrer" style={{ marginBottom: 22 }}>Official Namibia outlet list <ArrowRight size={14} /></a>}
    {shown.length ? <div className="pub-outlets">{shown.map(outlet => <article className="pub-outlet" key={outlet.id || outlet.name}>
      <div className="pub-outlet-title"><MapPin size={20} aria-hidden="true" /><h3>{outlet.name}</h3></div>
      <p>{outlet.address}</p>
      {outlet.phone && <span className="pub-outlet-phone">{outlet.phone}</span>}
      <div className="pub-outlet-actions">{outlet.phone && <a className="pub-text-link" aria-label={`Call ${outlet.name}`} href={`tel:${outlet.phone.replace(/[^\d+]/g, '')}`}><Phone size={14} /> Call</a>}<a className="pub-text-link" href={outletDirections(outlet)} target="_blank" rel="noreferrer" aria-label={`Directions to ${outlet.name}`}><Navigation size={14} /> Directions</a></div>
    </article>)}</div> : <div className="pub-state"><MapPin size={28} /><h3>No outlets found</h3><p>Try another town or a shorter outlet name.</p><button className="pub-button outline" onClick={() => setSearch('')}>Clear search</button></div>}
    {preview && <Link className="pub-text-link" to={search ? `/outlets?q=${encodeURIComponent(search)}` : '/outlets'} style={{ marginTop: 25 }}>View all outlets <ArrowRight size={15} /></Link>}
    {!preview && ADDITIONAL_OUTLETS.length > 0 && <section style={{ marginTop: 48 }} aria-labelledby="additional-outlets-title"><h2 id="additional-outlets-title" style={{ fontSize: 24 }}>Additional entries awaiting confirmation</h2><p className="pub-directory-note" style={{ marginBottom: 22 }}>These entries are retained from the local directory, but are not yet corroborated by the official Namibia outlet list. They are excluded from the listed outlet total. Please confirm their current status directly.</p><div className="pub-outlets">{ADDITIONAL_OUTLETS.filter(outlet => `${outlet.name} ${outlet.address}`.toLowerCase().includes(search.trim().toLowerCase())).map(outlet => <article className="pub-outlet" key={outlet.id || outlet.name}><div className="pub-outlet-title"><MapPin size={20} /><h3>{outlet.name}</h3></div><p>{outlet.address}</p><p>Awaiting business confirmation</p>{outlet.phone && <a className="pub-text-link" href={`tel:${outlet.phone.replace(/[^\d+]/g, '')}`} aria-label={`Call ${outlet.name} to confirm details`}><Phone size={14} /> {outlet.phone}</a>}</article>)}</div></section>}
  </div>;
}
