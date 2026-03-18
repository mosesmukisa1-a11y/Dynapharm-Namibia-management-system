import { applyAuthCors } from './_lib/auth.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    return res.status(201).json({ success: true, message: 'Field program request submitted' });
  }

  if (req.method === 'GET') {
    return res.json([]);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
