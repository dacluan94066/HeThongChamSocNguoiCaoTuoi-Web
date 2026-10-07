const bcrypt = require('bcryptjs');
const { poolPromise, sql } = require('../config/db');

// Identifiers are fixed here, never supplied by clients.
const profiles = {
  elderly: { table: 'HoSoNguoiCaoTuoi', id: 'NguoiCaoTuoiID', role: 'NguoiCaoTuoi', email: 'NULL' },
  caregiver: { table: 'NguoiChamSoc', id: 'NguoiChamSocID', role: 'NguoiChamSoc', email: 'Email' },
};

class LinkingError extends Error {
  constructor(message, errorCode, statusCode) {
    super(message);
    Object.assign(this, { errorCode, statusCode });
  }
}
const reject = (message, code, status = 409) => { throw new LinkingError(message, code, status); };
const validId = (value) => (typeof value === 'number' || typeof value === 'string')
  && /^[1-9]\d*$/.test(String(value)) && Number(value) <= 2147483647;

async function linkProfile(kind, profileId, body, createAccount = false) {
  const config = profiles[kind];
  if (!config || !validId(profileId)) reject('ID ho so khong hop le', 'INVALID_PROFILE_ID', 400);
  const allowed = createAccount ? ['username', 'password', 'email', 'soDienThoai'] : ['userId'];
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some(key => !allowed.includes(key))) {
    reject('Du lieu yeu cau khong hop le', 'INVALID_FIELDS', 400);
  }
  if (!createAccount && !validId(body.userId)) reject('userId khong hop le', 'INVALID_USER_ID', 400);
  if (createAccount) {
    if (typeof body.username !== 'string' || body.username.trim().length < 3
      || body.username.trim().length > 50 || !/^[A-Za-z0-9_.-]+$/.test(body.username.trim())
      || typeof body.password !== 'string' || body.password.length < 6 || body.password.length > 72) {
      reject('Ten dang nhap 3-50 ky tu (chu, so, _, ., -); mat khau 6-72 ky tu', 'INVALID_CREDENTIALS', 400);
    }
    for (const [key, max] of [['email', 100], ['soDienThoai', 15]]) {
      if (body[key] != null && (typeof body[key] !== 'string' || body[key].trim().length > max)) {
        reject('Thong tin lien he khong hop le', 'INVALID_CONTACT', 400);
      }
    }
  }
  const hash = createAccount ? await bcrypt.hash(body.password, 10) : null;
  const transaction = new sql.Transaction(await poolPromise);
  let begun = false;
  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    begun = true;
    const request = () => new sql.Request(transaction);
    let userId = Number(body.userId);
    if (!createAccount) {
      // Serialize all links for this account, including across the two tables.
      const users = await request().input('userId', sql.Int, userId).query(`
        SELECT u.UserID, u.TrangThai, v.TenVaiTro
        FROM NguoiDung u WITH (UPDLOCK, HOLDLOCK)
        JOIN VaiTro v ON v.VaiTroID=u.VaiTroID WHERE u.UserID=@userId
      `);
      const user = users.recordset[0];
      if (!user) reject('Khong tim thay tai khoan', 'USER_NOT_FOUND', 404);
      if (user.TenVaiTro !== config.role) reject('Vai tro tai khoan khong phu hop voi ho so', 'ROLE_MISMATCH');
      if (user.TrangThai !== 'HoatDong') reject('Tai khoan phai dang hoat dong', 'USER_INACTIVE');
    }
    const rows = await request().input('profileId', sql.Int, Number(profileId)).query(`
      SELECT UserID, HoTen, SoDienThoai, ${config.email} AS Email
      FROM ${config.table} WITH (UPDLOCK, HOLDLOCK) WHERE ${config.id}=@profileId
    `);
    const profile = rows.recordset[0];
    if (!profile) reject('Khong tim thay ho so', 'PROFILE_NOT_FOUND', 404);
    if (profile.UserID != null) reject('Ho so da lien ket tai khoan', 'PROFILE_ALREADY_LINKED');
    if (createAccount) {
      const role = await request().input('role', sql.NVarChar, config.role)
        .query('SELECT VaiTroID FROM VaiTro WHERE TenVaiTro=@role');
      if (!role.recordset.length) reject('Khong tim thay vai tro ho so', 'ROLE_NOT_FOUND', 500);
      const inserted = await request()
        .input('username', sql.VarChar(50), body.username.trim())
        .input('hash', sql.VarChar(255), hash)
        .input('name', sql.NVarChar(100), profile.HoTen)
        .input('email', sql.VarChar(100), body.email === undefined ? profile.Email : body.email?.trim() || null)
        .input('phone', sql.VarChar(15), body.soDienThoai === undefined ? profile.SoDienThoai : body.soDienThoai?.trim() || null)
        .input('roleId', sql.Int, role.recordset[0].VaiTroID)
        .query(`INSERT INTO NguoiDung (TenDangNhap,MatKhauHash,HoTen,Email,SoDienThoai,VaiTroID,TrangThai)
          OUTPUT INSERTED.UserID AS userId
          VALUES (@username,@hash,@name,@email,@phone,@roleId,N'HoatDong')`);
      userId = inserted.recordset[0].userId;
    } else {
      for (const [type, other] of Object.entries(profiles)) {
        const linked = await request().input('userId', sql.Int, userId).query(`
          SELECT ${other.id} FROM ${other.table} WITH (UPDLOCK, HOLDLOCK) WHERE UserID=@userId
        `);
        if (linked.recordset.length) {
          reject('Tai khoan da lien ket ho so', type === kind ? 'USER_ALREADY_LINKED' : 'USER_LINKED_OTHER_PROFILE');
        }
      }
    }
    const updated = await request().input('userId', sql.Int, userId)
      .input('profileId', sql.Int, Number(profileId)).query(`
        UPDATE ${config.table} SET UserID=@userId
        OUTPUT INSERTED.${config.id} AS profileId
        WHERE ${config.id}=@profileId AND UserID IS NULL
      `);
    if (!updated.recordset.length) reject('Ho so da duoc lien ket boi yeu cau khac', 'PROFILE_ALREADY_LINKED');
    await transaction.commit();
    begun = false;
    return { profileId: Number(profileId), userId, tenVaiTro: config.role };
  } catch (error) {
    if (begun) {
      try { await transaction.rollback(); } catch (_) { /* SQL may already have rolled back. */ }
    }
    const number = error.number ?? error.originalError?.info?.number;
    if ([2601, 2627].includes(number)) reject('Ten dang nhap, email hoac lien ket da ton tai', 'ACCOUNT_PROFILE_CONFLICT');
    if (number === 1205) reject('Yeu cau dong thoi bi xung dot; vui long thu lai', 'LINK_CONCURRENT_CONFLICT');
    throw error;
  }
}

module.exports = { linkProfile, LinkingError };
