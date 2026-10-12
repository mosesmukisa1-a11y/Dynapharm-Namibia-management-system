// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import ClientHistory, { ClientHistoryDirectory } from './ClientHistory.jsx';

const mocks = vi.hoisted(() => ({
  user: { id: 'front-actor', role: 'frontdesk', branch: 'okongo' },
  get: vi.fn(), post: vi.fn(), list: vi.fn(), create: vi.fn(), update: vi.fn(),
}));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('../lib/api', () => ({ api: {
  get: mocks.get, post: mocks.post,
  clients: { list: mocks.list, create: mocks.create, update: mocks.update },
} }));
const client = { id: 'synthetic-client', full_name: 'Synthetic Outreach Client', phone: '0810000119', branch: 'okongo', data: { idNumber: 'TEST123456' } };
const medicine = { name: 'Recorded medicine', unit: 'tablet', quantity: 7, directions: 'As recorded on paper', alreadyDispensed: 3 };
const filed = {
  id: 'synthetic-encounter', client_id: client.id, status: 'draft', version: 2, source: 'outreach', branch: 'okongo',
  service_at: '2024-02-11T10:00:00.000Z', captured_at: '2024-02-12T11:00:00.000Z', captured_by: 'front-actor',
  data: { offSystemHistorical: true, location: 'Field site', originalAuthor: 'Dr Ester Amutenya (recorded)',
    originalFormReference: 'PAPER-2024-118', notes: 'Original form transcribed', medicines: [medicine], attachments: [] },
  quantities: [{ ...medicine, dispensed: 3, outstanding: 4 }], evidence: [],
  history: [{ id: 'audit-1', action: 'create', actor: 'front-actor', created_at: '2024-02-12T11:00:00.000Z', snapshot: { data: { medicines: [medicine] } } }],
};
const earlier = { ...filed, id: 'earlier-encounter', status: 'finalized', data: { medicines: [medicine] },
  evidence: [{ id: 'evidence-1', mode: 'historical', service_at: filed.service_at,
    data: { source: 'Paper log', dispenser: 'Recorded dispenser' }, items: [{ name: medicine.name, quantity: 3 }] }] };
const originalReact = globalThis.React;
let host, root, detail, available;
beforeAll(() => { globalThis.React = React; globalThis.IS_REACT_ACT_ENVIRONMENT = true; });
afterAll(() => { globalThis.React = originalReact; globalThis.IS_REACT_ACT_ENVIRONMENT = false; });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = { id: 'front-actor', role: 'frontdesk', branch: 'okongo' };
  detail = { client, encounters: [filed], reports: [], appointments: [] };
  available = false;
  mocks.get.mockImplementation(endpoint => Promise.resolve(endpoint.includes('capabilities=true') ? { available } : detail));
  mocks.list.mockResolvedValue([client]);
  mocks.post.mockResolvedValue({ success: true });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const render = component => act(async () => root.render(component));
const button = text => [...host.querySelectorAll('button')].find(item => item.textContent.trim() === text);
const click = text => act(async () => button(text).click());
const field = text => [...host.querySelectorAll('label')].find(item => item.querySelector('span')?.textContent === text)?.querySelector('input,textarea,select');
const fill = (label, value) => act(async () => {
  const input = field(label);
  const prototype = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype
    : input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
});
const prepareForm = async () => {
  await click('File off-system form');
  await fill('Actual service date and time (your local timezone)', '2024-02-11T10:00');
  await fill('Recorded prescriber (required)', 'Dr Ester Amutenya (external)');
  await fill('Original form reference (required)', 'PAPER-2024-118');
  await click('Add medicine');
  await fill('Medicine 1 name', 'Manual medicine not in catalogue');
  await fill('Medicine 1 prescribed quantity', '7');
  await fill('Medicine 1 already dispensed', '3');
  await fill('Medicine 1 directions', 'As recorded on paper');
};

