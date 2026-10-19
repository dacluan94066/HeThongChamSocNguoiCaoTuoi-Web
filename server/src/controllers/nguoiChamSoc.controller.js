// controllers/nguoiChamSoc.controller.js - CRUD nguoi cham soc - dung schema that
// Bang NguoiChamSoc: NguoiChamSocID, UserID (FK->NguoiDung), HoTen, SoDienThoai,
//   Email, DiaChi, NgheNghiep, GhiChu, NgayTao
// Bang NguoiCaoTuoi_NguoiChamSoc: lien ket NCT <-> NCS
const { poolPromise, sql } = require("../config/db");
const { ok, fail } = require("../utils/response");
const { isMobileRole } = require("../middlewares/mobile-scope.middleware");

const caregiverScope = (req, alias) => {
  if (!isMobileRole(req)) return "";
  const ids = req.mobileElderlyIds || [];
  if (!ids.length) return " AND 1=0";
  return ` AND EXISTS (
    SELECT 1 FROM NguoiCaoTuoi_NguoiChamSoc accessLink
    WHERE accessLink.NguoiChamSocID = ${alias}.NguoiChamSocID
      AND accessLink.NguoiCaoTuoiID IN (${ids.join(",")})
      AND accessLink.NgayBatDau <= CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE)
      AND (accessLink.NgayKetThuc IS NULL OR accessLink.NgayKetThuc > CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE))
  )`;
};

const mapCaregiver = (row) => ({
  id: row.id,
  userId: row.userId || null,
  maNhanVien: `NCS${String(row.id).padStart(3, "0")}`,
  hoTen: row.hoTen,
  soDienThoai: row.soDienThoai,
  email: row.email,
  diaChi: row.diaChi,
  trinhDoChuyenMon: row.ngheNghiep,
  ghiChu: row.ghiChu,
  trangThai: row.trangThai,
  trangThaiLabel: ({ DangLamViec: 'Đang làm việc', TamNghi: 'Tạm nghỉ', NgungLamViec: 'Ngừng làm việc' })[row.trangThai] || row.trangThai,
  soNguoiPhuTrach: row.soNguoiPhuTrach || 0,
  nguoiCaoTuoiTen: row.nguoiCaoTuoiTen
    ? row.nguoiCaoTuoiTen.split("||").filter(Boolean)
    : [],
  phuTrach: row.phuTrach || [],
});

// GET /api/elderly/me/caregivers
// Lay nguoi cham soc dang phu trach ho so gan voi tai khoan NguoiCaoTuoi.
const getMine = async (req, res, next) => {
  if (req.user.tenVaiTro !== 'NguoiCaoTuoi') {
    return fail(res, 'Chi tai khoan nguoi cao tuoi duoc xem nguoi cham soc cua minh', 'FORBIDDEN', 403);
  }

  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('userId', sql.Int, req.user.userId)
      .query(`
        SELECT ncs.NguoiChamSocID AS id,
          ncs.UserID AS userId,
          ncs.HoTen AS hoTen,
          ncs.SoDienThoai AS soDienThoai,
          ncs.Email AS email,
          ncs.DiaChi AS diaChi,
          ncs.NgheNghiep AS ngheNghiep,
          CASE
            WHEN lk.LaChinh = 1 THEN N'Người chăm sóc chính'
            WHEN lk.MoiQuanHe = N'Người chăm sóc chính' THEN N'Người chăm sóc'
            ELSE lk.MoiQuanHe
          END AS moiQuanHe,
          lk.LaChinh AS laChinh
        FROM HoSoNguoiCaoTuoi nct
        INNER JOIN NguoiCaoTuoi_NguoiChamSoc lk
          ON lk.NguoiCaoTuoiID = nct.NguoiCaoTuoiID
        INNER JOIN NguoiChamSoc ncs
          ON ncs.NguoiChamSocID = lk.NguoiChamSocID
        WHERE nct.UserID = @userId
          AND lk.NgayBatDau <= CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE)
          AND (lk.NgayKetThuc IS NULL OR lk.NgayKetThuc > CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE))
        ORDER BY lk.LaChinh DESC, ncs.HoTen ASC
      `);

    return ok(res, result.recordset, 'Lay danh sach nguoi cham soc thanh cong');
  } catch (error) { next(error); }
};

