/**
 * accountsPdf.js — PDF generation for AccountsTab financial statements.
 * Uses jsPDF + jspdf-autotable for clean, text-based PDFs.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency, formatDate } from './constants';

const COMPANY = 'DYNAPHARM INTERNATIONAL NAMIBIA';
const THEME_R = 180, THEME_G = 30, THEME_B = 30;

function n(v) { return Number(v) || 0; }
function fmt(v) { return formatCurrency(n(v)); }
function neg(v) { return n(v) > 0 ? `(${fmt(v)})` : fmt(v); }
function pct(v) { return `${n(v).toFixed(1)}%`; }

/* ── Header drawn on the current page ── */
function drawHeader(doc, title, subtitle, period) {
  doc.setFillColor(THEME_R, THEME_G, THEME_B);
  doc.rect(0, 0, 210, 22, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(COMPANY, 14, 10);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(title, 14, 17);

  doc.setTextColor(80, 80, 80);
  doc.setFontSize(8);
  doc.text(subtitle || '', 14, 28);
  doc.text(`Period: ${formatDate(period.start)} — ${formatDate(period.end)}`, 14, 34);
  doc.text(`Generated: ${new Date().toLocaleString('en-NA')}`, 14, 40);

  doc.setDrawColor(220, 220, 220);
  doc.line(14, 43, 196, 43);
  return 48;
}

/* ── Footer on every page ── */
function drawFooters(doc) {
  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.text('Dynapharm Namibia HMS — Confidential Financial Document', 14, 291);
    doc.text(`Page ${i} of ${total}`, 196, 291, { align: 'right' });
  }
}

/* ── Shared autoTable style ── */
function tbl(doc, startY, head, body, opts = {}) {
  autoTable(doc, {
    startY,
    head,
    body,
    theme: 'grid',
    headStyles: {
      fillColor: [THEME_R, THEME_G, THEME_B],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 8,
    },
    bodyStyles: { fontSize: 8, cellPadding: 2 },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: {
      0: { cellWidth: opts.labelWidth || 110 },
      1: { halign: 'right', cellWidth: 45 },
      2: { halign: 'right', cellWidth: opts.col2Width || 28, textColor: [100, 100, 100] },
    },
    margin: { left: 14, right: 14 },
    ...opts,
  });
  return doc.lastAutoTable.finalY + 4;
}

/* ═══════════════════════════════════════════════
   1. INCOME STATEMENT
═══════════════════════════════════════════════ */
function buildIncomeStatement(doc, data, startY) {
  const {
    revenue, cogs, grossProfit, grossMargin,
    totalSalaries, salaryCount, periodMonths,
    totalRent, rentCount, bonusPayout, expByCategory,
    opExpenses, ebit, sscEmployer, taxableIncome,
    citProvision, netProfit, netMargin,
  } = data;

  const expRows = [
    ...(n(totalSalaries) > 0 ? [[`  Staff Salaries & Benefits (${salaryCount} staff × ${periodMonths}mo)`, neg(totalSalaries), '']] : []),
    ...(n(totalRent) > 0 ? [[`  Branch Rent & Lease (${rentCount} locations × ${periodMonths}mo)`, neg(totalRent), '']] : []),
    ...(n(bonusPayout) > 0 ? [['  Distributor Bonus Payouts', neg(bonusPayout), '']] : []),
    ...Object.entries(expByCategory || {})
      .sort((a, b) => b[1] - a[1])
      .map(([cat, val]) => [`  ${cat}`, neg(val), '']),
  ];

  let y = tbl(doc, startY,
    [['REVENUE', 'Amount (N$)', '']],
    [
      ['Total Revenue (at Distributor Price)', fmt(revenue), ''],
    ]
  );

  y = tbl(doc, y,
    [['COST OF GOODS SOLD', 'Amount (N$)', '']],
    [
      ['CIF Procurement Cost', neg(cogs), ''],
      ['Gross Profit', fmt(grossProfit), pct(grossMargin)],
    ]
  );

  y = tbl(doc, y,
    [['OPERATING EXPENSES', 'Amount (N$)', '']],
    [
      ...expRows,
      ['Total Operating Expenses', neg(opExpenses), ''],
    ]
  );

  y = tbl(doc, y,
    [['PROFITABILITY', 'Amount (N$)', '']],
    [
      ['EBIT (Earnings Before Interest & Tax)', fmt(ebit), ''],
      ['  SSC Employer Contribution (0.9%)', neg(sscEmployer), ''],
      ['Taxable Income', fmt(taxableIncome), ''],
      ['  CIT Provision @ 32% (Namibia)', neg(citProvision), ''],
      ['NET PROFIT / (LOSS)', fmt(netProfit), pct(netMargin)],
    ]
  );

  return y;
}

