export const PORTALS = [
  { id: 'distributor', label: 'Distributor', icon: 'ShoppingCart', color: '#c41e3a' },
  { id: 'frontdesk', label: 'Front Desk', icon: 'Store', color: '#c41e3a' },
  { id: 'consultant', label: 'Consultant', icon: 'Stethoscope', color: '#c41e3a' },
  { id: 'branch', label: 'Branch', icon: 'Building2', color: '#3498db' },
  { id: 'hr', label: 'HR', icon: 'Users', color: '#27ae60' },
  { id: 'finance', label: 'Finance', icon: 'DollarSign', color: '#f39c12' },
  { id: 'gm', label: 'GM', icon: 'ClipboardList', color: '#9b59b6' },
  { id: 'director', label: 'Director', icon: 'Briefcase', color: '#2c3e50' },
  { id: 'mis', label: 'MIS', icon: 'BarChart3', color: '#e67e22' },
  { id: 'stock', label: 'Stock', icon: 'Package', color: '#1abc9c' },
  { id: 'admin', label: 'Admin', icon: 'Settings', color: '#7f8c8d' },
];

export const BRANCHES = [
  'Windhoek CBD', 'Katutura', 'Oshakati', 'Ondangwa', 'Walvis Bay',
  'Swakopmund', 'Rundu', 'Katima Mulilo', 'Keetmanshoop', 'Otjiwarongo',
  'Gobabis', 'Mariental', 'Rehoboth', 'Okahandja', 'Tsumeb',
];

export const CURRENCY = 'N$';

export function formatCurrency(amount) {
  return `${CURRENCY} ${Number(amount || 0).toFixed(2)}`;
}

export function formatDate(date) {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('en-ZA', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export function formatDateTime(date) {
  if (!date) return '-';
  return new Date(date).toLocaleString('en-ZA', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
