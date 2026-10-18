-- Additive migration. Execute only on an explicitly verified synthetic test database.
-- No DROP, backfill, or changes to existing medication/appointment data.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID(N'dbo.KeHoachChamSoc',N'U') IS NULL
CREATE TABLE dbo.KeHoachChamSoc (
 KeHoachID INT IDENTITY PRIMARY KEY,
 NguoiCaoTuoiID INT NOT NULL REFERENCES dbo.HoSoNguoiCaoTuoi(NguoiCaoTuoiID),
 Ten NVARCHAR(120) NOT NULL, MucTieu NVARCHAR(500) NOT NULL,
 NgayBatDau DATE NOT NULL, NgayKetThuc DATE NOT NULL,
 NguoiTaoID INT NOT NULL REFERENCES dbo.NguoiDung(UserID),
 NgayTao DATETIME2 NOT NULL DEFAULT DATEADD(HOUR,7,SYSUTCDATETIME()),
 CONSTRAINT CK_KeHoach_Ngay CHECK(NgayKetThuc>=NgayBatDau AND DATEDIFF(DAY,NgayBatDau,NgayKetThuc)<90)
);
IF OBJECT_ID(N'dbo.HoatDongKeHoach',N'U') IS NULL
CREATE TABLE dbo.HoatDongKeHoach (
 HoatDongID INT IDENTITY PRIMARY KEY,
 KeHoachID INT NOT NULL REFERENCES dbo.KeHoachChamSoc(KeHoachID),
 Loai VARCHAR(20) NOT NULL CHECK(Loai IN ('nutrition','water','exercise','rest','hygiene','monitoring')),
 Ten NVARCHAR(120) NOT NULL, Gio CHAR(5) NOT NULL,
 ThuTrongTuan VARCHAR(13) NOT NULL,
 CONSTRAINT UQ_HoatDongKeHoach UNIQUE(KeHoachID,Ten,Gio,ThuTrongTuan)
);
IF OBJECT_ID(N'dbo.LanHoanThanhChamSoc',N'U') IS NULL
CREATE TABLE dbo.LanHoanThanhChamSoc (
 LanID INT IDENTITY PRIMARY KEY,
 HoatDongID INT NOT NULL REFERENCES dbo.HoatDongKeHoach(HoatDongID),
 Ngay DATE NOT NULL,
 NguoiXacNhanID INT NOT NULL REFERENCES dbo.NguoiDung(UserID),
 ThoiDiem DATETIME2 NOT NULL DEFAULT DATEADD(HOUR,7,SYSUTCDATETIME()),
 CONSTRAINT UQ_LanHoanThanhChamSoc UNIQUE(HoatDongID,Ngay)
);
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name='IX_KeHoach_HoSo_Ngay' AND object_id=OBJECT_ID('dbo.KeHoachChamSoc'))
CREATE INDEX IX_KeHoach_HoSo_Ngay ON dbo.KeHoachChamSoc(NguoiCaoTuoiID,NgayBatDau,NgayKetThuc);
COMMIT;
