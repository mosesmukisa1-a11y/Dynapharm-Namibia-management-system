import { applyAuthCors } from './_lib/auth.js';
import { getMany } from './db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    try {
      const rows = await getMany(
        'SELECT id, upload_type, entity_id, entity_name, filename, file_url, file_size, mime_type, uploaded_by, uploaded_at FROM file_uploads ORDER BY uploaded_at DESC LIMIT 100'
      );
      return res.json(rows);
    } catch (error) {
      console.error('Media API error:', error);
      return res.json([]);
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
