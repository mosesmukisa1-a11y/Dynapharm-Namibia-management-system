import {it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {stockFormulaReview} from '../client/src/lib/stockReportFormula.js';
import React,{createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Alert} from '../client/src/components/ui.jsx';
it('renders evidence-gap text through the real shared alert component',()=>{
 // The unit runner uses classic JSX; production Vite uses the automatic runtime.
 vi.stubGlobal('React',React);
 try{expect(renderToStaticMarkup(createElement(Alert,{type:'warning'},'Movement formula requires review'))).toContain('Movement formula requires review');}
 finally{vi.unstubAllGlobals();}
});
it('reconciles a complete opening and sale without inventing receipts',()=>{
 expect(stockFormulaReview({opening:10,salesQty:2,closing:8})).toEqual({status:'reconciled',expected:8,difference:0});
});
it('preserves and flags an untraced opening gap instead of balancing it',()=>{
 expect(stockFormulaReview({opening:0,salesQty:8,closing:2})).toEqual({status:'review',expected:-8,difference:10});
});
it('includes inbound transfers and signed adjustments without a second physical deduction',()=>{
 expect(stockFormulaReview({opening:0,issued:30,adjusted:-2,closing:28}).status).toBe('reconciled');
 expect(stockFormulaReview({opening:0,issued:30,adjusted:2,closing:32}).status).toBe('reconciled');
 expect(stockFormulaReview({opening:'unavailable',closing:0}).status).toBe('unavailable');
});
it('uses selected rows for totals and exposes transfer/adjustment coverage in screen and print',()=>{
 const source=readFileSync('client/src/pages/portals/StockPortal.jsx','utf8');
 expect(source).toContain('displayReports.reduce');
 expect(source).toContain('Number(data.qty_transferred_in || 0)');
 expect(source).toContain('<th>Net adjustments</th>');
 expect(source).toContain("header: 'Net adjustments'");
 expect(source).toContain('formulaWarning');
 expect(source).toContain('<Alert type="warning">{formulaWarning}</Alert>');
});
