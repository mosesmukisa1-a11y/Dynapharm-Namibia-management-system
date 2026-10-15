import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import React from 'react';
import DispatchNote from '../components/DispatchNote.jsx';
import {getBranchDisplayName} from './constants.js';

describe('current document branch display without identity rewriting',()=>{
  it('labels townshop as Windhoek CBD while keeping the input transfer unchanged',()=>{
    const transfer={id:'SYNTHETIC-DISPLAY-NOTE',fromWarehouse:'windhoek_warehouse',
      toBranch:'townshop',status:'dispatched',gmApprovedBy:'Synthetic GM',
      items:[{productName:'SYNTHETIC-PRODUCT',quantity:2,quantityApproved:2,batchNo:'QA-LOT'}]};
    const before=JSON.stringify(transfer);
    // Unit project uses classic JSX; production Vite uses the automatic runtime.
    vi.stubGlobal('React',React);
    let html;
    try{html=renderToStaticMarkup(<DispatchNote transfer={transfer}/>);}
    finally{vi.unstubAllGlobals();}
    expect(html).toContain('Windhoek CBD');
    expect(html).not.toContain('>Townshop<');
    expect(JSON.stringify(transfer)).toBe(before);
    expect(getBranchDisplayName('townshop')).toBe('Windhoek CBD');
    expect(getBranchDisplayName('windhoek_cbd')).toBe('Windhoek CBD');
  });
});
