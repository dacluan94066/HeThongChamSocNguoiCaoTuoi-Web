// mssql Request has cancel(), but assigning request.timeout does not set a timeout.
async function boundedQuery(request, statement, deadline = Date.now() + 10000) {
  const remaining = Math.min(10000, deadline - Date.now());
  if (remaining <= 0) throw new Error('DATA_TIMEOUT');
  let timer;
  try {
    return await Promise.race([
      request.query(statement),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          try { request.cancel?.(); } catch (_) { /* cancellation is best effort */ }
          reject(new Error('DATA_TIMEOUT'));
        }, remaining);
      }),
    ]);
  } finally { clearTimeout(timer); }
}
module.exports = { boundedQuery };