/* ═══════════════════════════════════════════════
   2. FINANCIAL POSITION
═══════════════════════════════════════════════ */
function buildFinancialPosition(doc, data, startY) {
  const {
    stockValueDP, pcBalance, depositsReceived, totalCurrentAssets,
    citProvision, vatPayable, pendingRemittances, totalLiabilities, equity,
  } = data;

  let y = tbl(doc, startY,
    [['CURRENT ASSETS', 'Amount (N$)', '']],
    [
      ['  Inventory (Stock at Distributor Price)', fmt(stockValueDP), ''],
      ['  Petty Cash Balances', fmt(pcBalance), ''],
      ['  Cash & Bank Deposits (Period)', fmt(depositsReceived), ''],
      ['Total Current Assets', fmt(totalCurrentAssets), ''],
    ]
  );

  y = tbl(doc, y,
    [['ESTIMATED LIABILITIES', 'Amount (N$)', '']],
    [
      ['  Income Tax Payable (CIT @ 32%)', neg(citProvision), ''],
      ['  VAT Payable (Output − Input)', neg(vatPayable), ''],
      ['  Accounts Payable (Pending Remittances)', neg(pendingRemittances), ''],
      ['Total Liabilities', neg(totalLiabilities), ''],
    ]
  );

  y = tbl(doc, y,
    [['NET EQUITY', 'Amount (N$)', '']],
    [
      ['Net Equity (Total Assets − Total Liabilities)', fmt(equity), ''],
    ]
  );

  doc.setFontSize(7);
  doc.setTextColor(160, 100, 0);
  doc.text(
    'Note: Estimated financial position derived from operational data. Fixed assets, long-term liabilities and full equity',
    14, y
  );
  doc.text('structure require a complete chart of accounts from a Chartered Accountant.', 14, y + 4);
  doc.setTextColor(0);

  return y + 10;
}

/* ═══════════════════════════════════════════════
   3. TAX & COMPLIANCE
═══════════════════════════════════════════════ */
const VAT_RATE = 0.15;
function buildTaxCompliance(doc, data, startY) {
  const {
    revenue, cogs, vatOnRevenue, vatOnPurchases, vatPayable,
    ebit, sscEmployer, taxableIncome, citProvision, importDuty,
  } = data;

  let y = tbl(doc, startY,
    [['VAT RETURN ESTIMATE (VAT Act — 15%)', 'Amount (N$)', '']],
    [
      ['Total Revenue (incl. VAT)', fmt(revenue), ''],
      ['  VAT-exclusive Base', fmt(n(revenue) / (1 + VAT_RATE)), ''],
      ['  Output VAT @ 15%', fmt(vatOnRevenue), ''],
      ['CIF Procurement Cost (incl. VAT)', fmt(cogs), ''],
      ['  Input VAT @ 15% (claimable)', fmt(vatOnPurchases), ''],
      ['Net VAT Payable to NamRA', neg(vatPayable), ''],
    ]
  );

  y = tbl(doc, y,
    [['CORPORATE INCOME TAX (Income Tax Act — 32%)', 'Amount (N$)', '']],
    [
      ['EBIT (Operating Profit)', fmt(ebit), ''],
      ['  SSC Employer Deduction', neg(sscEmployer), ''],
      ['Taxable Income', fmt(taxableIncome), ''],
      ['  CIT @ 32% (Standard Rate)', neg(citProvision), ''],
    ]
  );

  y = tbl(doc, y,
    [['IMPORT DUTIES & TOTAL OBLIGATIONS', 'Amount (N$)', '']],
    [
      ['CIF Value of Imports', fmt(cogs), ''],
      ['  Estimated Import Duty @ 5%', neg(importDuty), ''],
      ['CIT Provision', neg(citProvision), ''],
      ['VAT Payable', neg(vatPayable), ''],
      ['Total Tax Obligations', neg(n(citProvision) + n(vatPayable) + n(importDuty)), ''],
    ]
  );

  const schedule = [
    ['VAT Return (NamRA)', 'Monthly — due 25th of following month', 'Value Added Tax Act 10 of 2000'],
    ['Corporate Income Tax', 'Annual — provisional tax 2× per year', 'Income Tax Act 24 of 1981'],
    ['PAYE Submission', 'Monthly — due 20th of following month', 'Income Tax Act — Employees Tax'],
    ['SSC Contributions', 'Monthly — due last day of month', 'Social Security Act 34 of 1994'],
    ['Import Duty & Customs', 'Per shipment — via NAMCIS system', 'Customs & Excise Act 20 of 1998'],
    ['Annual Financial Statements', 'Annually — within 6 months of year end', 'Companies Act 28 of 2004'],
  ];

  autoTable(doc, {
    startY: y,
    head: [['COMPLIANCE SCHEDULE', 'Frequency', 'Legislation']],
    body: schedule,
    theme: 'grid',
    headStyles: { fillColor: [THEME_R, THEME_G, THEME_B], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 7.5, cellPadding: 2 },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 70 }, 2: { cellWidth: 56 } },
    margin: { left: 14, right: 14 },
  });

  return doc.lastAutoTable.finalY + 4;
}

