import React, { act } from 'react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import SaleEvidenceLinks from './SaleEvidenceLinks';
const access=vi.fn();
vi.mock('../contexts/AuthContext',()=>({useAuth:()=>({hasPortalAccess:access})}));
let container, root;
beforeEach(()=>{
  access.mockReset();globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(()=>{act(()=>root.unmount());container.remove();});
const show=()=>act(()=>root.render(<MemoryRouter><SaleEvidenceLinks /></MemoryRouter>));
const enter=value=>act(()=>{
  const input=container.querySelector('input');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);
  input.dispatchEvent(new Event('input',{bubbles:true}));
});
it('does not offer a forbidden MIS link to a stock-authorized GM',()=>{
  access.mockImplementation(portal=>portal==='stock');show();
  expect(container.querySelector('a[href="/mis"]')).toBeNull();
  expect(container.textContent).toContain('MIS audit access is not assigned');
  enter('WALK QA%123');
  expect(container.querySelector('a').getAttribute('href'))
    .toBe('/stock?view=trace&search=WALK%20QA%25123');
});
it('retains the MIS link only for a permitted portal identity',()=>{
  access.mockImplementation(portal=>portal==='mis');show();
  expect(container.querySelector('a[href="/mis"]')).toBeTruthy();
  enter('TU-2026-000122');
  expect(container.querySelector('a[href^="/stock"]')).toBeNull();
});
it('offers neither restricted link when neither portal is allowed',()=>{
  access.mockReturnValue(false);show();
  expect(container.querySelectorAll('a')).toHaveLength(0);
});
