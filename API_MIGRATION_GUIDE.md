# API Endpoint Migration Guide

This guide shows you how to migrate the remaining API endpoints from localStorage/JSON files to PostgreSQL.

---

## Migration Pattern

All endpoints follow the same pattern:

1. Replace storage mechanism (localStorage/JSON → PostgreSQL)
2. Use database helper functions from `api/db.js`
3. Add real-time event publishing
4. Handle JSONB fields for complex data
5. Add optimistic locking for updates

---

## Example 1: Migrating Products API

### Before (Current `api/products.js`)

```javascript
// Uses localStorage
let products = [];
function loadProductsData() {
    const storedProducts = localStorage.getItem('dyna_products');
    if (storedProducts) products = JSON.parse(storedProducts);
}
```

### After (PostgreSQL-based)

Create `api/products.js`:

```javascript
/**
 * Products API Endpoint - PostgreSQL-based with Real-Time Sync
 */

import { findById, findAll, insert, update, remove, publishRealtimeEvent, query } from './db.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        // GET - Fetch products
        if (req.method === 'GET') {
            const { id, branch, category, search, is_active } = req.query || {};
            
            if (id) {
                const product = await findById('products', id);
                if (!product) {
                    return res.status(404).json({ error: 'Product not found' });
                }
                return res.status(200).json(product);
            }

            // Build filters
            const filters = {};
            if (branch) filters.branch = branch;
            if (category && category !== 'all') filters.category = category;
            if (is_active !== undefined) filters.is_active = is_active === 'true';

            let products = await findAll('products', filters, 'name ASC');

            // Apply search filter if provided
            if (search) {
                const searchLower = search.toLowerCase();
                products = products.filter(p => 
                    p.sku?.toLowerCase().includes(searchLower) ||
                    p.name?.toLowerCase().includes(searchLower) ||
                    p.description?.toLowerCase().includes(searchLower)
                );
            }

            return res.status(200).json(products);
        }

        // POST - Create product
        if (req.method === 'POST') {
            const body = req.body || {};
            
            // Validate required fields
            if (!body.name || !body.dp || !body.cp || !body.bv) {
                return res.status(400).json({ 
                    error: 'Missing required fields: name, dp, cp, bv' 
                });
            }

            // Validate pricing
            if (parseFloat(body.dp) > parseFloat(body.cp)) {
                return res.status(400).json({ 
                    error: 'DP cannot be greater than CP' 
                });
            }

            const productId = body.id || body.sku || `PRD${Date.now()}`;
            
            // Check if product exists (by SKU)
            if (body.sku) {
                const existing = await findAll('products', { sku: body.sku });
                if (existing.length > 0) {
                    return res.status(200).json({ 
                        success: true, 
                        message: 'Product already exists',
                        product: existing[0]
                    });
                }
            }

            const productData = {
                id: productId,
                sku: body.sku || body.name.toUpperCase().replace(/\s+/g, '-'),
                name: body.name,
                description: body.description || body.name,
                category: body.category || 'General',
                unit: body.unit || 'Unit',
                dp: parseFloat(body.dp),
                cp: parseFloat(body.cp),
                bv: parseFloat(body.bv),
                tax_rate: parseFloat(body.taxRate || body.tax_rate || 0),
                is_active: body.isActive !== undefined ? body.isActive : true,
                branch: body.branch || null,
                created_by: body.createdBy || body.created_by || null,
            };

            const newProduct = await insert('products', productData);
            
            // Create price history entry
            await insert('price_history', {
                id: `PH${Date.now()}`,
                product_id: newProduct.id,
                effective_from: new Date().toISOString(),
                effective_to: null,
                dp: newProduct.dp,
                cp: newProduct.cp,
                bv: newProduct.bv,
                changed_by: productData.created_by,
            });

            // Publish realtime event
            await publishRealtimeEvent('products', 'created', newProduct);

            return res.status(201).json({ 
                success: true, 
                message: 'Product created',
                product: newProduct
            });
        }

        // PUT - Update product
        if (req.method === 'PUT') {
            const body = req.body || {};
            const productId = body.id;

            if (!productId) {
                return res.status(400).json({ error: 'Product ID required' });
            }

            const existing = await findById('products', productId);
            if (!existing) {
                return res.status(404).json({ error: 'Product not found' });
            }

            // Check version for optimistic locking
            if (body.version !== undefined && existing.version !== body.version) {
                return res.status(409).json({ 
                    error: 'Conflict: Product was modified by another user',
                    product: existing,
                    yourVersion: body.version,
                    serverVersion: existing.version
                });
            }

            // Prepare update data
            const updateData = {};
            if (body.name !== undefined) updateData.name = body.name;
            if (body.description !== undefined) updateData.description = body.description;
            if (body.category !== undefined) updateData.category = body.category;
            if (body.unit !== undefined) updateData.unit = body.unit;
            if (body.dp !== undefined) updateData.dp = parseFloat(body.dp);
            if (body.cp !== undefined) updateData.cp = parseFloat(body.cp);
            if (body.bv !== undefined) updateData.bv = parseFloat(body.bv);
            if (body.taxRate !== undefined) updateData.tax_rate = parseFloat(body.taxRate);
            if (body.tax_rate !== undefined) updateData.tax_rate = parseFloat(body.tax_rate);
            if (body.isActive !== undefined) updateData.is_active = body.isActive;
            if (body.is_active !== undefined) updateData.is_active = body.is_active;
            if (body.branch !== undefined) updateData.branch = body.branch;

            const updatedProduct = await update('products', productId, updateData);
            
            // If pricing changed, update price history
            if (updateData.dp !== undefined || updateData.cp !== undefined || updateData.bv !== undefined) {
                // Close previous price history
                await query(
                    `UPDATE price_history SET effective_to = CURRENT_TIMESTAMP 
                     WHERE product_id = $1 AND effective_to IS NULL`,
                    [productId]
                );

                // Create new price history entry
                await insert('price_history', {
                    id: `PH${Date.now()}`,
                    product_id: productId,
                    effective_from: new Date().toISOString(),
                    effective_to: null,
                    dp: updatedProduct.dp,
                    cp: updatedProduct.cp,
                    bv: updatedProduct.bv,
                    changed_by: body.updatedBy || body.updated_by || null,
                });
            }

            // Publish realtime event
            await publishRealtimeEvent('products', 'updated', updatedProduct);

            return res.status(200).json({ 
                success: true, 
                message: 'Product updated',
                product: updatedProduct
            });
        }

        // DELETE - Delete product
        if (req.method === 'DELETE') {
            const { id } = req.query || {};
            
            if (!id) {
                return res.status(400).json({ error: 'Product ID required' });
            }

            const deleted = await remove('products', id);
            
            if (!deleted) {
                return res.status(404).json({ error: 'Product not found' });
            }

            // Publish realtime event
            await publishRealtimeEvent('products', 'deleted', { id });

            return res.status(200).json({ 
                success: true, 
                message: 'Product deleted'
            });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('Products API error:', error);
        return res.status(500).json({ 
            error: error.message || 'Internal server error',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}
```