/* ═══════════════════════════════════════════════
   4. KEY RATIOS
═══════════════════════════════════════════════ */
function buildKeyRatios(doc, data, startY) {
  const {
    revenue, cogs, grossProfit, grossMargin,
    netProfit, netMargin, opExpenses,
    ebit, citProvision, vatOnRevenue, vatOnPurchases,
  } = data;

  const ratios = [
    ['Gross Profit Margin', pct(grossMargin), 'Gross Profit ÷ Revenue', '> 25% healthy for pharma distribution'],
    ['Net Profit Margin', pct(netMargin), 'Net Profit ÷ Revenue (after CIT)', '> 5% is acceptable'],
    ['COGS as % of Revenue', n(revenue) ? pct(n(cogs) / n(revenue) * 100) : '—', 'CIF Cost ÷ Revenue', '< 60% is good'],
    ['Operating Expense Ratio', n(revenue) ? pct(n(opExpenses) / n(revenue) * 100) : '—', 'OpEx ÷ Revenue', '< 20% is efficient'],
    ['Effective Tax Rate', n(ebit) > 0 ? pct(n(citProvision) / n(ebit) * 100) : '0.0%', 'CIT Provision ÷ EBIT', 'Namibia standard: 32%'],
    ['VAT Recovery Rate', n(vatOnRevenue) > 0 ? pct(n(vatOnPurchases) / n(vatOnRevenue) * 100) : '—', 'Input VAT ÷ Output VAT', 'Higher = less VAT to pay'],
  ];

  const y = tbl(doc, startY,
    [['KEY FINANCIAL RATIOS', 'Value', 'Basis', 'Benchmark']],
    ratios,
    {
      labelWidth: 70,
      col2Width: 25,
      columnStyles: {
        0: { cellWidth: 65 },
        1: { halign: 'right', cellWidth: 28 },
        2: { cellWidth: 52, textColor: [80, 80, 80] },
        3: { cellWidth: 42, textColor: [80, 80, 80], fontStyle: 'italic' },
      },
    }
  );

  return y;
}

/* ═══════════════════════════════════════════════
   PUBLIC API
═══════════════════════════════════════════════ */

export function downloadStatementPdf(type, data) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const period = data.period;

  const titles = {
    pl:      ['Income Statement', 'Profit & Loss — Dynapharm International Namibia'],
    balance: ['Statement of Financial Position', 'Balance Sheet Estimate — Dynapharm International Namibia'],
    tax:     ['Tax & Compliance Report', 'VAT, CIT, SSC & Import Duty Obligations — Namibia'],
    ratios:  ['Key Financial Ratios', 'Performance Indicators — Dynapharm International Namibia'],
  };

  const [title, subtitle] = titles[type] || ['Financial Report', ''];
  let y = drawHeader(doc, title, subtitle, period);

  if (type === 'pl')      buildIncomeStatement(doc, data, y);
  if (type === 'balance') buildFinancialPosition(doc, data, y);
  if (type === 'tax')     buildTaxCompliance(doc, data, y);
  if (type === 'ratios')  buildKeyRatios(doc, data, y);

  drawFooters(doc);

  const fileName = `Dynapharm-${title.replace(/\s+/g, '-')}-${period.start}-to-${period.end}.pdf`;
  doc.save(fileName);
}

export function downloadAllStatementsPdf(data) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const period = data.period;

  const sections = [
    { type: 'pl',      title: 'Income Statement',                subtitle: 'Profit & Loss' },
    { type: 'balance', title: 'Statement of Financial Position', subtitle: 'Balance Sheet Estimate' },
    { type: 'tax',     title: 'Tax & Compliance Report',         subtitle: 'VAT, CIT, SSC & Import Duties' },
    { type: 'ratios',  title: 'Key Financial Ratios',            subtitle: 'Performance Indicators' },
  ];

  sections.forEach((s, idx) => {
    if (idx > 0) doc.addPage();
    let y = drawHeader(doc, s.title, `${s.subtitle} — Dynapharm International Namibia`, period);
    if (s.type === 'pl')      buildIncomeStatement(doc, data, y);
    if (s.type === 'balance') buildFinancialPosition(doc, data, y);
    if (s.type === 'tax')     buildTaxCompliance(doc, data, y);
    if (s.type === 'ratios')  buildKeyRatios(doc, data, y);
  });

  drawFooters(doc);

  const fileName = `Dynapharm-Complete-Financial-Statements-${period.start}-to-${period.end}.pdf`;
  doc.save(fileName);
}
