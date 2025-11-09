import { applyAuthCors } from './_lib/auth.js';
import { query, getMany, getOne } from './db.js';

async function parseRequestBody(req) {
  if (req.body) {
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body || '{}');
      } catch (error) {
        throw new Error('Invalid JSON payload');
      }
    }
    return req.body;
  }

  return new Promise((resolve, reject) => {
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

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function generateEmployeeId(prefix) {
  return `${prefix || 'EMP'}-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function normalizeEmployeeRow(row) {
  if (!row) return null;
  const data =
    typeof row.data === 'string'
      ? (() => {
          try {
            return JSON.parse(row.data);
          } catch {
            return {};
          }
        })()
      : row.data || {};

  const hireDate =
    row.hire_date instanceof Date
      ? row.hire_date.toISOString().slice(0, 10)
      : row.hire_date || data.hireDate || null;

  const dob =
    row.dob instanceof Date ? row.dob.toISOString().slice(0, 10) : row.dob || data.dob || null;

  const branches =
    Array.isArray(row.branches) && row.branches !== null
      ? row.branches
      : data.branches
      ? Array.isArray(data.branches)
        ? data.branches
        : typeof data.branches === 'string'
        ? data.branches.split(',').map((item) => item.trim()).filter(Boolean)
        : []
      : [];

  return {
    id: row.id,
    employeeId: row.employee_id || row.user_id || data.employeeId || row.id,
    name: data.name || row.full_name || row.name || 'Team Member',
    role: data.role || row.role || '',
    branch: data.branch || row.branch || '',
    branches,
    department: data.department || row.department || '',
    position: data.position || row.position || data.role || '',
    email: data.email || row.email || '',
    phone: data.phone || row.phone || '',
    hireDate,
    employmentType: data.employmentType || row.employment_type || '',
    salary:
      data.salary !== undefined
        ? Number(data.salary)
        : row.salary !== null && row.salary !== undefined
        ? Number(row.salary)
        : null,
    address: data.address || row.address || '',
    dob,
    emergencyContactName:
      data.emergencyContactName || row.emergency_contact_name || data.emergencyContact?.name || '',
    emergencyContactPhone:
      data.emergencyContactPhone ||
      row.emergency_contact_phone ||
      data.emergencyContact?.phone ||
      '',
    notes: data.notes || row.notes || '',
    data: data,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at || null,
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : row.updated_at || null
  };
}

function buildEmployeeRecord(body, existing = {}) {
  const now = new Date().toISOString();
  const id = body.id || existing.id || generateEmployeeId('EMP');
  const employeeId =
    body.employeeId ||
    body.employee_id ||
    existing.employee_id ||
    existing.user_id ||
    generateEmployeeId('STAFF');

  const previousData =
    typeof existing.data === 'string'
      ? (() => {
          try {
            return JSON.parse(existing.data);
          } catch {
            return {};
          }
        })()
      : existing.data || {};

  const basic = {
    id,
    employee_id: employeeId,
    user_id: employeeId,
    full_name: body.name || body.fullName || existing.full_name || 'Team Member',
    role: body.role || existing.role || null,
    branch: body.branch || existing.branch || null,
    branches: Array.isArray(body.branches)
      ? body.branches
      : Array.isArray(existing.branches)
      ? existing.branches
      : null,
    department: body.department || existing.department || null,
    position: body.position || existing.position || body.role || null,
    email: body.email || existing.email || null,
    phone: body.phone || existing.phone || null,
    hire_date: toDate(body.hireDate || body.hire_date || existing.hire_date),
    employment_type: body.employmentType || existing.employment_type || null,
    salary:
      body.salary !== undefined && body.salary !== null
        ? Number(body.salary)
        : existing.salary !== undefined
        ? existing.salary
        : null,
    address: body.address || existing.address || null,
    dob: toDate(body.dob || body.dateOfBirth || existing.dob),
    emergency_contact_name:
      body.emergencyContactName || body.emergencyContact?.name || existing.emergency_contact_name || null,
    emergency_contact_phone:
      body.emergencyContactPhone ||
      body.emergencyContact?.phone ||
      existing.emergency_contact_phone ||
      null,
    employment_status: body.employmentStatus || existing.employment_status || 'active',
    notes: body.notes || existing.notes || null,
    data: JSON.stringify({
      ...previousData,
      ...body,
      employeeId
    }),
    updated_at: now
  };

  return basic;
}

async function insertEmployee(body) {
  const record = buildEmployeeRecord(body);
  const columns = Object.keys(record);
  const values = Object.values(record);
  const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');
  const columnNames = columns.map((col) => `"${col}"`).join(', ');
  const result = await query(
    `INSERT INTO employees (${columnNames}) VALUES (${placeholders}) RETURNING *`,
    values
  );
  return normalizeEmployeeRow(result.rows[0]);
}

async function updateEmployee(id, body, existing) {
  const record = buildEmployeeRecord(body, existing);
  const columns = Object.keys(record);
  const values = Object.values(record);
  const setClause = columns.map((col, idx) => `"${col}" = $${idx + 1}`).join(', ');
  const result = await query(
    `UPDATE employees SET ${setClause} WHERE id = $${columns.length + 1} RETURNING *`,
    [...values, id]
  );
  return normalizeEmployeeRow(result.rows[0]);
}

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { searchParams } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const id = searchParams.get('id');
  const employeeId = searchParams.get('employeeId');
  const department = searchParams.get('department');

  try {
    if (req.method === 'GET') {
      if (id) {
        const row = await getOne('SELECT * FROM employees WHERE id = $1', [id]);
        if (!row) return res.status(404).json({ success: false, error: 'Not found' });
        return res.status(200).json(normalizeEmployeeRow(row));
      }

      if (employeeId) {
        const row = await getOne('SELECT * FROM employees WHERE employee_id = $1', [employeeId]);
        if (!row) return res.status(404).json({ success: false, error: 'Not found' });
        return res.status(200).json(normalizeEmployeeRow(row));
      }

      let queryText = 'SELECT * FROM employees';
      const params = [];
      if (department) {
        queryText += ' WHERE department = $1';
        params.push(department);
      }
      queryText += ' ORDER BY updated_at DESC, full_name ASC';
      const rows = await getMany(queryText, params);
      return res.status(200).json(rows.map(normalizeEmployeeRow).filter(Boolean));
    }

    if (req.method === 'POST') {
      const body = await parseRequestBody(req);
      const created = await insertEmployee(body);
      return res.status(201).json({ success: true, employee: created });
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const body = await parseRequestBody(req);
      const targetId = body.id || id || null;
      const targetEmployeeId = body.employeeId || body.employee_id || employeeId || null;

      if (!targetId && !targetEmployeeId) {
        return res.status(400).json({ success: false, error: 'Employee id is required' });
      }

      const existing = targetId
        ? await getOne('SELECT * FROM employees WHERE id = $1', [targetId])
        : await getOne('SELECT * FROM employees WHERE employee_id = $1', [targetEmployeeId]);

      if (!existing) {
        return res.status(404).json({ success: false, error: 'Employee not found' });
      }

      const updated = await updateEmployee(existing.id, body, existing);
      return res.status(200).json({ success: true, employee: updated });
    }

    if (req.method === 'DELETE') {
      const identifier = id ? { column: 'id', value: id } : employeeId ? { column: 'employee_id', value: employeeId } : null;
      if (!identifier) {
        return res.status(400).json({ success: false, error: 'id or employeeId is required' });
      }
      const result = await query(
        `DELETE FROM employees WHERE ${identifier.column} = $1 RETURNING *`,
        [identifier.value]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ success: false, error: 'Employee not found' });
      }
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Employees API error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
}

