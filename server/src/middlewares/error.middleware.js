// middlewares/error.middleware.js - Bat va xu ly loi tap trung toan app
const { fail } = require('../utils/response');

// eslint-disable-next-line no-unused-vars
const errorMiddleware = (err, req, res, next) => {
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
