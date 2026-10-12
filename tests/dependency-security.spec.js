// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { once } from 'node:events';
import express from 'express';
import multer from 'multer';
import cookie from 'cookie';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import { PDFParse } from 'pdf-parse';

const rootLock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url)));
const gatewayLock = JSON.parse(readFileSync(new URL('../realtime-gateway/package-lock.json', import.meta.url)));
const rootManifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));

const minimumVersions = {
  '@babel/core': '7.29.6',
  '@humanfs/node': '0.16.8',
  '@remix-run/router': '1.23.3',
  '@tootallnate/once': '2.0.1',
  '@vitest/mocker': '4.1.11',
  ajv: '6.14.0',
  'baseline-browser-mapping': '2.11.0',
  'body-parser': '1.20.6',
  'brace-expansion': '1.1.21',
  browserslist: '4.28.7',
  cookie: '0.7.0',
  dompurify: '3.4.16',
  'fast-xml-builder': '1.1.7',
  flatted: '3.4.2',
  'form-data': { 2: '2.5.6', 4: '4.0.6' },
  'js-yaml': '4.3.2',
  multer: '2.3.0',
  nanoid: { 3: '3.3.18', 5: '5.1.16' },
  'path-to-regexp': '0.1.13',
  picomatch: { 2: '2.3.2', 4: '4.0.4' },
  postcss: '8.5.23',
  'postcss-selector-parser': '7.1.6',
  'proxy-addr': '2.0.8',
  qs: '6.16.0',
  'react-router': '7.18.0',
  'react-router-dom': '7.18.0',
  'source-map-js': '1.2.2',
  uuid: '11.1.1',
  vitest: '4.1.11',
  ws: '8.21.0',
  xlsx: '0.20.2',
};

function atLeast(version, minimum) {
  const actual = version.split('.').map(Number);
  const expected = minimum.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (actual[i] !== expected[i]) return actual[i] > expected[i];
  }
  return true;
}

describe('SheetJS advisory remediation', () => {
  for (const [advisory, fixedVersion] of [
    ['GHSA-4r6h-8v6p-xvw6 (prototype pollution)', '0.19.3'],
    ['GHSA-5pgg-2g8v-p4x9 (regular-expression DoS)', '0.20.2'],
  ]) {
    it(`uses the upstream patched release for ${advisory}`, () => {
      const lockedVersion = rootLock.packages['node_modules/xlsx'].version;
      expect(atLeast(lockedVersion, fixedVersion)).toBe(true);
      // Check both Node entry points, not just the declared lockfile version.
      const require = createRequire(import.meta.url);
      expect(XLSX.version).toBe(lockedVersion);
      expect(require('xlsx').version).toBe(lockedVersion);
    });
  }

  it('pins every SheetJS copy to an integrity-checked official CDN release', () => {
    const entry = rootLock.packages['node_modules/xlsx'];
    const officialUrl = `https://cdn.sheetjs.com/xlsx-${entry.version}/xlsx-${entry.version}.tgz`;
    expect(rootManifest.dependencies.xlsx).toBe(officialUrl);
    expect(rootLock.packages[''].dependencies.xlsx).toBe(officialUrl);
    for (const lock of [rootLock, gatewayLock]) {
      for (const [path, installed] of Object.entries(lock.packages)) {
        if (path.split('node_modules/').pop() !== 'xlsx') continue;
        expect(atLeast(installed.version, '0.20.2')).toBe(true);
        expect(installed.resolved).toBe(
          `https://cdn.sheetjs.com/xlsx-${installed.version}/xlsx-${installed.version}.tgz`,
        );
        expect(installed.integrity).toMatch(/^sha512-[A-Za-z0-9+/]{86}==$/);
      }
    }
  });

  it('runs the exact patched SheetJS distribution verified against the official archive', () => {
    // Independently verified against the official 0.20.3 tarball. Refresh these
    // fingerprints from upstream when upgrading; version strings alone are not
    // proof that the installed parser contains the upstream security fixes.
    const require = createRequire(import.meta.url);
    const packageUrl = pathToFileURL(require.resolve('xlsx'));
    expect(rootLock.packages['node_modules/xlsx'].integrity).toBe(
      'sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==',
    );
    for (const [file, expectedHash] of [
      ['xlsx.js', 'fd159f1e2d694e12cd0709c1ec1b63c6e1f045d2c4ce857a346f9b965798cbfa'],
      ['xlsx.mjs', '1a0fb062ee9781b13f6687371b202aaefc53b6ce55b530c027e01f9c087b77db'],
      ['dist/xlsx.full.min.js', 'cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41'],
    ]) {
      const actualHash = createHash('sha256')
        .update(readFileSync(new URL(file, packageUrl)))
        .digest('hex');
      expect(actualHash, `${file} must match the verified upstream parser`).toBe(expectedHash);
    }
  });
});