describe('off-system form filing only', () => {
  it('files a manual source form without staff, catalogue, approval or dispensing dependencies', async () => {
    mocks.post.mockImplementation(async (_endpoint, body) => {
      detail = { ...detail, encounters: [...detail.encounters, { ...filed, id: 'newly-filed-form',
        service_at: body.serviceAt, source: body.source, data: body.data, quantities: [], history: [] }] };
      return { success: true };
    });
    await render(<ClientHistory clientId={client.id} />);
    await prepareForm();
    await click('File historical form');
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.post).toHaveBeenCalledWith('/client-history', expect.objectContaining({
      action: 'create', clientId: client.id, operationId: expect.any(String),
      serviceAt: new Date('2024-02-11T10:00').toISOString(), source: 'paper',
      data: expect.objectContaining({ originalAuthor: 'Dr Ester Amutenya (external)', originalFormReference: 'PAPER-2024-118',
        offSystemHistorical: true, attachments: [],
        medicines: [{ name: 'Manual medicine not in catalogue', quantity: 7, alreadyDispensed: 3, directions: 'As recorded on paper', unit: 'unit' }] }),
    }));
    expect(mocks.get.mock.calls.every(([endpoint]) => endpoint.startsWith('/client-history'))).toBe(true);
    expect(mocks.post.mock.calls[0][1]).not.toHaveProperty('responsibleConsultant');
    expect(host.textContent).toContain('No order, stock or accounting transaction was created');
    expect(mocks.get.mock.calls.filter(([endpoint]) => endpoint === '/client-history?clientId=synthetic-client')).toHaveLength(2);
    expect(host.textContent).toContain('Manual medicine not in catalogue');
    await click('Reload history');
    expect(host.textContent).toContain('Manual medicine not in catalogue');
    expect([...host.querySelectorAll('.ch-badge')].filter(item => item.textContent === 'Filed off-system history')).toHaveLength(2);
  });
  it('requires source author and form reference, and bounds already-dispensed integers', async () => {
    await render(<ClientHistory clientId={client.id} />);
    await click('File off-system form');
    await click('File historical form');
    expect(host.textContent).toContain('Recorded prescriber is required');
    await fill('Recorded prescriber (required)', 'Recorded external prescriber');
    await click('File historical form');
    expect(host.textContent).toContain('Original form reference is required');
    await fill('Original form reference (required)', 'P-118');
    await click('Add medicine'); await fill('Medicine 1 name', 'Manual medicine');
    await fill('Medicine 1 already dispensed', '2');
    await click('File historical form');
    expect(host.textContent).toContain('no greater than prescribed quantity');
    await fill('Medicine 1 already dispensed', '0.5'); await click('File historical form');
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it('keeps consultants read-only even for their earlier prescriptions', async () => {
    mocks.user = { id: 'clinical-actor', role: 'consultant', branch: 'okongo' };
    detail.encounters = [{ ...filed, responsible_consultant: 'clinical-actor' }, earlier];
    await render(<ClientHistory clientId={client.id} />);
    expect(host.textContent).toContain('Read-only history');
    expect(button('File off-system form')).toBeUndefined();
    expect(button('Amend with reason')).toBeUndefined();
    expect(button('Record / link dispensing')).toBeUndefined();
    expect(host.querySelector('input[type=file]')).toBeNull();
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it('ignores workflow status and shows historical counts, original evidence and audit snapshots', async () => {
    detail.encounters = [filed, earlier];
    await render(<ClientHistory clientId={client.id} />);
    expect(host.textContent).toContain('Filed off-system history');
    expect(host.textContent).toContain('Earlier evidence · read-only');
    expect(host.textContent).not.toContain('Consultant finalized');
    expect(host.textContent).not.toContain('Draft · unreviewed');
    const cells = [...host.querySelector('tbody').querySelectorAll('td')].map(item => item.textContent);
    expect(cells.slice(1)).toEqual(['7 tablet', '3', '4']);
    expect(host.textContent).toContain('Recorded dispenser');
    expect(host.textContent).toContain('Recorded original / snapshot');
    expect(host.querySelectorAll('button').length).toBe(3);
    expect([...host.querySelectorAll('button')].filter(item => item.textContent === 'Amend with reason')).toHaveLength(1);
  });
  it('amends the entire transcribed form with version and a required reason', async () => {
    await render(<ClientHistory clientId={client.id} />);
    await click('Amend with reason'); await click('Save audited amendment');
    expect(host.textContent).toContain('An amendment reason is required');
    expect(mocks.post).not.toHaveBeenCalled();
    await fill('Medicine 1 name', 'Corrected name');
    await fill('Medicine 1 prescribed quantity', '9');
    await fill('Medicine 1 already dispensed', '4');
    await fill('Source', 'outage');
    await fill('Original form reference (required)', 'Corrected reference');
    await fill('Amendment reason (required)', 'Corrected transcription against original paper');
    await click('Save audited amendment');
    expect(mocks.post).toHaveBeenCalledWith('/client-history', expect.objectContaining({
      action: 'amend', encounterId: filed.id, version: 2, source: 'outage',
      reason: 'Corrected transcription against original paper',
      data: expect.objectContaining({ originalFormReference: 'Corrected reference',
        medicines: [expect.objectContaining({ name: 'Corrected name', quantity: 9, alreadyDispensed: 4 })] }),
    }));
  });
  it('retries an uncertain filing using the exact operation and locked form', async () => {
    mocks.post.mockRejectedValueOnce(new Error('Temporary network failure'));
    await render(<ClientHistory clientId={client.id} />); await prepareForm(); await click('File historical form');
    const first = mocks.post.mock.calls[0][1];
    expect(first.operationId).toBeTruthy();
    expect(button('File historical form').matches(':disabled')).toBe(true);
    expect(button('Close editor').disabled).toBe(true);
    await click('Retry exact request');
    expect(mocks.post.mock.calls[1][1]).toEqual(first);
  });
  it('requires explicit reload and reopening after a version conflict', async () => {
    mocks.post.mockRejectedValueOnce(new Error('Record changed; reload before retrying'));
    await render(<ClientHistory clientId={client.id} />); await click('Amend with reason');
    await fill('Amendment reason (required)', 'Correct transcription'); await click('Save audited amendment');
    expect(host.textContent).toContain('Reload current records');
    expect(button('Save audited amendment').matches(':disabled')).toBe(true);
    expect(button('Retry exact request')).toBeUndefined();
    await click('Reload history');
    expect(button('Amend with reason').disabled).toBe(false);
    expect(button('Save audited amendment')).toBeUndefined();
  });
  it('retains earlier encounters without providing any edit or dispensing action', async () => {
    detail.encounters = [earlier];
    await render(<ClientHistory clientId={client.id} />);
    expect(host.textContent).toContain('Earlier evidence · read-only');
    expect(host.textContent).toContain('Paper log');
    expect(button('Amend with reason')).toBeUndefined();
    expect(button('Resume draft')).toBeUndefined();
    expect(button('Record / link dispensing')).toBeUndefined();
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it('provides explicit manual transcription when secure storage is unavailable', async () => {
    await render(<ClientHistory clientId={client.id} />); await click('File off-system form');
    expect(host.textContent).toContain('Secure attachment storage is unavailable. Use manual transcription');
    expect(host.querySelector('input[type=file]')).toBeNull();
    expect(mocks.get).toHaveBeenCalledWith('/client-history-attachment?clientId=synthetic-client&capabilities=true');
  });
  it('uploads with authenticated multipart and files only the returned attachment reference', async () => {
    available = true;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ attachment: { id: 'secure-118', name: 'original.pdf' } }) });
    vi.stubGlobal('fetch', fetchMock);
    await render(<ClientHistory clientId={client.id} />); await prepareForm();
    const input = host.querySelector('input[type=file]');
    const file = new File(['paper'], 'original.pdf', { type: 'application/pdf' });
    Object.defineProperty(input, 'files', { value: [file] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    const [url, config] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/client-history-attachment?clientId=synthetic-client');
    expect(config.credentials).toBe('include'); expect(config.method).toBe('POST');
    expect(config.body.get('file').name).toBe('original.pdf');
    expect(config).not.toHaveProperty('headers');
    expect(host.querySelector('a').getAttribute('href')).toContain('attachmentId=secure-118');
    await click('File historical form');
    expect(mocks.post.mock.calls[0][1].data.attachments).toEqual([{ id: 'secure-118', name: 'original.pdf' }]);
  });
  it('shows upload failure while retaining the manual filing path', async () => {
    available = true;
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Upload connection failed')));
    await render(<ClientHistory clientId={client.id} />); await prepareForm();
    const input = host.querySelector('input[type=file]');
    Object.defineProperty(input, 'files', { value: [new File(['paper'], 'original.pdf')] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    expect(host.textContent).toContain('Upload connection failed');
    expect(button('File historical form').matches(':disabled')).toBe(false);
    await click('File historical form');
    expect(mocks.post.mock.calls[0][1].data.attachments).toEqual([]);
  });
  it('preserves directory identity search, contact editing and registration', async () => {
    await render(<ClientHistoryDirectory />);
    expect(host.textContent).toContain(client.full_name);
    expect(button('Open history')).toBeDefined(); expect(button('Edit contact')).toBeDefined();
    await fill('Search name, phone, email, client ID, national ID or membership reference', 'TEST123456');
    expect(host.textContent).toContain(client.full_name);
    await click('Register client');
    expect(host.textContent).toContain('Email (optional)');
    expect(host.textContent).toContain('NB / DZ membership reference (optional)');
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
});
