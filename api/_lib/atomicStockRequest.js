import { withRequestTransaction } from '../db.js';

// Legacy handlers may use both pool helpers and withTransaction. Keep all of
// those writes on one connection and send the response only after commit.
export function atomicStockRequest(handler, methods = ['POST', 'PUT', 'PATCH', 'DELETE']) {
  return async function atomicHandler(req, res) {
    if (!methods.includes(req.method)) return handler(req, res);
    let status = 200;
    let payload;
    let responseKind = 'json';
    const headers = [];
    const buffered = {
      setHeader(name, value) { headers.push([name, value]); },
      getHeader(name) { return res.getHeader?.(name); },
      status(code) { status = code; return this; },
      json(body) { payload = body; responseKind = 'json'; return this; },
      end(body) { payload = body; responseKind = 'end'; return this; },
      send(body) { payload = body; responseKind = 'send'; return this; },
    };
    try {
      await withRequestTransaction(async () => {
        await handler(req, buffered);
        if (status >= 400) {
          const rejection = new Error('Stock operation rejected');
          rejection.bufferedResponse = true;
          throw rejection;
        }
      });
    } catch (error) {
      if (!error.bufferedResponse) {
        console.error('[atomic-stock] Operation rolled back:', error.message);
        status = error.statusCode || 500;
        payload = { success: false, error: status === 500 ? 'Stock operation failed; no changes were saved.' : error.message };
        responseKind = 'json';
      }
    }
    for (const [name, value] of headers) res.setHeader(name, value);
    const target = res.status(status);
    return target[responseKind](payload);
  };
}
