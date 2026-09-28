require('dotenv').config();
const bcrypt = require('bcryptjs');

const seedPassword = process.env.SEED_PASSWORD;

if (!seedPassword || !seedPassword.trim()) {
  console.error('[SEED] Thieu bien moi truong SEED_PASSWORD. Vui long cau hinh trong server/.env truoc khi chay seed.');
  process.exit(1);
}

const { poolPromise, sql } = require('./src/config/db');

async function seedUsers() {
  try {
    const pool = await poolPromise;

    const usersToSeed = [
      {
        tenDangNhap: 'admin',
        hoTen: 'Quản trị viên hệ thống',
        email: 'admin@qlsuckhoe.vn',
        soDienThoai: '0901234567',
        vaiTroId: 1, // QuanTriVien
        trangThai: 'HoatDong'
      },
      {
        tenDangNhap: 'doctor01',
        hoTen: 'BS. Trần Thị Minh',
        email: 'bstranthiminh@qlsuckhoe.vn',
        soDienThoai: '0912345678',
        vaiTroId: 2, // BacSi
        trangThai: 'HoatDong'
      },
      {
        tenDangNhap: 'nurse01',
        hoTen: 'Lê Thị Hoa',
        email: 'lethihoa@qlsuckhoe.vn',
        soDienThoai: '0923456789',
        vaiTroId: 2, // BacSi / Nhan vien y te
        trangThai: 'HoatDong'
      },
      {
        tenDangNhap: 'caregiver01',
        hoTen: 'Phạm Văn Đức',
        email: 'phamvanduc@qlsuckhoe.vn',
        soDienThoai: '0934567890',
        vaiTroId: 3, // NguoiChamSoc
        trangThai: 'HoatDong'
      }
    ];

    for (const u of usersToSeed) {
      const check = await pool.request()
        .input('tenDangNhap', sql.NVarChar, u.tenDangNhap)
        .query('SELECT UserID FROM NguoiDung WHERE TenDangNhap = @tenDangNhap');

      if (check.recordset.length === 0) {
        const hash = await bcrypt.hash(seedPassword, 10);
        await pool.request()
          .input('tenDangNhap', sql.VarChar, u.tenDangNhap)
          .input('matKhauHash', sql.VarChar, hash)
          .input('hoTen', sql.NVarChar, u.hoTen)
          .input('email', sql.VarChar, u.email)
          .input('soDienThoai', sql.VarChar, u.soDienThoai)
          .input('vaiTroId', sql.Int, u.vaiTroId)
          .input('trangThai', sql.NVarChar, u.trangThai)
          .query(`
            INSERT INTO NguoiDung (TenDangNhap, MatKhauHash, HoTen, Email, SoDienThoai, VaiTroID, TrangThai, NgayTao)
            VALUES (@tenDangNhap, @matKhauHash, @hoTen, @email, @soDienThoai, @vaiTroId, @trangThai, SYSDATETIME())
          `);
        console.log(`[SEED] Da tao tai khoan: ${u.tenDangNhap}`);
      } else {
        console.log(`[SEED] Tai khoan ${u.tenDangNhap} da ton tai.`);
      }
    }

    console.log('[SEED] Hoan tat khoi tao tai khoan!');
  } catch (err) {
    console.error('[SEED] Loi:', err);
    process.exitCode = 1;
  } finally {
    process.exit(process.exitCode || 0);
  }
}

seedUsers();
