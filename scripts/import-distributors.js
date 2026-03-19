import XLSX from 'xlsx';
import http from 'http';

const FILE_PATH = './attached_assets/DSDF_-_NAMIBIA_1773917449161.xlsx';
const API_URL = 'http://localhost:3001/api/distributor-import';

async function getAdminToken() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    throw new Error('Set ADMIN_PASSWORD environment variable before running this script');
  }
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ username, password });
    const req = http.request('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const cookies = res.headers['set-cookie'] || [];
        const tokenCookie = cookies.find(c => c.startsWith('dyna_session='));
        if (tokenCookie) {
          resolve(tokenCookie.split(';')[0]);
        } else {
          try {
            const parsed = JSON.parse(body);
            resolve(parsed.token || null);
          } catch {
            reject(new Error('Could not get auth token'));
          }
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function sendBatch(rows, cookie) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ distributors: rows });
    const url = new URL(API_URL);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Cookie': cookie,
      },
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve({ error: body }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('Reading Excel file...');
  const workbook = XLSX.readFile(FILE_PATH);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet);
  console.log(`Parsed ${data.length} rows`);

  console.log('Getting admin auth token...');
  const cookie = await getAdminToken();
  if (!cookie) { console.error('Failed to get auth token'); process.exit(1); }
  console.log('Authenticated');

  const BATCH = 500;
  let totalInserted = 0, totalUpdated = 0, totalSkipped = 0, totalErrors = 0;

  for (let i = 0; i < data.length; i += BATCH) {
    const chunk = data.slice(i, i + BATCH);
    console.log(`Sending batch ${Math.floor(i/BATCH)+1}/${Math.ceil(data.length/BATCH)} (rows ${i+1}-${i+chunk.length})...`);

    const result = await sendBatch(chunk, cookie);
    if (result.error && !result.summary) {
      console.error('  Error:', result.error);
      totalErrors += chunk.length;
    } else if (result.summary) {
      totalInserted += result.summary.inserted;
      totalUpdated += result.summary.updated;
      totalSkipped += result.summary.skipped;
      totalErrors += result.summary.errors;
      console.log(`  ${result.summary.inserted} new, ${result.summary.updated} updated, ${result.summary.skipped} skipped`);
    }
  }

  console.log('\n=== IMPORT COMPLETE ===');
  console.log(`Total Inserted: ${totalInserted}`);
  console.log(`Total Updated: ${totalUpdated}`);
  console.log(`Total Skipped: ${totalSkipped}`);
  console.log(`Total Errors: ${totalErrors}`);
}

main().catch(err => { console.error(err); process.exit(1); });
