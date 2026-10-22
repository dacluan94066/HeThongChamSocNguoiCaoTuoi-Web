require('dotenv').config();
const { poolPromise, sql } = require('./src/config/db');

const actions = (xem = 0, them = 0, sua = 0, xoa = 0) => ({ xem, them, sua, xoa });
const caregiver = {
  QLNGUOIDUNG: actions(),
  QLHOSONCT: actions(1, 0, 1),
  QLNGUOICHAMSOC: actions(1),
  QLTHUOC: actions(1, 1, 1),
  QLLICHUONGTHUOC: actions(1, 1, 1),
  QLLICHKHAM: actions(1, 1, 1),
  QLCHISOSK: actions(1, 1, 1),
  QLCANHBAO: actions(1, 1, 1),
  QLLIENHEKC: actions(1, 1, 1, 1),
  QLNHATKY: actions(1, 1, 1, 1),
  QLBAOCAO: actions(1),
};
const elderly = {
  QLNGUOIDUNG: actions(),
  QLHOSONCT: actions(1, 0, 1),
  QLNGUOICHAMSOC: actions(1),
  QLTHUOC: actions(1),
  QLLICHUONGTHUOC: actions(1, 0, 1),
  QLLICHKHAM: actions(1),
  QLCHISOSK: actions(1, 1),
  QLCANHBAO: actions(1, 1),
  QLLIENHEKC: actions(1),
  QLNHATKY: actions(1),
  QLBAOCAO: actions(),
};

async function seedPhanQuyen() {
  let transaction;
  try {
    const pool = await poolPromise;
    const roles = (await pool.request().query('SELECT VaiTroID, TenVaiTro FROM VaiTro')).recordset;
    const functions = (await pool.request().query('SELECT ChucNangID, MaChucNang FROM ChucNang')).recordset;
    const roleIds = Object.fromEntries(roles.map((role) => [role.TenVaiTro, role.VaiTroID]));
    for (const name of ['QuanTriVien', 'NguoiChamSoc', 'NguoiCaoTuoi']) {
      if (!roleIds[name]) throw new Error(`Thieu vai tro ${name}`);
    }

    transaction = new sql.Transaction(pool);
    await transaction.begin();
    await new sql.Request(transaction).query('DELETE FROM PhanQuyen');
    for (const feature of functions) {
      for (const [roleName, permissions] of [
        ['QuanTriVien', actions(1, 1, 1, 1)],
        ['NguoiChamSoc', caregiver[feature.MaChucNang] || actions()],
        ['NguoiCaoTuoi', elderly[feature.MaChucNang] || actions()],
      ]) {
        await new sql.Request(transaction)
          .input('vaiTroId', sql.Int, roleIds[roleName])
          .input('chucNangId', sql.Int, feature.ChucNangID)
          .input('xem', sql.Bit, permissions.xem)
          .input('them', sql.Bit, permissions.them)
          .input('sua', sql.Bit, permissions.sua)
          .input('xoa', sql.Bit, permissions.xoa)
          .query(`INSERT INTO PhanQuyen
            (VaiTroID, ChucNangID, ChoPhepXem, ChoPhepThem, ChoPhepSua, ChoPhepXoa)
            VALUES (@vaiTroId, @chucNangId, @xem, @them, @sua, @xoa)`);
      }
    }
    await transaction.commit();
    transaction = null;
    console.log(`[SEED] Da cap ${functions.length * 3} dong phan quyen cho 3 vai tro.`);
  } catch (error) {
    if (transaction) await transaction.rollback().catch(() => {});
    console.error('[SEED] Loi:', error);
    process.exitCode = 1;
  } finally {
    const pool = await poolPromise;
    await pool.close();
  }
}

seedPhanQuyen();
