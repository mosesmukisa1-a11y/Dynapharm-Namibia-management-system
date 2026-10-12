import {it,expect} from 'vitest';
import {expiryWindows,stockAsOfDate} from './expiryWindows.js';
it('uses one Windhoek day, inclusive nested windows, and discloses missing dates',()=>{
 const date='2026-10-12';
 const rows=[-1,0,30,31,90,91].map(days=>({id:days,quantity:1,expiry_date:new Date(Date.parse(date)+days*86400000).toISOString().slice(0,10)}));
 rows.push({id:'missing',quantity:1},{id:'invalid',quantity:1,expiry_date:'2026-02-30'},{id:'zero',quantity:0});
 const result=expiryWindows(rows,date);
 expect(result.within30.map(r=>r.id)).toEqual([0,30]);
 expect(result.within90.map(r=>r.id)).toEqual([0,30,31,90]);
 expect(result.within30.every(r=>result.within90.includes(r))).toBe(true);
 expect(result.expired.map(r=>r.id)).toEqual([-1]);
 expect(result.missing.map(r=>r.id)).toEqual(['missing','invalid']);
 expect(stockAsOfDate(new Date('2026-10-11T22:00:00Z'))).toBe(date);
 expect(stockAsOfDate(new Date('2026-10-11T21:59:59.999Z'))).toBe('2026-10-11');
});
