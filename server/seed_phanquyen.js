require('dotenv').config();
const { poolPromise, sql } = require('./src/config/db');

async function seedPhanQuyen() {
  try {
    const pool = await poolPromise;

    console.log('[SEED] Bat dau khoi tao bang PhanQuyen...');

    // Lay danh sach tat ca ChucNang
    const cnResult = await pool.query('SELECT ChucNangID, MaChucNang FROM ChucNang');
    const chucNangs = cnResult.recordset;

    // Xoa sach PhanQuyen cu neu co de seed chuan
    await pool.query('DELETE FROM PhanQuyen');

    // 1. QuanTriVien (VaiTroID = 1): Full quyen
    for (const cn of chucNangs) {
      await pool.request()
        .input('vaiTroId', sql.Int, 1)
        .input('chucNangId', sql.Int, cn.ChucNangID)
        .input('xem', sql.Bit, 1)
        .input('them', sql.Bit, 1)
        .input('sua', sql.Bit, 1)
        .input('xoa', sql.Bit, 1)
        .query(`
          INSERT INTO PhanQuyen (VaiTroID, ChucNangID, ChoPhepXem, ChoPhepThem, ChoPhepSua, ChoPhepXoa)
          VALUES (@vaiTroId, @chucNangId, @xem, @them, @sua, @xoa)
        `);
    }
    console.log('[SEED] Da cap quyen cho QuanTriVien (VaiTroID = 1)');

    // 2. BacSi (VaiTroID = 2)
    // Co quyen xem/them/sua tren HoSo, Thuoc, LichUongThuoc, LichKham, ChiSo, CanhBao, NhatKy, BaoCao
    const bacSiPerms = {
      QLNGUOIDUNG:     { xem: 0, them: 0, sua: 0, xoa: 0 },
      QLHOSONCT:       { xem: 1, them: 1, sua: 1, xoa: 0 },
      QLNGUOICHAMSOC:  { xem: 1, them: 1, sua: 1, xoa: 0 },
      QLTHUOC:         { xem: 1, them: 1, sua: 1, xoa: 0 },
      QLLICHUONGTHUOC: { xem: 1, them: 1, sua: 1, xoa: 1 },
      QLLICHKHAM:      { xem: 1, them: 1, sua: 1, xoa: 1 },
      QLCHISOSK:       { xem: 1, them: 1, sua: 1, xoa: 0 },
      QLCANHBAO:       { xem: 1, them: 1, sua: 1, xoa: 0 },
      QLLIENHEKC:      { xem: 1, them: 1, sua: 1, xoa: 0 },
      QLNHATKY:        { xem: 1, them: 1, sua: 1, xoa: 0 },
      QLBAOCAO:        { xem: 1, them: 0, sua: 0, xoa: 0 },
    };

    for (const cn of chucNangs) {
      const p = bacSiPerms[cn.MaChucNang] || { xem: 1, them: 0, sua: 0, xoa: 0 };
      await pool.request()
        .input('vaiTroId', sql.Int, 2)
        .input('chucNangId', sql.Int, cn.ChucNangID)
        .input('xem', sql.Bit, p.xem)
        .input('them', sql.Bit, p.them)
        .input('sua', sql.Bit, p.sua)
        .input('xoa', sql.Bit, p.xoa)
        .query(`
          INSERT INTO PhanQuyen (VaiTroID, ChucNangID, ChoPhepXem, ChoPhepThem, ChoPhepSua, ChoPhepXoa)
          VALUES (@vaiTroId, @chucNangId, @xem, @them, @sua, @xoa)
        `);
    }
    console.log('[SEED] Da cap quyen cho BacSi (VaiTroID = 2)');

    // 3. NguoiChamSoc (VaiTroID = 3)
    const caregiverPerms = {
      QLNGUOIDUNG:     { xem: 0, them: 0, sua: 0, xoa: 0 },
      QLHOSONCT:       { xem: 1, them: 0, sua: 1, xoa: 0 },
      QLNGUOICHAMSOC:  { xem: 1, them: 0, sua: 0, xoa: 0 },
      QLTHUOC:         { xem: 1, them: 0, sua: 0, xoa: 0 },
      QLLICHUONGTHUOC: { xem: 1, them: 1, sua: 1, xoa: 0 },
      QLLICHKHAM:      { xem: 1, them: 1, sua: 1, xoa: 0 },
      QLCHISOSK:       { xem: 1, them: 1, sua: 1, xoa: 0 },
      QLCANHBAO:       { xem: 1, them: 1, sua: 1, xoa: 0 },
      QLLIENHEKC:      { xem: 1, them: 1, sua: 1, xoa: 0 },
      QLNHATKY:        { xem: 1, them: 1, sua: 1, xoa: 0 },
      QLBAOCAO:        { xem: 1, them: 0, sua: 0, xoa: 0 },
    };

    for (const cn of chucNangs) {
      const p = caregiverPerms[cn.MaChucNang] || { xem: 1, them: 0, sua: 0, xoa: 0 };
      await pool.request()
        .input('vaiTroId', sql.Int, 3)
        .input('chucNangId', sql.Int, cn.ChucNangID)
        .input('xem', sql.Bit, p.xem)
        .input('them', sql.Bit, p.them)
        .input('sua', sql.Bit, p.sua)
        .input('xoa', sql.Bit, p.xoa)
        .query(`
          INSERT INTO PhanQuyen (VaiTroID, ChucNangID, ChoPhepXem, ChoPhepThem, ChoPhepSua, ChoPhepXoa)
          VALUES (@vaiTroId, @chucNangId, @xem, @them, @sua, @xoa)
        `);
    }
    console.log('[SEED] Da cap quyen cho NguoiChamSoc (VaiTroID = 3)');

    // 4. NguoiCaoTuoi (VaiTroID = 4)
    const nctPerms = {
      QLNGUOIDUNG:     { xem: 0, them: 0, sua: 0, xoa: 0 },
      QLHOSONCT:       { xem: 1, them: 0, sua: 0, xoa: 0 },
      QLNGUOICHAMSOC:  { xem: 1, them: 0, sua: 0, xoa: 0 },
      QLTHUOC:         { xem: 1, them: 0, sua: 0, xoa: 0 },
      QLLICHUONGTHUOC: { xem: 1, them: 0, sua: 1, xoa: 0 },
      QLLICHKHAM:      { xem: 1, them: 0, sua: 0, xoa: 0 },
      QLCHISOSK:       { xem: 1, them: 1, sua: 0, xoa: 0 },
      QLCANHBAO:       { xem: 1, them: 1, sua: 0, xoa: 0 },
      QLLIENHEKC:      { xem: 1, them: 0, sua: 0, xoa: 0 },
      QLNHATKY:        { xem: 1, them: 0, sua: 0, xoa: 0 },
      QLBAOCAO:        { xem: 0, them: 0, sua: 0, xoa: 0 },
    };

    for (const cn of chucNangs) {
      const p = nctPerms[cn.MaChucNang] || { xem: 0, them: 0, sua: 0, xoa: 0 };
      await pool.request()
        .input('vaiTroId', sql.Int, 4)
        .input('chucNangId', sql.Int, cn.ChucNangID)
        .input('xem', sql.Bit, p.xem)
        .input('them', sql.Bit, p.them)
        .input('sua', sql.Bit, p.sua)
        .input('xoa', sql.Bit, p.xoa)
        .query(`
          INSERT INTO PhanQuyen (VaiTroID, ChucNangID, ChoPhepXem, ChoPhepThem, ChoPhepSua, ChoPhepXoa)
          VALUES (@vaiTroId, @chucNangId, @xem, @them, @sua, @xoa)
        `);
    }
    console.log('[SEED] Da cap quyen cho NguoiCaoTuoi (VaiTroID = 4)');

    console.log('[SEED] Hoan tat khoi tao bang PhanQuyen!');
  } catch (err) {
    console.error('[SEED] Loi:', err);
  } finally {
    process.exit(0);
  }
}

seedPhanQuyen();
