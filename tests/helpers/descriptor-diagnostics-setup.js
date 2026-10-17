import {subscribe,unsubscribe} from 'node:diagnostics_channel';
import {afterAll} from 'vitest';
const observe=event=>{
  if(!/^[A-Z_]+$/.test(event.reason)||event.queryId!==null&&
    !/^[A-Za-z0-9_./:#-]+$/.test(event.queryId))return;
  process.stderr.write('SQL_BOUNDARY_DIAGNOSTIC '+JSON.stringify(event)+'\n');
};
subscribe('dynapharm.sql-boundary.rejected',observe);
afterAll(()=>unsubscribe('dynapharm.sql-boundary.rejected',observe));
