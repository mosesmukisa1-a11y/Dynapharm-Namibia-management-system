import { useState } from 'react';
import { Activity, ArrowLeftRight, BarChart3, Bell, Boxes, ChevronDown, ChevronRight, ClipboardCheck, ClipboardList, FileSpreadsheet, Globe, LayoutDashboard, ListOrdered, Megaphone, Menu, MessageSquare, Package, PanelLeftClose, PanelLeftOpen, ScanBarcode, Settings, ShieldCheck, ShoppingCart, TrendingUp, Truck, Undo2, Users, Warehouse } from 'lucide-react';
import { locationLabel } from './distributionModel';
import './stock-portal.css';

const groups = [
  { title: 'Overview', ids: ['aiDashboard', 'overview', 'realtime'] },
  { title: 'Inventory', ids: ['countryStock', 'warehouses', 'branchStock', 'inventory', 'batch', 'fieldStock', 'barcode'] },
  { title: 'Transfers', ids: ['distribution', 'orders', 'transfers', 'dispatchReturns'] },
  { title: 'Approvals', ids: ['refundApprovals', 'adjustments', 'controlledOperations', 'writeOffs'] },
  { title: 'Reports', ids: ['stockReports', 'costReport', 'valuation', 'reorder'] },
  { title: 'Administration', ids: ['supplierImport', 'alertSettings', 'campaigns', 'staffServices', 'messages'] },
];
const icons = {
  aiDashboard: LayoutDashboard, overview: BarChart3, realtime: Activity,
  countryStock: Globe, warehouses: Warehouse, branchStock: Boxes, inventory: Package, batch: ClipboardList, fieldStock: Users, barcode: ScanBarcode,
  distribution: Truck, orders: ShoppingCart, transfers: ArrowLeftRight, dispatchReturns: Undo2,
  refundApprovals: Undo2, adjustments: ShieldCheck, controlledOperations: ClipboardCheck, writeOffs: ClipboardList,
  stockReports: FileSpreadsheet, costReport: ListOrdered, valuation: BarChart3, reorder: TrendingUp,
  supplierImport: Globe, alertSettings: Bell, campaigns: Megaphone, staffServices: Users, messages: MessageSquare,
};
const labels = { orders: 'Warehouse dispatch', transfers: 'Branch transfers', dispatchReturns: 'Dispatch returns', controlledOperations: 'Counts & returns', writeOffs: 'Write-offs', batch: 'Batches' };

/**
 * Pass only the existing permission-filtered tabs. No new permissions are inferred.
 * branchFilter is the existing branch selector/banner; never rendered on Distribution.
 */
export default function StockPortalShell({ tabs, activeTab, onChange, user, globalBranch, branchFilter, children }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [closedGroups, setClosedGroups] = useState({});
  const isDistribution = activeTab === 'distribution';
  const configuredIds = new Set(groups.flatMap(group => group.ids));
  const sidebarGroups = [...groups, ...(tabs.some(tab => !configuredIds.has(tab.id)) ? [{ title: 'Other tools', ids: tabs.filter(tab => !configuredIds.has(tab.id)).map(tab => tab.id) }] : [])];
  const active = tabs.find(tab => tab.id === activeTab);
  const scope = isDistribution ? 'National stock · Warehouse distribution' : globalBranch === 'all' ? 'All locations' : locationLabel(globalBranch || user?.branch);
  return <div className={`stock-workspace ${collapsed ? 'is-collapsed' : ''}`}>
    <aside className={`stock-sidebar ${mobileOpen ? 'mobile-open' : ''}`} aria-label="Stock portal navigation">
      <div className="stock-sidebar-head">
        <div className="stock-sidebar-brand"><div className="stock-brand">Dynapharm</div><small>Namibia · Stock portal</small></div>
        <button type="button" className="sp-btn sp-btn-icon stock-collapse-menu" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} aria-expanded={!collapsed}>
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
        <button type="button" className="sp-btn sp-btn-icon stock-mobile-menu" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle navigation menu" aria-expanded={mobileOpen}><Menu size={17} /></button>
      </div>
      <nav aria-label="Stock sections">
        {sidebarGroups.map(group => {
          const allowed = group.ids.map(id => tabs.find(tab => tab.id === id)).filter(Boolean);
          if (!allowed.length) return null;
          return <div key={group.title} className="stock-nav-group">
            <button type="button" className="stock-nav-toggle" aria-expanded={!closedGroups[group.title]} aria-controls={`stock-group-${group.title.replaceAll(' ', '-')}`} onClick={() => setClosedGroups(previous => ({ ...previous, [group.title]: !previous[group.title] }))}>{group.title}{closedGroups[group.title] ? <ChevronRight size={13} /> : <ChevronDown size={13} />}</button>
            {!closedGroups[group.title] && <div id={`stock-group-${group.title.replaceAll(' ', '-')}`}>
              {allowed.map(tab => {
                const Icon = icons[tab.id] || Settings;
                const label = labels[tab.id] || tab.label;
                return <button key={tab.id} type="button" className="stock-nav-link" aria-label={label} title={label} aria-current={activeTab === tab.id ? 'page' : undefined} onClick={() => { onChange(tab.id); setMobileOpen(false); }}><Icon size={17} /><span>{label}</span></button>;
              })}
            </div>}
          </div>;
        })}
      </nav>
    </aside>
    <main className="stock-main">
      <header className="stock-page-header">
        <div><div className="stock-eyebrow">National inventory operations</div><h1>{isDistribution ? 'Distribute stock' : active?.label || 'Stock management'}</h1><p>{isDistribution ? 'Country Stock → Warehouse' : 'Dynapharm Namibia · Stock management'}</p></div>
        <div className="stock-user"><strong>{user?.fullName || user?.full_name || user?.username || 'Staff member'}</strong><span>{locationLabel(user?.role || 'staff')}</span><div className="stock-scope">{scope}</div></div>
      </header>
      {!isDistribution && branchFilter}
      {children}
    </main>
  </div>;
}
