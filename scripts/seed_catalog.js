#!/usr/bin/env node
/**
 * Seed Dynapharm catalog data into the Railway PostgreSQL database.
 *
 * - Imports the official price list from `dynapharm-complete-system.html`
 * - Seeds the `products` table with consistent IDs/SKUs
 * - Generates branded SVG placeholders for each product and stores them in `product_images`
 * - Loads distributor records from `sample-distributor-comma.csv` and stores them in `distributors`
 *
 * Usage:
 *   DATABASE_URL=<connection-string> node scripts/seed_catalog.js
 *   node scripts/seed_catalog.js <connection-string>
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import vm from 'vm';
import { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

const databaseUrl = process.env.DATABASE_URL || process.argv[2];

if (!databaseUrl) {
  console.error('❌ DATABASE_URL environment variable (or CLI argument) is required.');
  process.exit(1);
}

function loadProjectFile(relativePath) {
  const fullPath = path.join(projectRoot, relativePath);
  return fs.readFileSync(fullPath, 'utf-8');
}

function extractPriceList() {
  const html = loadProjectFile('dynapharm-complete-system.html');
  const priceListMatch = html.match(/const\s+PRICE_LIST\s*=\s*(\[[\s\S]*?\]);/);
  if (!priceListMatch) {
    throw new Error('Could not locate PRICE_LIST definition in dynapharm-complete-system.html');
  }

  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(`PRICE_LIST = ${priceListMatch[1]};`, sandbox, { timeout: 1000 });

  if (!Array.isArray(sandbox.PRICE_LIST)) {
    throw new Error('PRICE_LIST evaluation did not produce an array');
  }

  return sandbox.PRICE_LIST;
}

function splitCsvLine(line, delimiter) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

function extractDistributors() {
  const csv = loadProjectFile('sample-distributor-comma.csv');
  const rawLines = csv.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (rawLines.length === 0) {
    return [];
  }

  const delimiter = rawLines[0].includes(';') ? ';' : ',';
  const headerValues = splitCsvLine(rawLines[0], delimiter).map(value => value.trim().toUpperCase());

  const codeIndex = headerValues.indexOf('DRN');
  const nameIndex = headerValues.indexOf('NAME');
  const mobileIndex = headerValues.indexOf('MOBILE_TELE');
  const emailIndex = headerValues.indexOf('EMAIL');
  const cityIndex = headerValues.indexOf('CITY');
  const statusIndex = headerValues.indexOf('STATUS');

  if (codeIndex === -1 || nameIndex === -1) {
    throw new Error('Distributor CSV is missing required DRN or NAME columns.');
  }

  const seen = new Set();
  const records = [];

  for (let i = 1; i < rawLines.length; i += 1) {
    const parts = splitCsvLine(rawLines[i], delimiter).map(value => value.trim());
    const code = parts[codeIndex] || '';
    const name = parts[nameIndex] || '';

    if (!code || !name || seen.has(code)) {
      continue;
    }

    seen.add(code);

    records.push({
      code,
      name,
      mobile: mobileIndex !== -1 ? (parts[mobileIndex] || '') : '',
      email: emailIndex !== -1 ? (parts[emailIndex] || '') : '',
      city: cityIndex !== -1 ? (parts[cityIndex] || '') : '',
      status: statusIndex !== -1 ? (parts[statusIndex] || '') : ''
    });
  }

  return records;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function hashedId(prefix, value, length = 10) {
  const hash = crypto.createHash('sha1').update(value).digest('hex').slice(0, length);
  return `${prefix}-${hash}`.toUpperCase();
}

function buildSku(name) {
  return slugify(name).toUpperCase().replace(/-/g, '_').slice(0, 40) || `SKU_${hashedId('SKU', name, 8)}`;
}

function createProductPlaceholder(name) {
  const safeName = name.length > 38 ? `${name.slice(0, 35)}…` : name;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1D3557"/>
      <stop offset="100%" stop-color="#457B9D"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g font-family="'Segoe UI', Arial, sans-serif" fill="#F1FAEE" text-anchor="middle">
    <text x="256" y="240" font-size="32" font-weight="700">${safeName.replace(/&/g, '&amp;')}</text>
    <text x="256" y="300" font-size="20" fill="#A8DADC">Dynapharm Namibia</text>
  </g>
</svg>`;
  const buffer = Buffer.from(svg, 'utf8');
  return {
    dataUrl: `data:image/svg+xml;base64,${buffer.toString('base64')}`,
    mimeType: 'image/svg+xml',
    width: 512,
    height: 512,
    fileSize: buffer.length,
    filename: `${slugify(name) || 'product'}-placeholder.svg`
  };
}

async function seedProducts(pool, products) {
  console.log(`📦 Preparing to seed ${products.length} products…`);
  const now = new Date();

  await pool.query('ALTER TABLE product_images DISABLE TRIGGER product_images_notify');

  try {
    await pool.query('DELETE FROM product_images');
    await pool.query('DELETE FROM products');

    const insertProductText = `
      INSERT INTO products (id, sku, name, description, dp, cp, bv, tax_rate, is_active, created_by, images, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$12)
      ON CONFLICT (id)
      DO UPDATE SET
        sku = EXCLUDED.sku,
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        dp = EXCLUDED.dp,
        cp = EXCLUDED.cp,
        bv = EXCLUDED.bv,
        tax_rate = EXCLUDED.tax_rate,
        is_active = EXCLUDED.is_active,
        images = EXCLUDED.images,
        updated_at = EXCLUDED.updated_at
    `;

    const insertImageText = `
      INSERT INTO product_images (id, product_id, product_name, image_data, image_url, image_type, width, height, file_size, is_primary, display_order, filename, mime_type, uploaded_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14,$14)
      ON CONFLICT (id)
      DO UPDATE SET
        image_data = EXCLUDED.image_data,
        image_url = EXCLUDED.image_url,
        width = EXCLUDED.width,
        height = EXCLUDED.height,
        file_size = EXCLUDED.file_size,
        filename = EXCLUDED.filename,
        mime_type = EXCLUDED.mime_type,
        is_primary = EXCLUDED.is_primary,
        display_order = EXCLUDED.display_order,
        uploaded_at = EXCLUDED.uploaded_at,
        updated_at = EXCLUDED.updated_at
    `;

    for (const product of products) {
      const name = product.description || product.name;
      const id = hashedId('PROD', name);
      const sku = buildSku(name);
      const placeholder = createProductPlaceholder(name);
      const imagesJson = JSON.stringify([
        {
          id: hashedId('IMG', name).toLowerCase(),
          url: placeholder.dataUrl,
          isPrimary: true,
          mimeType: placeholder.mimeType,
          width: placeholder.width,
          height: placeholder.height
        }
      ]);

      await pool.query(insertProductText, [
        id,
        sku,
        name,
        name,
        Number(product.dp || 0),
        Number(product.cp || product.dp || 0),
        Number(product.bv || 0),
        0,
        true,
        'system_seed',
        imagesJson,
        now
      ]);

      const imageId = hashedId('IMG', name);
      await pool.query(insertImageText, [
        imageId,
        id,
        name,
        placeholder.dataUrl,
        placeholder.dataUrl,
        'svg',
        placeholder.width,
        placeholder.height,
        placeholder.fileSize,
        true,
        0,
        placeholder.filename,
        placeholder.mimeType,
        now
      ]);
    }

    console.log(`✅ Seeded ${products.length} products with placeholder imagery.`);
  } finally {
    await pool.query('ALTER TABLE product_images ENABLE TRIGGER product_images_notify');
  }
}

async function seedDistributors(pool, distributors) {
  if (!distributors.length) {
    console.log('ℹ️ No distributors found in sample csv; skipping distributor seed.');
    return;
  }

  console.log(`👥 Preparing to seed ${distributors.length} distributors…`);
  const now = new Date();

  await pool.query('DELETE FROM distributors');

  const chunkSize = Number(process.env.DISTRIBUTOR_CHUNK_SIZE || '500');
  const totalChunks = Math.ceil(distributors.length / chunkSize);

  const insertDistributorText = `
    INSERT INTO distributors (drn, name, mobile_tele, email, city, status)
    VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (drn)
    DO UPDATE SET
      name = EXCLUDED.name,
      mobile_tele = EXCLUDED.mobile_tele,
      email = EXCLUDED.email,
      city = EXCLUDED.city,
      status = EXCLUDED.status,
      modifydate = NOW()
  `;

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    const start = chunkIndex * chunkSize;
    const end = Math.min(start + chunkSize, distributors.length);
    const chunk = distributors.slice(start, end);

    await pool.query('BEGIN');

    try {
      for (const record of chunk) {
        const mobile = record.mobile ? record.mobile.replace(/\s+/g, '') : null;
        const email = record.email && record.email.includes('@') ? record.email : null;

        await pool.query(insertDistributorText, [
          record.code,
          record.name,
          mobile,
          email,
          record.city || null,
          record.status || 'active'
        ]);
      }

      await pool.query('COMMIT');
      console.log(`   • Chunk ${chunkIndex + 1}/${totalChunks} inserted (${end}/${distributors.length} total)`);
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  }

  console.log(`✅ Seeded ${distributors.length} distributors.`);
}

async function main() {
  const products = extractPriceList();
  const distributors = extractDistributors();

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false
    },
    max: 5,
    idleTimeoutMillis: 30000
  });

  try {
    await seedProducts(pool, products);
    await seedDistributors(pool, distributors);
    console.log('🎉 Catalog seeding completed successfully.');
  } catch (error) {
    console.error('❌ Catalog seeding failed:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();

