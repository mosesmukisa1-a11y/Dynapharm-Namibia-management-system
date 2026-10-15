// @vitest-environment node
import {it,expect} from 'vitest';
import {receiptMirrorType} from '../shared/stockReceiptEvidence.js';
it('recognizes the physical receipt mirror despite legacy event-name differences',()=>{
 for(const t of ['branch_receipt','receive','received','stock_receipt','transfer_in','transit_receipt','import_received'])
   expect(receiptMirrorType(t)).toBe('physical_receipt');
});
it('does not collapse dispatch, reservation, return or distinct sale channels into receipts',()=>{
 for(const t of ['dispatch','warehouse_transfer','reserved','return','walkin_sale','campaign_sale'])
   expect(receiptMirrorType(t)).toBe(t);
});