---

## Example 2: Migrating Employees API

### Before (Current `api/employees.js`)

```javascript
// Uses global.employees array and JSON files
if (!global.employees) {
    global.employees = loadFromFile();
}
```

### After (PostgreSQL-based)

Create `api/employees.js`:

```javascript
/**
 * Employees API Endpoint - PostgreSQL-based with Real-Time Sync
 */

import { findById, findAll, insert, update, remove, publishRealtimeEvent } from './db.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        // GET - Fetch employees
        if (req.method === 'GET') {
            const { id, branch, role, status, q } = req.query || {};
            
            if (id) {
                const employee = await findById('employees', id);
                if (!employee) {
                    return res.status(404).json({ error: 'Employee not found' });
                }
                // Parse branches array if it's a string
                if (employee.branches && typeof employee.branches === 'string') {
                    employee.branches = employee.branches.replace(/[{}]/g, '').split(',').filter(Boolean);
                }
                // Parse leave_entitlements JSONB
                if (employee.leave_entitlements && typeof employee.leave_entitlements === 'string') {
                    try {
                        employee.leave_entitlements = JSON.parse(employee.leave_entitlements);
                    } catch (e) {
                        employee.leave_entitlements = { annual: 24, sick: 10 };
                    }
                }
                return res.status(200).json(employee);
            }

            // Build filters
            const filters = {};
            if (role) filters.role = role;
            if (status) filters.employment_status = status;

            let employees = await findAll('employees', filters, 'full_name ASC');

            // Apply branch filter (check branch or branches array)
            if (branch) {
                employees = employees.filter(e => 
                    e.branch === branch || 
                    (e.branches && (
                        (Array.isArray(e.branches) && e.branches.includes(branch)) ||
                        (typeof e.branches === 'string' && e.branches.includes(branch))
                    ))
                );
            }

            // Apply search filter
            if (q) {
                const searchLower = q.toLowerCase();
                employees = employees.filter(e => 
                    e.full_name?.toLowerCase().includes(searchLower) ||
                    e.user_id?.toLowerCase().includes(searchLower) ||
                    e.email?.toLowerCase().includes(searchLower) ||
                    e.phone?.toLowerCase().includes(searchLower)
                );
            }

            // Parse branches and leave_entitlements for all employees
            employees.forEach(emp => {
                if (emp.branches && typeof emp.branches === 'string') {
                    emp.branches = emp.branches.replace(/[{}]/g, '').split(',').filter(Boolean);
                }
                if (emp.leave_entitlements && typeof emp.leave_entitlements === 'string') {
                    try {
                        emp.leave_entitlements = JSON.parse(emp.leave_entitlements);
                    } catch (e) {
                        emp.leave_entitlements = { annual: 24, sick: 10 };
                    }
                }
            });

            return res.status(200).json(employees);
        }

        // POST - Create employee
        if (req.method === 'POST') {
            const body = req.body || {};
            
            // Validate required fields
            if (!body.fullName && !body.full_name) {
                return res.status(400).json({ error: 'fullName is required' });
            }
            if (!body.userId && !body.user_id) {
                return res.status(400).json({ error: 'userId is required' });
            }
            if (!body.role) {
                return res.status(400).json({ error: 'role is required' });
            }
            if (!body.branch) {
                return res.status(400).json({ error: 'branch is required' });
            }

            // Check if user_id already exists
            const userId = body.userId || body.user_id;
            const existing = await findAll('employees', { user_id: userId });
            if (existing.length > 0) {
                return res.status(400).json({ 
                    error: 'Employee with this user ID already exists' 
                });
            }

            const employeeId = body.id || `EMP${Date.now()}`;
            const branches = body.branches || [body.branch];

            const employeeData = {
                id: employeeId,
                user_id: userId,
                full_name: body.fullName || body.full_name,
                role: body.role,
                branch: body.branch,
                branches: `{${branches.join(',')}}`, // PostgreSQL array format
                supervisor_id: body.supervisorId || body.supervisor_id || null,
                email: body.email || '',
                phone: body.phone || '',
                hire_date: body.hireDate || body.hire_date || new Date().toISOString().split('T')[0],
                employment_status: body.employmentStatus || body.employment_status || 'active',
                leave_entitlements: JSON.stringify(body.leaveEntitlements || body.leave_entitlements || { annual: 24, sick: 10 }),
            };

            const newEmployee = await insert('employees', employeeData);
            
            // Parse for response
            if (newEmployee.branches && typeof newEmployee.branches === 'string') {
                newEmployee.branches = newEmployee.branches.replace(/[{}]/g, '').split(',').filter(Boolean);
            }
            if (newEmployee.leave_entitlements && typeof newEmployee.leave_entitlements === 'string') {
                try {
                    newEmployee.leave_entitlements = JSON.parse(newEmployee.leave_entitlements);
                } catch (e) {
                    newEmployee.leave_entitlements = { annual: 24, sick: 10 };
                }
            }

            // Publish realtime event
            await publishRealtimeEvent('employees', 'created', newEmployee);

            return res.status(201).json({ 
                success: true, 
                message: 'Employee created',
                employee: newEmployee
            });
        }

        // PUT - Update employee
        if (req.method === 'PUT') {
            const body = req.body || {};
            const employeeId = body.id;

            if (!employeeId) {
                return res.status(400).json({ error: 'Employee ID required' });
            }

            const existing = await findById('employees', employeeId);
            if (!existing) {
                return res.status(404).json({ error: 'Employee not found' });
            }

            // Check version for optimistic locking
            if (body.version !== undefined && existing.version !== body.version) {
                return res.status(409).json({ 
                    error: 'Conflict: Employee was modified by another user',
                    employee: existing,
                    yourVersion: body.version,
                    serverVersion: existing.version
                });
            }

            // Prepare update data
            const updateData = {};
            if (body.fullName !== undefined) updateData.full_name = body.fullName;
            if (body.full_name !== undefined) updateData.full_name = body.full_name;
            if (body.role !== undefined) updateData.role = body.role;
            if (body.branch !== undefined) updateData.branch = body.branch;
            if (body.branches !== undefined) {
                const branches = Array.isArray(body.branches) ? body.branches : [body.branches];
                updateData.branches = `{${branches.join(',')}}`;
            }
            if (body.supervisorId !== undefined) updateData.supervisor_id = body.supervisorId;
            if (body.supervisor_id !== undefined) updateData.supervisor_id = body.supervisor_id;
            if (body.email !== undefined) updateData.email = body.email;
            if (body.phone !== undefined) updateData.phone = body.phone;
            if (body.hireDate !== undefined) updateData.hire_date = body.hireDate;
            if (body.hire_date !== undefined) updateData.hire_date = body.hire_date;
            if (body.employmentStatus !== undefined) updateData.employment_status = body.employmentStatus;
            if (body.employment_status !== undefined) updateData.employment_status = body.employment_status;
            if (body.leaveEntitlements !== undefined) {
                updateData.leave_entitlements = JSON.stringify(body.leaveEntitlements);
            }
            if (body.leave_entitlements !== undefined) {
                updateData.leave_entitlements = JSON.stringify(body.leave_entitlements);
            }

            const updatedEmployee = await update('employees', employeeId, updateData);
            
            // Parse for response
            if (updatedEmployee.branches && typeof updatedEmployee.branches === 'string') {
                updatedEmployee.branches = updatedEmployee.branches.replace(/[{}]/g, '').split(',').filter(Boolean);
            }
            if (updatedEmployee.leave_entitlements && typeof updatedEmployee.leave_entitlements === 'string') {
                try {
                    updatedEmployee.leave_entitlements = JSON.parse(updatedEmployee.leave_entitlements);
                } catch (e) {
                    updatedEmployee.leave_entitlements = { annual: 24, sick: 10 };
                }
            }

            // Publish realtime event
            await publishRealtimeEvent('employees', 'updated', updatedEmployee);

            return res.status(200).json({ 
                success: true, 
                message: 'Employee updated',
                employee: updatedEmployee
            });
        }

        // DELETE - Delete employee
        if (req.method === 'DELETE') {
            const { id } = req.query || {};
            
            if (!id) {
                return res.status(400).json({ error: 'Employee ID required' });
            }

            const deleted = await remove('employees', id);
            
            if (!deleted) {
                return res.status(404).json({ error: 'Employee not found' });
            }

            // Publish realtime event
            await publishRealtimeEvent('employees', 'deleted', { id });

            return res.status(200).json({ 
                success: true, 
                message: 'Employee deleted'
            });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('Employees API error:', error);
        return res.status(500).json({ 
            error: error.message || 'Internal server error',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}
```

