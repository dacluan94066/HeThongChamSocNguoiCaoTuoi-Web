const { OAuth2Client } = require('google-auth-library');

class GoogleIdentityError extends Error {
  constructor(message, code, statusCode) {
    super(message);
    this.name = 'GoogleIdentityError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const createGoogleTokenVerifier = ({
  client = new OAuth2Client(),
  getAudience = () => process.env.GOOGLE_WEB_CLIENT_ID,
} = {}) => async (idToken) => {
  const audience = String(getAudience() || '').trim();
  if (!audience) {
    throw new GoogleIdentityError(
      'May chu chua cau hinh GOOGLE_WEB_CLIENT_ID',
      'GOOGLE_AUTH_NOT_CONFIGURED',
      503,
    );
  }
  if (typeof idToken !== 'string' || !idToken.trim() || idToken.length > 10000) {
    throw new GoogleIdentityError(
      'Google ID token khong hop le',
      'INVALID_GOOGLE_TOKEN',
      400,
    );
  }

  let ticket;
  try {
    ticket = await client.verifyIdToken({
      idToken: idToken.trim(),
      audience,
    });
  } catch (_) {
    throw new GoogleIdentityError(
      'Khong the xac minh tai khoan Google',
      'INVALID_GOOGLE_TOKEN',
      401,
    );
  }

  const payload = ticket.getPayload?.();
  const subject = String(payload?.sub || '').trim();
  const email = String(payload?.email || '').trim().toLowerCase();
  if (!subject || !email || payload?.email_verified !== true) {
    throw new GoogleIdentityError(
      'Tai khoan Google chua co email da xac minh',
      'GOOGLE_EMAIL_NOT_VERIFIED',
      401,
    );
  }

  return {
    subject,
    email,
    displayName: String(payload?.name || '').trim(),
    photoUrl: String(payload?.picture || '').trim() || null,
  };
};

const verifyGoogleIdToken = createGoogleTokenVerifier();

module.exports = {
  GoogleIdentityError,
  createGoogleTokenVerifier,
  verifyGoogleIdToken,
};
