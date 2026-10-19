-- Chạy thủ công sau khi kiểm tra trên CSDL đích. Script có thể chạy lặp lại.
-- Chỉ điều chỉnh ba quyền cần cho nghiệp vụ; không động tới dữ liệu khác.
SET XACT_ABORT ON;
BEGIN TRANSACTION;

;WITH RequiredPermissions AS (
    SELECT N'NguoiChamSoc' AS TenVaiTro, N'QLLIENHEKC' AS MaChucNang,
           CAST(1 AS bit) AS ChoPhepXem, CAST(1 AS bit) AS ChoPhepThem,
           CAST(1 AS bit) AS ChoPhepSua, CAST(1 AS bit) AS ChoPhepXoa
    UNION ALL SELECT N'NguoiChamSoc', N'QLNHATKY', 1, 1, 1, 1
    -- NCT chỉ sửa hồ sơ/tài khoản của chính mình; API vẫn kiểm tra phạm vi.
    UNION ALL SELECT N'NguoiCaoTuoi', N'QLHOSONCT', 1, 0, 1, 0
)
MERGE PhanQuyen WITH (HOLDLOCK) AS target
USING (
    SELECT vt.VaiTroID, cn.ChucNangID,
           rp.ChoPhepXem, rp.ChoPhepThem, rp.ChoPhepSua, rp.ChoPhepXoa
    FROM RequiredPermissions rp
    JOIN VaiTro vt ON vt.TenVaiTro=rp.TenVaiTro
    JOIN ChucNang cn ON cn.MaChucNang=rp.MaChucNang
) AS source
ON target.VaiTroID=source.VaiTroID AND target.ChucNangID=source.ChucNangID
WHEN MATCHED THEN UPDATE SET
    ChoPhepXem=source.ChoPhepXem, ChoPhepThem=source.ChoPhepThem,
    ChoPhepSua=source.ChoPhepSua, ChoPhepXoa=source.ChoPhepXoa
WHEN NOT MATCHED THEN INSERT
    (VaiTroID,ChucNangID,ChoPhepXem,ChoPhepThem,ChoPhepSua,ChoPhepXoa)
    VALUES (source.VaiTroID,source.ChucNangID,source.ChoPhepXem,
            source.ChoPhepThem,source.ChoPhepSua,source.ChoPhepXoa);

COMMIT TRANSACTION;
