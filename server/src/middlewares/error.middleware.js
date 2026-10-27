// middlewares/error.middleware.js - Bat va xu ly loi tap trung toan app
const { fail } = require('../utils/response');

// eslint-disable-next-line no-unused-vars
const errorMiddleware = (err, req, res, next) => {
  // JSON parser/other unexpected errors may embed request content in message/stack.
  // Redact assistant errors before the general logger and response below.
  const privatePath=(req.originalUrl || req.path || '').split('?')[0];
  if (/^\/api\/(?:care-assistant|relatives|auth\/google)(?:\/|$)/i.test(privatePath)) {
    const tooLarge = err.type === 'entity.too.large';
    const invalidJson = err.type === 'entity.parse.failed';
    if (privatePath.startsWith('/api/auth/google')) return fail(res, tooLarge ? 'Yêu cầu quá lớn.' : invalidJson
      ? 'JSON không hợp lệ.' : 'Chưa xử lý được xác thực Google. Vui lòng thử lại sau.',
    tooLarge ? 'PAYLOAD_TOO_LARGE' : invalidJson ? 'INVALID_JSON' : 'GOOGLE_AUTH_UNAVAILABLE', tooLarge ? 413 : invalidJson ? 400 : 503);
    return fail(res, tooLarge ? 'Yêu cầu quá lớn.' : invalidJson
      ? 'JSON không hợp lệ.' : privatePath.startsWith('/api/relatives')
        ? 'Không xử lý được yêu cầu Người thân. Vui lòng thử lại.' : 'Không xử lý được yêu cầu trợ lý. Vui lòng thử lại.',
      tooLarge ? 'PAYLOAD_TOO_LARGE' : invalidJson ? 'INVALID_JSON' : 'DATA_UNAVAILABLE',
      tooLarge ? 413 : invalidJson ? 400 : 503);
  }
  // Log loi ra console de debug
  console.error('[ERROR]', err.message);
  console.error(err.stack);

  // Loi tu mssql (database)
  if (err.code === 'EREQUEST' || err.code === 'ECONNREFUSED') {
    return fail(res, 'Loi co so du lieu, vui long thu lai sau', 'DB_ERROR', 500);
  }

  // Loi mac dinh - tra 500
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Loi may chu noi bo';

  return fail(res, message, 'SERVER_ERROR', statusCode);
};

module.exports = errorMiddleware;
