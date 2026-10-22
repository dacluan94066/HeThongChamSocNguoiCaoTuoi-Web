-- Run manually against the intended CareSenior database, once or repeatedly.
-- No medication/profile rows are changed. Never auto-run this at server startup.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID(N'dbo.LichSuGhiNhanUongThuoc',N'U') IS NULL
BEGIN
  CREATE TABLE dbo.LichSuGhiNhanUongThuoc (
    GhiNhanID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    LichUongThuocID INT NOT NULL,
    NguoiCaoTuoiID INT NOT NULL,
    ThoiGianDuKien DATETIME2 NOT NULL,
    TrangThaiCu NVARCHAR(20) NOT NULL,
    ThoiGianThucTeCu DATETIME2 NULL,
    NguoiXacNhanCuID INT NULL,
    TrangThaiMoi NVARCHAR(20) NOT NULL CHECK (TrangThaiMoi=N'DaUong'),
    ThoiGianThucTe DATETIME2 NOT NULL,
    NguoiGhiNhanID INT NOT NULL,
    NguoiGhiNhanTen NVARCHAR(100) NOT NULL,
    VaiTro NVARCHAR(30) NOT NULL,
    NgayGhiNhan DATETIME2 NOT NULL,
    LyDo NVARCHAR(300) NOT NULL,
    CONSTRAINT UQ_GhiNhanBoSung_Lieu UNIQUE(LichUongThuocID)
  );
  -- Intentionally retain immutable ID/name snapshots without cascading FKs:
  -- deleting an old prescription/account must not silently erase its audit.
  CREATE INDEX IX_GhiNhanBoSung_NCT ON dbo.LichSuGhiNhanUongThuoc(NguoiCaoTuoiID,NgayGhiNhan);
END;
COMMIT TRANSACTION;
GO
