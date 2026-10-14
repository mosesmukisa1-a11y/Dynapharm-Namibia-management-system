import { applyAuthCors } from '../_lib/auth.js';
import { getMany, query } from '../db.js';
import { businessDatePredicate, validateBusinessDates } from '../services/businessDates.js';

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeLog(row) {
  if (!row) return null;
  return {
    id: row.id,
    eventType: row.event_type,
    recordId: row.record_id,
    user: row.user_name,
    details:
      typeof row.details === 'object' && row.details !== null
        ? row.details
        : row.details
        ? (() => {
            try {
              return JSON.parse(row.details);
            } catch {
              return row.details;
            }
          })()
        : {},
    createdAt: row.created_at,
  };
}

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });

  if (req.method === 'GET') {
    try {
      const { searchParams } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
       const startParam = searchParams.get('start');
       const endParam = searchParams.get('end');
       validateBusinessDates(startParam,endParam);
      const branchParam = searchParams.get('branch');
      const eventType = searchParams.get('event');

      const params = [];
      const where = [];

      if (startParam) {
        where.push(businessDatePredicate('created_at',`$${params.length + 1}`));
        params.push(startParam);
      }

      if (endParam) {
        where.push(businessDatePredicate('created_at',`$${params.length + 1}`,true));
        params.push(endParam);
      }

      if (eventType) {
        where.push(`event_type = $${params.length + 1}`);
        params.push(eventType);
      }

      if (branchParam) {
        where.push(`(LOWER(REPLACE(details->>'branch',' ','_')) = LOWER(REPLACE($${params.length + 1},' ','_')))`);
        params.push(branchParam);
      }

      let queryText = `
        SELECT *
        FROM mis_sales_audit
      `;
      if (where.length > 0) {
        queryText += ` WHERE ${where.join(' AND ')}`;
      }
      queryText += ' ORDER BY created_at DESC LIMIT 500';

      const rows = await getMany(queryText, params);
      return res.status(200).json({
        success: true,
        logs: rows.map(normalizeLog).filter(Boolean),
      });
    } catch (error) {
      console.error('MIS audit GET error:', error);
      return res.status(error.statusCode || 500).json({ success: false, error: error?.message || 'Internal server error' });
    }
  }

  if (req.method === 'POST') {
    try {
      let body;
      if (req.body && typeof req.body === 'object') {
        body = req.body;
      } else {
        body = await new Promise((resolve, reject) => {
          let raw = '';
          req.on('data', (chunk) => {
            raw += chunk;
          });
          req.on('end', () => {
            if (!raw) {
              resolve({});
              return;
            }
            try {
              resolve(JSON.parse(raw));
            } catch (error) {
              reject(new Error('Invalid JSON payload'));
            }
          });
          req.on('error', reject);
        });
      }

      const id = await query(
        `
          INSERT INTO mis_sales_audit (event_type, record_id, user_name, details, created_at)
          VALUES ($1, $2, $3, $4, NOW())
          RETURNING id
        `,
        [
          body.eventType === 'sale_created' ? 'sale_created_unverified_client' : body.eventType || 'unknown',
          body.recordId || null,
          body.user || null,
          body.details ? JSON.stringify(body.details) : null,
        ]
      );

      return res.status(201).json({
        success: true,
        id: id.rows[0]?.id || null,
      });
    } catch (error) {
      console.error('MIS audit POST error:', error);
      return res.status(500).json({ success: false, error: error?.message || 'Internal server error' });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}


