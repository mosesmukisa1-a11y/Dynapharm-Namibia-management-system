// Inventory Reporting Module (Browser-compatible)
// Provides inventory summaries for MIS, Finance, GM, and Stock portals

// Fallback implementations for standalone use
function safeGetLocalStorage(key, defaultValue = []) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : defaultValue;
    } catch (e) {
        return defaultValue;
    }
}

/**
 * Get comprehensive inventory summary for a branch or all branches
 */
function getInventorySummary(filters = {}) {
    try {
        const branches = safeGetLocalStorage('dyna_branches', []);
        const warehouseStock = safeGetLocalStorage('dyna_warehouse_stock', {});
        const branchStock = safeGetLocalStorage('dyna_branch_stock', {});
        const barcodeStock = safeGetLocalStorage('dyna_barcode_stock', []);
        const stockRequests = safeGetLocalStorage('dyna_stock_requests', []);
        const stockTransfers = safeGetLocalStorage('dyna_stock_transfers', []);
        
        const { branchId, warehouseId } = filters;
        
        // Summary structure
        const summary = {
            timestamp: new Date().toISOString(),
            branchId: branchId || 'all',
            warehouseId: warehouseId || 'all',
            totals: {
                totalProducts: 0,
                totalValue: 0,
                totalQuantity: 0,
                lowStockItems: 0,
                criticalStockItems: 0,
                expiringSoon: 0
            },
            warehouses: {},
            branches: {},
            pendingRequests: 0,
            pendingTransfers: 0,
            alerts: []
        };
        
        // Warehouse stock analysis
        if (warehouseId && warehouseStock[warehouseId]) {
            const whStock = warehouseStock[warehouseId];
            summary.warehouses[warehouseId] = analyzeWarehouseStock(whStock);
        } else if (!warehouseId) {
            Object.keys(warehouseStock).forEach(wh => {
                summary.warehouses[wh] = analyzeWarehouseStock(warehouseStock[wh]);
            });
        }
        
        // Branch stock analysis
        if (branchId && branchStock[branchId]) {
            const brStock = branchStock[branchId];
            summary.branches[branchId] = analyzeBranchStock(brStock);
        } else if (!branchId) {
            Object.keys(branchStock).forEach(br => {
                summary.branches[br] = analyzeBranchStock(branchStock[br]);
            });
        }
        
        // Pending requests and transfers
        summary.pendingRequests = stockRequests.filter(r => 
            ['pending', 'pending_warehouse', 'pending_gm'].includes(r.status)
        ).length;
        
        summary.pendingTransfers = stockTransfers.filter(t => 
            ['pending', 'dispatched', 'delivered'].includes(t.status)
        ).length;
        
        // Barcode stock expiring soon (30 days)
        const now = new Date();
        const thirtyDaysFromNow = new Date(now);
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        
        barcodeStock.forEach(batch => {
            if (batch.expiryDate) {
                const expiryDate = new Date(batch.expiryDate + '-01');
                if (expiryDate <= thirtyDaysFromNow && expiryDate > now) {
                    summary.totals.expiringSoon++;
                    summary.alerts.push({
                        type: 'warning',
                        message: `${batch.description} expiring ${batch.expiryDate}`,
                        batchNo: batch.batchNo,
                        expiryDate: batch.expiryDate
                    });
                }
            }
        });
        
        // Aggregate totals
        Object.values(summary.branches).forEach(branch => {
            summary.totals.totalProducts += branch.totalProducts || 0;
            summary.totals.totalQuantity += branch.totalQuantity || 0;
            summary.totals.lowStockItems += branch.lowStockItems || 0;
        });
        
        Object.values(summary.warehouses).forEach(warehouse => {
            summary.totals.totalProducts += warehouse.totalProducts || 0;
            summary.totals.totalQuantity += warehouse.totalQuantity || 0;
            summary.totals.lowStockItems += warehouse.lowStockItems || 0;
        });
        
        return { success: true, data: summary };
    } catch (error) {
        console.error('Error generating inventory summary:', error);
        return { success: false, error: error.message };
    }
}

function analyzeWarehouseStock(warehouseData) {
    const analysis = {
        totalProducts: 0,
        totalQuantity: 0,
        totalValue: 0,
        lowStockItems: 0,
        criticalStockItems: 0,
        products: []
    };
    
    if (!warehouseData || typeof warehouseData !== 'object') return analysis;
    
    Object.keys(warehouseData).forEach(productId => {
        const product = warehouseData[productId];
        const qty = Number(product.quantity || 0);
        const reorderLevel = Number(product.reorderLevel || 5);
        
        analysis.totalProducts++;
        analysis.totalQuantity += qty;
        
        // Estimate value (would need price lookup in production)
        analysis.totalValue += qty * (Number(product.unitCost) || 0);
        
        if (qty <= reorderLevel) {
            analysis.lowStockItems++;
        }
        if (qty <= Math.max(1, Math.floor(reorderLevel / 2))) {
            analysis.criticalStockItems++;
        }
        
        analysis.products.push({
            id: productId,
            quantity: qty,
            reorderLevel: reorderLevel,
            status: qty <= reorderLevel ? 'low' : 'ok',
            reserved: product.reservedQuantity || 0
        });
    });
    
    return analysis;
}

