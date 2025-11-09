import { query } from '../db.js';

export default async function handler(req, res) {
  try {
    const result = await query('SELECT NOW() AS server_time');
    res.status(200).json({
      ok: true,
      rows: result.rows,
    });
  } catch (error) {
    console.error('DB debug error:', error);
    res.status(500).json({
      ok: false,
      message: error.message,
    });
  }
}

