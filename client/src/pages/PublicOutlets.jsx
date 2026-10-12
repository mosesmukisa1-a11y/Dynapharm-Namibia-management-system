import { PublicCTA, PublicLayout } from '../components/public/PublicLayout';
import { OutletFinder } from '../components/public/OutletFinder';

export default function PublicOutlets() {
  return <PublicLayout><div className="pub-container"><div className="pub-page-intro"><div className="pub-eyebrow">Dynapharm Namibia directory</div><h1>Let’s find your local outlet.</h1><p>Search by town or outlet name. Contact the outlet to confirm opening hours, product availability and address details before you travel.</p></div><section className="pub-section" style={{ paddingTop: 10 }} aria-label="Outlet directory"><OutletFinder /></section></div><PublicCTA /></PublicLayout>;
}