describe('patched dependency trees', () => {
  for (const [label, lock] of [['application', rootLock], ['realtime gateway', gatewayLock]]) {
    it(`${label} has no listed vulnerable package versions`, () => {
      for (const [path, entry] of Object.entries(lock.packages)) {
        if (!path) continue;
        const name = path.split('node_modules/').pop();
        expect(name, `${path} must not reintroduce the unpatched brace parser`).not.toBe('braces');
        const floor = minimumVersions[name];
        if (floor) {
          const minimum = typeof floor === 'string' ? floor : floor[entry.version.split('.')[0]];
          expect(minimum, `Unknown release line for ${name}@${entry.version}`).toBeTruthy();
          expect(atLeast(entry.version, minimum), `${path}@${entry.version} requires >=${minimum}`).toBe(true);
        }
        if (name === 'pdfjs-dist') {
          // The advisory affects >=5.6.83 <6.2.108; retain the compatible, unaffected 5.5 line.
          expect(!atLeast(entry.version, '5.6.83') || atLeast(entry.version, '6.2.108')).toBe(true);
        }
      }
    });
  }

  it('keeps the CDN PDF loader on the same unaffected release as the installed dependency', () => {
    const source = readFileSync(new URL('../client/src/pages/portals/GMPortal.jsx', import.meta.url), 'utf8');
    const version = rootLock.packages['node_modules/pdfjs-dist'].version;
    expect(source).toContain(`const PDFJS_VERSION = '${version}'`);
  });

  it('supports CommonJS UUID consumers in the Google storage dependency tree', () => {
    const require = createRequire(import.meta.url);
    for (const parent of ['@google-cloud/storage', 'gaxios', 'teeny-request']) {
      const parentRequire = createRequire(require.resolve(parent));
      expect(parentRequire('uuid').v4()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });
});

describe('dependency upgrade compatibility', () => {
  it('round-trips session cookie values and security attributes', () => {
    const serialized = cookie.serialize('dyna_session', 'example.value', {
      httpOnly: true, secure: true, sameSite: 'Strict', path: '/', maxAge: 28800,
    });
    expect(cookie.parse(serialized).dyna_session).toBe('example.value');
    expect(serialized).toContain('HttpOnly');
    expect(serialized).toContain('Secure');
    expect(serialized).toContain('SameSite=Strict');
  });

  for (const bookType of ['xlsx', 'xls', 'csv']) {
    it(`preserves ${bookType} spreadsheet imports and exports`, () => {
      const rows = [{ 'NB Number': 'NB001', Name: 'Example Distributor', Amount: 123.45 }];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Bonuses');
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType });
      const read = XLSX.read(buffer, { type: 'buffer' });
      expect(XLSX.utils.sheet_to_json(read.Sheets[read.SheetNames[0]], { defval: '' })).toEqual(rows);
    });
  }

  it('extracts PDF text with the server parser', async () => {
    const document = new jsPDF();
    document.text('Dependency compatibility check', 10, 20);
    const parser = new PDFParse({ data: new Uint8Array(document.output('arraybuffer')) });
    try {
      expect((await parser.getText()).text).toContain('Dependency compatibility check');
    } finally {
      await parser.destroy();
    }
  });

  it('accepts valid uploads and rejects oversized ones with patched Express and Multer', async () => {
    const app = express();
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 } });
    app.post('/upload', upload.single('file'), (req, res) => res.json({ size: req.file.size }));
    app.use((error, req, res, next) => res.status(413).json({ code: error.code }));
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const url = `http://127.0.0.1:${server.address().port}/upload`;
      const valid = new FormData();
      valid.append('file', new Blob(['hello']), 'example.txt');
      const accepted = await fetch(url, { method: 'POST', body: valid });
      expect(accepted.status).toBe(200);
      expect(await accepted.json()).toEqual({ size: 5 });
      const oversized = new FormData();
      oversized.append('file', new Blob(['x'.repeat(32)]), 'large.txt');
      const rejected = await fetch(url, { method: 'POST', body: oversized });
      expect(rejected.status).toBe(413);
      expect(await rejected.json()).toEqual({ code: 'LIMIT_FILE_SIZE' });
    } finally {
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
});
