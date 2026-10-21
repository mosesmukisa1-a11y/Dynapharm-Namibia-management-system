import {it,expect} from 'vitest';
import {disposalFeedback,expiryReasonConflict,stockView} from './stockAuditPresentation';
it('does not invent a disposal success',()=>{
 expect(disposalFeedback({success:true,disposed:0},31).type).toBe('error');
 expect(disposalFeedback({success:true,disposed:2},31).msg).toContain('2 of 31');
 expect(disposalFeedback({success:true,disposed:31},31).type).toBe('success');
});
it('flags conflicting recorded reasons without changing historical data',()=>{
 const m={write_off_reason:'Expired',expiry_date:'2030-01-01',created_at:'2026-10-12'};
 expect(expiryReasonConflict(m)).toBe(true);
 expect(expiryReasonConflict({...m,write_off_reason:'Damaged'})).toBe(false);
 expect(expiryReasonConflict({...m,expiry_date:null})).toBe(false);
});
it('preserves compatible views and refuses unavailable tabs',()=>{
 const ids=['aiDashboard','orders','writeOffs'];
 expect(stockView(new URLSearchParams('tab=orders'),ids)).toBe('orders');
 expect(stockView(new URLSearchParams('view=writeOffs'),ids)).toBe('writeOffs');
 expect(stockView(new URLSearchParams('view=dispatchReturns'),ids)).toBe('aiDashboard');
});

it('compares write-off timestamps using the Namibian business day',()=>{
 expect(expiryReasonConflict({write_off_reason:'expired',expiry_date:'2026-10-22',created_at:'2026-10-21T23:30:00Z'})).toBe(false);
 expect(expiryReasonConflict({write_off_reason:'expired',expiry_date:'2026-10-23',created_at:'2026-10-21T23:30:00Z'})).toBe(true);
 expect(expiryReasonConflict({write_off_reason:'expired',expiry_date:'2026-02-30',created_at:'2026-02-28T12:00:00Z'})).toBe(false);
});
