-- Additive audit schema only. Run explicitly in the intended CareSenior database.
-- No existing diary, profile, medication or alert rows are modified/backfilled.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID(N'dbo.LichSuNhatKyChamSoc',N'U') IS NULL
BEGIN
  CREATE TABLE dbo.LichSuNhatKyChamSoc (
    LichSuID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    NhatKyID INT NOT NULL,
    NguoiCaoTuoiID INT NOT NULL,
    HanhDong NVARCHAR(10) NOT NULL CHECK (HanhDong IN (N'TAO',N'SUA',N'XOA')),
    NguoiThucHienID INT NOT NULL,
    NguoiThucHienTen NVARCHAR(100) NOT NULL,
    VaiTro NVARCHAR(30) NOT NULL,
    ThoiGian DATETIME2 NOT NULL,
    LyDo NVARCHAR(300) NULL,
    DuLieuCu NVARCHAR(MAX) NULL CHECK (DuLieuCu IS NULL OR ISJSON(DuLieuCu)=1),
    DuLieuMoi NVARCHAR(MAX) NOT NULL CHECK (ISJSON(DuLieuMoi)=1)
  );
  CREATE INDEX IX_NhatKyAudit_History ON dbo.LichSuNhatKyChamSoc(NhatKyID,LichSuID DESC);
  CREATE INDEX IX_NhatKyAudit_NCT ON dbo.LichSuNhatKyChamSoc(NguoiCaoTuoiID,ThoiGian);
  CREATE UNIQUE INDEX UX_NhatKyAudit_Create ON dbo.LichSuNhatKyChamSoc(NhatKyID) WHERE HanhDong=N'TAO';
  -- No cascading foreign keys: retain historical ID/name snapshots even if an
  -- account or elderly profile is later removed. Never expose an orphan's log.
END;
COMMIT TRANSACTION;
GO