// GET /api/caregivers/me/elderly
const getMyElderly = async (req, res, next) => {
  if (req.user.tenVaiTro !== 'NguoiChamSoc') {
    return fail(res, 'Chi tai khoan nguoi cham soc duoc xem danh sach phu trach', 'FORBIDDEN', 403);
  }

  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('userId', sql.Int, req.user.userId)
      .query(`
        SELECT nct.NguoiCaoTuoiID AS id,
          nct.HoTen AS hoTen,
          nct.NgaySinh AS ngaySinh,
          DATEDIFF(YEAR, nct.NgaySinh, CAST(GETDATE() AS DATE))
            - CASE WHEN DATEADD(YEAR, DATEDIFF(YEAR, nct.NgaySinh, CAST(GETDATE() AS DATE)), nct.NgaySinh)
              > CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END AS tuoi,
          nct.GioiTinh AS gioiTinh,
          nct.TrangThai AS trangThai,
          lk.MoiQuanHe AS moiQuanHe,
          lk.LaChinh AS laChinh,
          pending.CanhBaoKhanCapID AS canhBaoKhanCapId,
          pending.NoiDung AS noiDungCanhBao,
          pending.NgayGui AS ngayGuiCanhBao,
          CAST(CASE WHEN pending.CanhBaoKhanCapID IS NULL THEN 0 ELSE 1 END AS BIT)
            AS coCanhBaoKhanCap
        FROM NguoiChamSoc ncs
        INNER JOIN NguoiCaoTuoi_NguoiChamSoc lk
          ON lk.NguoiChamSocID = ncs.NguoiChamSocID
        INNER JOIN HoSoNguoiCaoTuoi nct
          ON nct.NguoiCaoTuoiID = lk.NguoiCaoTuoiID
        OUTER APPLY (
          SELECT TOP 1 kc.CanhBaoKhanCapID, kc.NoiDung, kc.NgayGui
          FROM CanhBaoKhanCap kc
          WHERE kc.NguoiCaoTuoiID = nct.NguoiCaoTuoiID
            AND kc.TrangThai IN (N'DangGui', N'DaTiepNhan')
          ORDER BY kc.NgayGui DESC, kc.CanhBaoKhanCapID DESC
        ) pending
        WHERE ncs.UserID = @userId
          AND lk.NgayBatDau <= CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE)
          AND (lk.NgayKetThuc IS NULL OR lk.NgayKetThuc > CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE))
        ORDER BY coCanhBaoKhanCap DESC, nct.HoTen ASC
      `);
    return ok(res, result.recordset, 'Lay danh sach nguoi cao tuoi dang phu trach thanh cong');
  } catch (error) { next(error); }
};

