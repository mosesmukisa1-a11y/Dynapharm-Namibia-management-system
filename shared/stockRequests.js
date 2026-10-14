// Verified stock_requests workflow states. Transfer states are not request rows.
export const OPEN_STOCK_REQUEST_STATUSES = ['pending','reviewed','approved','partially_dispatched','dispatched','in_transit'];
export const isOpenStockRequest = request => OPEN_STOCK_REQUEST_STATUSES.includes(String(request.status || '').toLowerCase());