function analyzeBranchStock(branchData) {
    const analysis = {
        totalProducts: 0,
        totalQuantity: 0,
        lowStockItems: 0,
        products: []
    };
    
    if (!branchData || typeof branchData !== 'object') return analysis;
    
    Object.keys(branchData).forEach(productId => {
        const qty = Number(branchData[productId] || 0);
        
        analysis.totalProducts++;
        analysis.totalQuantity += qty;
        
        if (qty <= 5) { // Low stock threshold for branches
            analysis.lowStockItems++;
        }
        
        analysis.products.push({
            id: productId,
            quantity: qty,
            status: qty <= 5 ? 'low' : 'ok'
        });
    });
    
    return analysis;
}

/**
 * Get inventory movement report for a date range
 */
function getInventoryMovementReport(filters = {}) {
    try {
        const { fromDate, toDate, branchId, warehouseId } = filters;
        const stockRequests = safeGetLocalStorage('dyna_stock_requests', []);
        const stockTransfers = safeGetLocalStorage('dyna_stock_transfers', []);
        
        const from = fromDate ? new Date(fromDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const to = toDate ? new Date(toDate) : new Date();
        
        const movements = [];
        
        // Process stock requests
        stockRequests.forEach(req => {
            const reqDate = new Date(req.createdAt);
            if (reqDate >= from && reqDate <= to) {
                if (!branchId || req.requestingBranch === branchId) {
                    movements.push({
                        type: 'REQUEST',
                        id: req.requestNumber,
                        branch: req.requestingBranch,
                        status: req.status,
                        date: req.createdAt,
                        items: req.items || []
                    });
                }
            }
        });
        
        // Process stock transfers
        stockTransfers.forEach(transfer => {
            const transferDate = new Date(transfer.createdAt);
            if (transferDate >= from && transferDate <= to) {
                if (!branchId || transfer.toBranch === branchId || 
                    !warehouseId || transfer.fromWarehouse === warehouseId) {
                    movements.push({
                        type: 'TRANSFER',
                        id: transfer.requestNumber,
                        from: transfer.fromWarehouse,
                        to: transfer.toBranch,
                        status: transfer.status,
                        date: transfer.createdAt,
                        items: transfer.items || []
                    });
                }
            }
        });
        
        movements.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        return { success: true, data: movements, total: movements.length };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Get cost analysis for Finance portal
 */
function getInventoryCostAnalysis(filters = {}) {
    try {
        const { branchId } = filters;
        const warehouseStock = safeGetLocalStorage('dyna_warehouse_stock', {});
        const barcodeStock = safeGetLocalStorage('dyna_barcode_stock', []);
        
        const costAnalysis = {
            totalInventoryValue: 0,
            warehouseValues: {},
            branchValues: {},
            byProduct: {},
            depreciation: 0,
            obsolescence: 0
        };
        
        // Analyze warehouse values
        Object.keys(warehouseStock).forEach(whId => {
            const whStock = warehouseStock[whId];
            let whValue = 0;
            
            Object.keys(whStock).forEach(productId => {
                const product = whStock[productId];
                const qty = Number(product.quantity || 0);
                const cost = Number(product.unitCost || 0);
                const value = qty * cost;
                
                whValue += value;
                
                if (!costAnalysis.byProduct[productId]) {
                    costAnalysis.byProduct[productId] = {
                        productId,
                        totalQuantity: 0,
                        totalValue: 0,
                        locations: []
                    };
                }
                
                costAnalysis.byProduct[productId].totalQuantity += qty;
                costAnalysis.byProduct[productId].totalValue += value;
                costAnalysis.byProduct[productId].locations.push({
                    location: whId,
                    quantity: qty,
                    value: value
                });
            });
            
            costAnalysis.warehouseValues[whId] = whValue;
            costAnalysis.totalInventoryValue += whValue;
        });
        
        // Check for expired or expiring stock (obsolescence risk)
        const now = new Date();
        const thirtyDaysFromNow = new Date(now);
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        
        barcodeStock.forEach(batch => {
            if (batch.expiryDate) {
                const expiryDate = new Date(batch.expiryDate + '-01');
                if (expiryDate < now) {
                    costAnalysis.obsolescence += Number(batch.remainingQuantity || 0);
                } else if (expiryDate <= thirtyDaysFromNow) {
                    costAnalysis.depreciation += Number(batch.remainingQuantity || 0);
                }
            }
        });
        
        return { success: true, data: costAnalysis };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Functions are globally available when this script is loaded