// GET /api/caregivers?keyword=
// GET /api/caregivers?keyword=
const getAll = async (req, res, next) => {
  try {
    const { keyword } = req.query;
    const pool = await poolPromise;

    let query = `
      SELECT
        ncs.NguoiChamSocID AS id,
        ncs.UserID AS userId,
        ncs.HoTen AS hoTen,
        ncs.SoDienThoai AS soDienThoai,
        ncs.Email AS email,
        ncs.DiaChi AS diaChi,
        ncs.NgheNghiep AS ngheNghiep,
        ncs.GhiChu AS ghiChu,
        ncs.TrangThai AS trangThai,
        nct.NguoiCaoTuoiID AS nguoiCaoTuoiId,
        nct.HoTen AS nguoiCaoTuoiTen,
        lk.MoiQuanHe AS moiQuanHe,
        lk.LaChinh AS laChinh
      FROM NguoiChamSoc ncs
      LEFT JOIN NguoiCaoTuoi_NguoiChamSoc lk
        ON ncs.NguoiChamSocID = lk.NguoiChamSocID
        AND lk.NgayBatDau <= CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE)
        AND (lk.NgayKetThuc IS NULL
          OR lk.NgayKetThuc > CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE))
        ${
          isMobileRole(req)
            ? `AND lk.NguoiCaoTuoiID IN (${
                (req.mobileElderlyIds || []).length
                  ? req.mobileElderlyIds.join(",")
                  : "NULL"
              })`
            : ""
        }
      LEFT JOIN HoSoNguoiCaoTuoi nct
        ON lk.NguoiCaoTuoiID = nct.NguoiCaoTuoiID
      WHERE 1=1
    `;

    const req2 = pool.request();

    if (keyword && keyword.trim()) {
      query += `
        AND (
          ncs.HoTen LIKE @kw
          OR ncs.SoDienThoai LIKE @kw
          OR CONCAT(N'NCS-', RIGHT(CONCAT('00000', ncs.NguoiChamSocID), 5)) LIKE @kw
        )
      `;

      req2.input("kw", sql.NVarChar, `%${keyword.trim()}%`);
    }

    query += caregiverScope(req, "ncs");

    query += ` ORDER BY ncs.HoTen, lk.LaChinh DESC, nct.HoTen`;

    const result = await req2.query(query);
    const grouped = new Map();
    result.recordset.forEach((row) => {
      if (!grouped.has(row.id)) {
        grouped.set(row.id, {
          id: row.id,
          userId: row.userId || null,
          maNhanVien: `NCS${String(row.id).padStart(3, "0")}`,
          hoTen: row.hoTen,
          soDienThoai: row.soDienThoai,
          email: row.email,
          diaChi: row.diaChi,
          trinhDoChuyenMon: row.ngheNghiep,
          ghiChu: row.ghiChu,
          trangThai: row.trangThai,
          trangThaiLabel: ({ DangLamViec: 'Đang làm việc', TamNghi: 'Tạm nghỉ', NgungLamViec: 'Ngừng làm việc' })[row.trangThai] || row.trangThai,
          soNguoiPhuTrach: 0,
          nguoiCaoTuoiTen: [],
          phuTrach: [],
        });
      }
      if (row.nguoiCaoTuoiId) {
        const caregiver = grouped.get(row.id);
        caregiver.phuTrach.push({
          id: row.nguoiCaoTuoiId,
          hoTen: row.nguoiCaoTuoiTen,
          moiQuanHe: row.moiQuanHe,
          laChinh: Boolean(row.laChinh),
        });
        caregiver.nguoiCaoTuoiTen.push(row.nguoiCaoTuoiTen);
        caregiver.soNguoiPhuTrach += 1;
      }
    });

    return ok(res, Array.from(grouped.values()));
  } catch (err) {
    next(err);
  }
};

// GET /api/caregivers/:id
const getById = async (req, res, next) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().input("id", sql.Int, req.params.id)
      .query(`
      SELECT NguoiChamSocID AS id, UserID AS userId, HoTen AS hoTen,
        SoDienThoai AS soDienThoai, Email AS email, DiaChi AS diaChi,
        NgheNghiep AS ngheNghiep, GhiChu AS ghiChu, TrangThai AS trangThai
      FROM NguoiChamSoc ncs WHERE NguoiChamSocID=@id ${caregiverScope(req, "ncs")}`);
    if (!result.recordset.length)
      return fail(res, "Khong tim thay", "NOT_FOUND", 404);
    return ok(
      res,
      mapCaregiver({
        ...result.recordset[0],
        soNguoiPhuTrach: 0,
        nguoiCaoTuoiTen: "",
      }),
    );
  } catch (err) {
    next(err);
  }
};

