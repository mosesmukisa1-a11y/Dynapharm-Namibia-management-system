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
  { id: 'training', label: 'Training', icon: 'GraduationCap', color: '#e91e63' },
];

export const BRANCH_DETAILS = [
  { name: 'Windhoek CBD', address: '269 Independence Avenue, Shop No 1, Continental Building', phone: '+264 817499757', region: 'Khomas' },
  { name: 'Tsumeb', address: 'Shop No 35B, Erf 35, Maria Nehoya Street', phone: '+264 814757074', region: 'Oshikoto' },
  { name: 'Gobabis', address: 'Shop No 8, Erf 939, Wordmann Brock Complex, Church Street', phone: '+264 814685905', region: 'Omaheke' },
  { name: 'Swakopmund', address: '153 Kuruseb Road, Mondesa, Opposite Mondesa Usave', phone: '+264 814686806', region: 'Erongo' },
  { name: 'Outapi', address: 'Okasikili Location, Next to Lamek Garage, Main Road from and to Oshakati', phone: '+264 814685886', region: 'Omusati' },
  { name: 'Okahao', address: 'Erf 331 Taapopi Complex, Tsandi Main Road', phone: '+264 814683963', region: 'Omusati' },
  { name: 'Oshakati', address: 'Shop No 15 Fantasy Complex, Behind Bank Windhoek, Oshakati Main Road', phone: '+264 814757055', region: 'Oshana' },
  { name: 'Otjiwarongo', address: 'Shop No 13, Erindi Complex, Albertina Amadhila Street', phone: '+264 814681997', region: 'Otjozondjupa' },
  { name: 'Eenhana', address: 'Shop No 3, Tangi Complex, Dimo Amambi Street', phone: '+264 814682049', region: 'Ohangwena' },
  { name: 'Ondangwa', address: 'Shop No 3, Oluno Road, Wordmann Brock Mall, Opposite Fresco', phone: '+264 814685882', region: 'Oshana' },
  { name: 'Rundu', address: 'Shop No 6, Erf 1736, Markus Siwarongo Street, Nkarapamwe', phone: '+264 814684968', region: 'Kavango East' },
  { name: 'Walvis Bay', address: 'Shop No 6, Pelican Mall', phone: '+264 814685894', region: 'Erongo' },
  { name: 'Hochlandpark', address: '21 Robin Road, Tauben Glen, Next to OK Minimarkt Store', phone: '+264 813207195', region: 'Khomas' },
  { name: 'Khomasdal', address: 'Shop No 2, Khomasdal Funky Town Mall', phone: '+264 814682991', region: 'Khomas' },
  { name: 'Katima Mulilo', address: 'Shop No 1, Hospital Road, Opposite Open Market next to former MVA Fund', phone: '+264 814682978', region: 'Zambezi' },
];

export const BRANCHES = BRANCH_DETAILS.map(b => b.name);

export const WINDHOEK_BRANCHES = ['Windhoek CBD', 'Hochlandpark', 'Khomasdal'];

export const COMPANY_INFO = {
  name: 'Dynapharm International Namibia',
  tagline: 'A World of Health, Wealth & Freedom',
  defaultReferralName: 'Dynapharm Namibia',
  defaultReferralNB: 'NB005676',
  logo: '/assets/dynapharm-logo.png',
  socialMedia: {
    facebook: 'https://www.facebook.com/DynapharmNamibia',
    instagram: 'https://www.instagram.com/dynapharm_namibia',
    whatsapp: '+264 817499757',
    tiktok: 'https://www.tiktok.com/@dynapharmnamibia',
  },
};

export const DELIVERY_FEE_RULES = {
  windhoekFee: 0,
  outsideWindhoekFee: 150,
  isWindhoek: (branch) => WINDHOEK_BRANCHES.includes(branch),
};

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
