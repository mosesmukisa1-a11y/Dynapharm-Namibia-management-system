import {it,expect} from 'vitest';
import {reportInstantPredicate as predicate} from '../api/services/reportDateBounds.js';
import {readFileSync} from 'node:fs';
it('includes the whole Windhoek calendar end day with an exclusive next midnight',()=>{
 expect(String(predicate('sale_date','$1','2026-10-15'))).toContain("AT TIME ZONE 'Africa/Windhoek'");
 expect(String(predicate('sale_date','$2','2026-10-15',true))).toContain('$2::date+1');
 expect(String(predicate('sale_date','$2','2026-10-15',true))).toContain(' < ');
});
it('preserves an explicitly zoned instant as the exact exclusive upper bound',()=>{
 expect(String(predicate('created_at','$2','2026-10-15T21:00:00+02:00',true))).toBe('created_at < $2::timestamptz');
});
it.each(['2026-02-30','2026-10-15T10:00:00','not-a-date'])('rejects invalid or unzoned date %s',value=>{
 expect(()=>predicate('created_at','$1',value)).toThrow();
});
it('labels GM profit and numbers MIS rows without an unsupported Table index argument',()=>{
 const gm=readFileSync('client/src/pages/portals/GMPortal.jsx','utf8');
 const mis=readFileSync('client/src/pages/portals/MISPortal.jsx','utf8');
 expect(gm).toContain('Matched charged revenue − original CIF cost');
 expect(gm).not.toContain('Profit = DP Selling Price - CIF Cost');
 expect(mis).toContain('data={filteredProducts.map((row,index)=>({...row,_displayIndex:index+1}))}');
});
