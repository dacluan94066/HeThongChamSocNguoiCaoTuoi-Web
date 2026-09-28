// utils/response.js - Ham tien ich tra ve JSON theo dinh dang chuan

/**
 * Tra ve ket qua thanh cong
 * @param {object} res - Express response object
 * @param {any} data - Du lieu tra ve
 * @param {string} message - Thong bao thanh cong
 * @param {number} statusCode - HTTP status code (mac dinh 200)
 */
const ok = (res, data = null, message = 'Thanh cong', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

/**
 * Tra ve ket qua that bai / loi
 * @param {object} res - Express response object
 * @param {string} message - Thong bao loi
 * @param {string} errorCode - Ma loi noi bo (de frontend xu ly)
 * @param {number} statusCode - HTTP status code (mac dinh 400)
 */
const fail = (res, message = 'Co loi xay ra', errorCode = 'ERROR', statusCode = 400) => {
  return res.status(statusCode).json({
    success: false,
    message,
    errorCode,
  });
};

module.exports = { ok, fail };
