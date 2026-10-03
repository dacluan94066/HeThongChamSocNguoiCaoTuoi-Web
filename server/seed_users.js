require('dotenv').config();
const bcrypt = require('bcryptjs');
const { poolPromise, sql } = require('./src/config/db');

const seedPassword = process.env.SEED_PASSWORD;

if (!seedPassword || !seedPassword.trim()) {
  console.error('[SEED] Thiếu biến môi trường SEED_PASSWORD. Vui lòng cấu hình trong server/.env trước khi chạy seed.');
  process.exit(1);
}

const usersToSeed = [
  {
    tenDangNhap: 'admin',
    hoTen: 'Quản trị viên hệ thống',
    email: 'admin@qlsuckhoe.vn',
    soDienThoai: '0901234567',
    tenVaiTro: 'QuanTriVien',
  },
  {
    tenDangNhap: 'doctor01',
    hoTen: 'BS. Trần Thị Minh',
    email: 'bstranthiminh@qlsuckhoe.vn',
    soDienThoai: '0912345678',
    tenVaiTro: 'BacSi',
  },
  {
    tenDangNhap: 'nurse01',
    hoTen: 'Lê Thị Hoa',
    email: 'lethihoa@qlsuckhoe.vn',
    soDienThoai: '0923456789',
    tenVaiTro: 'BacSi',
  },
  {
    tenDangNhap: 'caregiver01',
    hoTen: 'Phạm Văn Đức',
    email: 'phamvanduc@qlsuckhoe.vn',
    soDienThoai: '0934567890',
    tenVaiTro: 'NguoiChamSoc',
  },
  {
    tenDangNhap: 'nct.an',
    hoTen: 'Nguyễn Văn An',
    email: 'nct.an@qlsuckhoe.vn',
    soDienThoai: '0908000101',
    tenVaiTro: 'NguoiCaoTuoi',
    cccdHoSo: '079047000101',
  },
  {
    tenDangNhap: 'nct.binh',
    hoTen: 'Trần Thị Bình',
    email: 'nct.binh@qlsuckhoe.vn',
    soDienThoai: '0908000102',
    tenVaiTro: 'NguoiCaoTuoi',
    cccdHoSo: '079052000102',
  },
  {
    tenDangNhap: 'nct.cuong',
    hoTen: 'Lê Văn Cường',
    email: 'nct.cuong@qlsuckhoe.vn',
    soDienThoai: '0908000103',
    tenVaiTro: 'NguoiCaoTuoi',
    cccdHoSo: '079044000103',
  },
  {
    tenDangNhap: 'nct.dung',
    hoTen: 'Phạm Thị Dung',
    email: 'nct.dung@qlsuckhoe.vn',
    soDienThoai: '0908000104',
    tenVaiTro: 'NguoiCaoTuoi',
    cccdHoSo: '079056000104',
  },
  {
    tenDangNhap: 'nct.duc',
    hoTen: 'Võ Minh Đức',
    email: 'nct.duc@qlsuckhoe.vn',
    soDienThoai: '0908000105',
    tenVaiTro: 'NguoiCaoTuoi',
    cccdHoSo: '079050000105',
  },
];

