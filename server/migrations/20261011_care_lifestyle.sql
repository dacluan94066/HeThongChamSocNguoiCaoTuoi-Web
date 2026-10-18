-- Additive companion to the existing journal: exactly one journal row per record.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID('dbo.SinhHoatChamSoc','U') IS NULL
BEGIN
 CREATE TABLE dbo.SinhHoatChamSoc(
  NhatKyID INT NOT NULL PRIMARY KEY REFERENCES dbo.NhatKyChamSoc(NhatKyID),
  Loai VARCHAR(12) NOT NULL CHECK(Loai IN('meal','water','sleep','exercise','mood')),
  Luong DECIMAL(10,2) NULL, KetThuc DATETIME2 NULL,
  NguoiGhiID INT NOT NULL REFERENCES dbo.NguoiDung(UserID),
  RequestID VARCHAR(64) NOT NULL, DauVao NVARCHAR(MAX) NOT NULL,
  PhienBan INT NOT NULL DEFAULT 1, DaXoa BIT NOT NULL DEFAULT 0,
  CONSTRAINT UQ_SinhHoat_Request UNIQUE(NguoiGhiID,RequestID),
  CHECK(Luong IS NULL OR Luong>=0), CHECK(PhienBan>0)
 );
 CREATE TABLE dbo.LichSuSinhHoat(
  ID INT IDENTITY PRIMARY KEY, NhatKyID INT NOT NULL REFERENCES dbo.SinhHoatChamSoc(NhatKyID),
  PhienBan INT NOT NULL, NguoiSuaID INT NOT NULL REFERENCES dbo.NguoiDung(UserID),
  ThoiDiem DATETIME2 NOT NULL DEFAULT DATEADD(HOUR,7,SYSUTCDATETIME()),
  DuLieu NVARCHAR(MAX) NOT NULL,
  CONSTRAINT UQ_LichSuSinhHoat UNIQUE(NhatKyID,PhienBan)
 );
END;
COMMIT;
