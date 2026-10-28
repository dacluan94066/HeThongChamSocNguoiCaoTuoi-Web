const { poolPromise, sql } = require('../config/db');
const { ok, fail } = require('../utils/response');
const { RelativeError } = require('../utils/relativeValidation');
const { createOwnRelativesReader } = require('../services/ownRelatives.service');

exports.getMine = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    return ok(res, await createOwnRelativesReader({ poolPromise, sql })(req.user, req.query));
  } catch (error) {
    if (error instanceof RelativeError) return fail(res, error.message, error.code, error.status);
    return fail(res, 'Không thể tải danh sách Người thân. Vui lòng thử lại.', 'OWN_RELATIVES_UNAVAILABLE', 503);
  }
};