---

## Remaining Endpoints to Migrate

1. **api/products.js** - ✅ Example above
2. **api/employees.js** - ✅ Example above
3. **api/stock-movements.js**
4. **api/stock-requests.js**
5. **api/attendance.js**
6. **api/leave.js**
7. **api/bonus.js**
8. **api/cash-requests.js**
9. **api/branches.js**
10. **api/users.js**
11. **api/notifications.js**
12. **api/appointments.js**

---

## Common Patterns

### Handling PostgreSQL Arrays

```javascript
// Saving
const branches = ['branch1', 'branch2'];
updateData.branches = `{${branches.join(',')}}`;

// Reading
if (employee.branches && typeof employee.branches === 'string') {
    employee.branches = employee.branches.replace(/[{}]/g, '').split(',').filter(Boolean);
}
```

### Handling JSONB Fields

```javascript
// Saving
updateData.leave_entitlements = JSON.stringify({ annual: 24, sick: 10 });

// Reading
if (data.leave_entitlements && typeof data.leave_entitlements === 'string') {
    try {
        data.leave_entitlements = JSON.parse(data.leave_entitlements);
    } catch (e) {
        data.leave_entitlements = {};
    }
}
```

### Adding Realtime Events

```javascript
// After insert
await publishRealtimeEvent('resource_name', 'created', newRecord);

// After update
await publishRealtimeEvent('resource_name', 'updated', updatedRecord);

// After delete
await publishRealtimeEvent('resource_name', 'deleted', { id });
```

---

## Testing Your Migrated Endpoints

1. **Test GET**
   ```bash
   curl https://your-api-url/api/products
   curl https://your-api-url/api/employees
   ```

2. **Test POST**
   ```bash
   curl -X POST https://your-api-url/api/products \
     -H "Content-Type: application/json" \
     -d '{"name":"Test Product","dp":10,"cp":15,"bv":5}'
   ```

3. **Test PUT**
   ```bash
   curl -X PUT https://your-api-url/api/products/PRD123 \
     -H "Content-Type: application/json" \
     -d '{"name":"Updated Product","dp":12}'
   ```

4. **Test DELETE**
   ```bash
   curl -X DELETE https://your-api-url/api/products/PRD123
   ```

---

**Last Updated:** 2024