async function seedUsers() {
  let transaction;
  try {
    const pool = await poolPromise;
    const passwordHash = await bcrypt.hash(seedPassword.trim(), 10);

    const roleResult = await pool.request().query('SELECT VaiTroID, TenVaiTro FROM VaiTro');
    const roleIds = Object.fromEntries(
      roleResult.recordset.map((role) => [role.TenVaiTro, role.VaiTroID])
    );

    for (const roleName of ['QuanTriVien', 'BacSi', 'NguoiChamSoc', 'NguoiCaoTuoi']) {
      if (!roleIds[roleName]) {
        throw new Error(`Không tìm thấy vai trò ${roleName}. Hãy chạy file SQL database trước.`);
      }
    }

    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const messages = [];

    for (const user of usersToSeed) {
      const check = await new sql.Request(transaction)
        .input('tenDangNhap', sql.VarChar(50), user.tenDangNhap)
        .query('SELECT UserID FROM NguoiDung WHERE TenDangNhap = @tenDangNhap');

      let userId = check.recordset[0]?.UserID;
      if (!userId) {
        const inserted = await new sql.Request(transaction)
          .input('tenDangNhap', sql.VarChar(50), user.tenDangNhap)
          .input('matKhauHash', sql.VarChar(255), passwordHash)
          .input('hoTen', sql.NVarChar(100), user.hoTen)
          .input('email', sql.VarChar(100), user.email)
          .input('soDienThoai', sql.VarChar(15), user.soDienThoai)
          .input('vaiTroId', sql.Int, roleIds[user.tenVaiTro])
          .query(`
            INSERT INTO NguoiDung
              (TenDangNhap, MatKhauHash, HoTen, Email, SoDienThoai, VaiTroID, TrangThai, NgayTao)
            OUTPUT INSERTED.UserID
            VALUES
              (@tenDangNhap, @matKhauHash, @hoTen, @email, @soDienThoai, @vaiTroId, N'HoatDong', SYSDATETIME())
          `);
        userId = inserted.recordset[0].UserID;
        messages.push(`[SEED] Đã tạo tài khoản: ${user.tenDangNhap}`);
      } else {
        messages.push(`[SEED] Tài khoản ${user.tenDangNhap} đã tồn tại, giữ nguyên mật khẩu.`);
      }

      if (user.cccdHoSo) {
        const profile = await new sql.Request(transaction)
          .input('cccd', sql.VarChar(20), user.cccdHoSo)
          .query('SELECT NguoiCaoTuoiID, UserID FROM HoSoNguoiCaoTuoi WHERE CCCD = @cccd');

        if (!profile.recordset.length) {
          messages.push(`[SEED] Chưa có hồ sơ CCCD ${user.cccdHoSo}; hãy chạy DU_LIEU_MAU_DAY_DU.sql rồi chạy lại seed.`);
        } else {
          const linkedUserId = profile.recordset[0].UserID;
          if (linkedUserId && linkedUserId !== userId) {
            throw new Error(`Hồ sơ ${user.hoTen} đang liên kết với một tài khoản khác.`);
          }

          await new sql.Request(transaction)
            .input('userId', sql.Int, userId)
            .input('cccd', sql.VarChar(20), user.cccdHoSo)
            .query('UPDATE HoSoNguoiCaoTuoi SET UserID = @userId WHERE CCCD = @cccd AND (UserID IS NULL OR UserID = @userId)');
          messages.push(`[SEED] Đã liên kết ${user.tenDangNhap} với hồ sơ ${user.hoTen}.`);
        }
      }
    }

    const caregiverUser = usersToSeed.find((user) => user.tenDangNhap === 'caregiver01');
    const caregiverIdResult = await new sql.Request(transaction)
      .input('tenDangNhap', sql.VarChar(50), caregiverUser.tenDangNhap)
      .query('SELECT UserID FROM NguoiDung WHERE TenDangNhap = @tenDangNhap');
    const caregiverUserId = caregiverIdResult.recordset[0]?.UserID;
    if (caregiverUserId) {
      await new sql.Request(transaction)
        .input('userId', sql.Int, caregiverUserId)
        .input('soDienThoai', sql.VarChar(15), caregiverUser.soDienThoai)
        .query(`
          UPDATE NguoiChamSoc
          SET UserID = @userId
          WHERE SoDienThoai = @soDienThoai AND (UserID IS NULL OR UserID = @userId)
        `);
    }

    await transaction.commit();
    transaction = null;
    messages.forEach((message) => console.log(message));
    console.log(`[SEED] Hoàn tất: ${usersToSeed.length} tài khoản được kiểm tra, gồm 5 tài khoản người cao tuổi.`);
  } catch (error) {
    if (transaction) {
      try { await transaction.rollback(); } catch { /* transaction đã tự rollback */ }
    }
    console.error('[SEED] Lỗi:', error.message || error);
    process.exitCode = 1;
  } finally {
    process.exit(process.exitCode || 0);
  }
}

seedUsers();