// POST /api/caregivers - Tao NguoiChamSoc + NguoiDung moi
const create = async (req, res, next) => {
  try {
    const { hoTen, soDienThoai, email, diaChi, ngheNghiep, ghiChu } = req.body;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!hoTen || !soDienThoai || !normalizedEmail)
      return fail(res, "hoTen, soDienThoai, email la bat buoc", "MISSING_FIELDS", 400);
    if (normalizedEmail.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))
      return fail(res, "Email khong hop le", "INVALID_EMAIL", 400);

    const pool = await poolPromise;
    const duplicateEmail = await pool.request()
      .input('email', sql.VarChar(100), normalizedEmail)
      .query(`
        SELECT Email FROM NguoiChamSoc WHERE LOWER(LTRIM(RTRIM(Email)))=@email
        UNION ALL
        SELECT Email FROM NguoiDung WHERE LOWER(LTRIM(RTRIM(Email)))=@email
      `);
    if (duplicateEmail.recordset.length) {
      return fail(res, 'Email da duoc su dung', 'EMAIL_TAKEN', 409);
    }
    // Them thang vao NguoiChamSoc (khong bat buoc co UserID)
    const r =
      await // UserID = NULL (NCS chua co tai khoan), can cap nhat sau neu muon
      pool
        .request()
        .input("hoTen", sql.NVarChar, hoTen)
        .input("sdt", sql.NVarChar, soDienThoai)
        .input("email", sql.NVarChar, normalizedEmail)
        .input("diaChi", sql.NVarChar, diaChi || null)
        .input("ngheNghiep", sql.NVarChar, ngheNghiep || null)
        .input("ghiChu", sql.NVarChar, ghiChu || null)
        .query(`INSERT INTO NguoiChamSoc (UserID,HoTen,SoDienThoai,Email,DiaChi,NgheNghiep,GhiChu)
              OUTPUT INSERTED.NguoiChamSocID AS id
              VALUES (NULL,@hoTen,@sdt,@email,@diaChi,@ngheNghiep,@ghiChu)`);
    return ok(
      res,
      { id: r.recordset[0].id },
      "Them nguoi cham soc thanh cong",
      201,
    );
  } catch (err) {
    next(err);
  }
};

// PUT /api/caregivers/:id
const update = async (req, res, next) => {
  try {
    const { hoTen, soDienThoai, email, diaChi, ngheNghiep, ghiChu } = req.body;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!hoTen || !soDienThoai || !normalizedEmail)
      return fail(res, "hoTen, soDienThoai, email la bat buoc", "MISSING_FIELDS", 400);
    if (normalizedEmail.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))
      return fail(res, "Email khong hop le", "INVALID_EMAIL", 400);
    const pool = await poolPromise;
    const duplicateEmail = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('email', sql.VarChar(100), normalizedEmail)
      .query(`
        SELECT Email FROM NguoiChamSoc
        WHERE LOWER(LTRIM(RTRIM(Email)))=@email AND NguoiChamSocID<>@id
        UNION ALL
        SELECT Email FROM NguoiDung
        WHERE LOWER(LTRIM(RTRIM(Email)))=@email
          AND UserID<>COALESCE((SELECT UserID FROM NguoiChamSoc WHERE NguoiChamSocID=@id),-1)
      `);
    if (duplicateEmail.recordset.length) {
      return fail(res, 'Email da duoc su dung', 'EMAIL_TAKEN', 409);
    }
    await pool
      .request()
      .input("id", sql.Int, req.params.id)
      .input("hoTen", sql.NVarChar, hoTen)
      .input("sdt", sql.NVarChar, soDienThoai || null)
      .input("email", sql.NVarChar, normalizedEmail)
      .input("diaChi", sql.NVarChar, diaChi || null)
      .input("ngheNghiep", sql.NVarChar, ngheNghiep || null)
      .input("ghiChu", sql.NVarChar, ghiChu || null)
      .query(
        `UPDATE NguoiChamSoc SET HoTen=@hoTen,SoDienThoai=@sdt,Email=@email,DiaChi=@diaChi,NgheNghiep=@ngheNghiep,GhiChu=@ghiChu WHERE NguoiChamSocID=@id`,
      );
    return ok(res, { id: parseInt(req.params.id) }, "Cap nhat thanh cong");
  } catch (err) {
    next(err);
  }
};

module.exports = { getMine, getMyElderly, getAll, getById, create, update };
