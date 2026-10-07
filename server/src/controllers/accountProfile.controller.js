const { linkProfile, LinkingError } = require('../services/account-profile.service');
const { ok, fail } = require('../utils/response');

const handler = (kind, createAccount) => async (req, res, next) => {
  try {
    const data = await linkProfile(kind, req.params.id, req.body, createAccount);
    return ok(res, data, createAccount ? 'Da tao tai khoan va lien ket ho so' : 'Da lien ket tai khoan voi ho so', createAccount ? 201 : 200);
  } catch (error) {
    if (error instanceof LinkingError) return fail(res, error.message, error.errorCode, error.statusCode);
    next(error);
  }
};

module.exports = {
  linkElderly: handler('elderly', false),
  createElderlyUser: handler('elderly', true),
  linkCaregiver: handler('caregiver', false),
  createCaregiverUser: handler('caregiver', true),
};
