-- CARESENIOR RELATIVES PATCH v1. Manual application only; no USE/DROP/DELETE/seed.
-- Review README_nguoi_than.md and back up the target before explicitly approving application.
SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET NUMERIC_ROUNDABORT OFF;

IF DB_NAME() IN (N'master',N'model',N'msdb',N'tempdb')
  THROW 51000,N'Phải chọn database CareSenior đích, không dùng database hệ thống.',1;
IF OBJECT_ID(N'dbo.NguoiDung',N'U') IS NULL OR OBJECT_ID(N'dbo.HoSoNguoiCaoTuoi',N'U') IS NULL
  OR OBJECT_ID(N'dbo.VaiTro',N'U') IS NULL OR OBJECT_ID(N'dbo.PhanQuyen',N'U') IS NULL
  OR OBJECT_ID(N'dbo.ChucNang',N'U') IS NULL
  THROW 51000,N'Thiếu schema CareSenior bắt buộc. Không áp dụng patch.',1;
IF EXISTS(SELECT 1 FROM (VALUES(N'NguoiDung',N'UserID'),(N'HoSoNguoiCaoTuoi',N'NguoiCaoTuoiID'),
    (N'VaiTro',N'VaiTroID')) required(tableName,columnName)
  LEFT JOIN sys.columns c ON c.object_id=OBJECT_ID(N'dbo.'+required.tableName) AND c.name=required.columnName
  WHERE c.column_id IS NULL OR TYPE_NAME(c.system_type_id)<>N'int' OR c.is_nullable=1)
  THROW 51000,N'Khóa chính hiện tại không khớp schema đã xác minh.',1;
IF (SELECT COUNT(*) FROM dbo.ChucNang WHERE MaChucNang IN
  ('QLHOSONCT','QLCHISOSK','QLLICHUONGTHUOC','QLLICHKHAM','QLCANHBAO','QLNGUOIDUNG'))<>6
  THROW 51000,N'Thiếu chức năng phân quyền bắt buộc.',1;

BEGIN TRY
  BEGIN TRANSACTION;
  DECLARE @lockResult int;
  EXEC @lockResult=sys.sp_getapplock @Resource=N'CareSenior.Relatives.Schema.v1',
    @LockMode=N'Exclusive',@LockOwner=N'Transaction',@LockTimeout=10000;
  IF @lockResult<0 THROW 51000,N'Không lấy được khóa áp dụng patch Người thân.',1;

  IF OBJECT_ID(N'dbo.NguoiCaoTuoi_NguoiThan',N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.NguoiCaoTuoi_NguoiThan(
      LienKetID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_NCT_NguoiThan PRIMARY KEY,
      NguoiCaoTuoiID int NOT NULL,
      NguoiThanUserID int NOT NULL,
      MoiQuanHe nvarchar(50) NOT NULL,
      DongYChiaSe bit NOT NULL,
      NguoiDongY nvarchar(100) NOT NULL,
      TuCachDongY nvarchar(100) NOT NULL,
      ThoiDiemDongY datetime2(7) NOT NULL,
      CanCuDongY nvarchar(1000) NOT NULL,
      XemBenhNen bit NOT NULL CONSTRAINT DF_NT_BenhNen DEFAULT 0,
      XemDiUng bit NOT NULL CONSTRAINT DF_NT_DiUng DEFAULT 0,
      XemKetQuaKham bit NOT NULL CONSTRAINT DF_NT_KetQua DEFAULT 0,
      NguoiTaoID int NOT NULL,
      TaoLuc datetime2(7) NOT NULL CONSTRAINT DF_NT_TaoLuc DEFAULT SYSUTCDATETIME(),
      CapNhatLuc datetime2(7) NOT NULL CONSTRAINT DF_NT_CapNhat DEFAULT SYSUTCDATETIME(),
      ThuHoiLuc datetime2(7) NULL,
      NguoiThuHoiID int NULL,
      LyDoThuHoi nvarchar(500) NULL,
      PhienBan rowversion NOT NULL,
      CONSTRAINT FK_NT_NCT FOREIGN KEY(NguoiCaoTuoiID) REFERENCES dbo.HoSoNguoiCaoTuoi(NguoiCaoTuoiID),
      CONSTRAINT FK_NT_User FOREIGN KEY(NguoiThanUserID) REFERENCES dbo.NguoiDung(UserID),
      CONSTRAINT FK_NT_NguoiTao FOREIGN KEY(NguoiTaoID) REFERENCES dbo.NguoiDung(UserID),
      CONSTRAINT FK_NT_NguoiThuHoi FOREIGN KEY(NguoiThuHoiID) REFERENCES dbo.NguoiDung(UserID),
      CONSTRAINT CK_NT_Consent CHECK(DongYChiaSe=1 AND LEN(LTRIM(RTRIM(MoiQuanHe)))>0
        AND LEN(LTRIM(RTRIM(NguoiDongY)))>0 AND LEN(LTRIM(RTRIM(TuCachDongY)))>0
        AND LEN(LTRIM(RTRIM(CanCuDongY)))>0),
      CONSTRAINT CK_NT_Time CHECK(ThoiDiemDongY<=CapNhatLuc AND TaoLuc<=CapNhatLuc),
      CONSTRAINT CK_NT_Revoke CHECK((ThuHoiLuc IS NULL AND NguoiThuHoiID IS NULL AND LyDoThuHoi IS NULL)
        OR (ThuHoiLuc IS NOT NULL AND NguoiThuHoiID IS NOT NULL AND LyDoThuHoi IS NOT NULL
          AND LEN(LTRIM(RTRIM(LyDoThuHoi)))>0 AND ThuHoiLuc>=TaoLuc))
    );
  END;
  -- Existing tables must be exactly the expected v1 shape; never repair an unknown partial migration.
  IF (SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.NguoiCaoTuoi_NguoiThan'))<>19
    OR EXISTS(SELECT 1 FROM (VALUES
      (N'LienKetID',N'int',4,0),(N'NguoiCaoTuoiID',N'int',4,0),(N'NguoiThanUserID',N'int',4,0),
      (N'MoiQuanHe',N'nvarchar',100,0),(N'DongYChiaSe',N'bit',1,0),
      (N'NguoiDongY',N'nvarchar',200,0),(N'TuCachDongY',N'nvarchar',200,0),
      (N'ThoiDiemDongY',N'datetime2',8,0),(N'CanCuDongY',N'nvarchar',2000,0),
      (N'XemBenhNen',N'bit',1,0),(N'XemDiUng',N'bit',1,0),(N'XemKetQuaKham',N'bit',1,0),
      (N'NguoiTaoID',N'int',4,0),(N'TaoLuc',N'datetime2',8,0),(N'CapNhatLuc',N'datetime2',8,0),
      (N'ThuHoiLuc',N'datetime2',8,1),(N'NguoiThuHoiID',N'int',4,1),
      (N'LyDoThuHoi',N'nvarchar',1000,1),(N'PhienBan',N'timestamp',8,0)) expected(name,typeName,length,nullable)
      LEFT JOIN sys.columns c ON c.object_id=OBJECT_ID(N'dbo.NguoiCaoTuoi_NguoiThan') AND c.name=expected.name
      WHERE c.column_id IS NULL OR TYPE_NAME(c.system_type_id)<>expected.typeName
        OR c.max_length<>expected.length OR c.is_nullable<>expected.nullable)
    THROW 51000,N'Bảng liên kết Người thân hiện có không khớp v1; cần kiểm tra thủ công.',1;

  IF EXISTS(SELECT 1 FROM dbo.NguoiCaoTuoi_NguoiThan WHERE ThuHoiLuc IS NULL
    GROUP BY NguoiCaoTuoiID,NguoiThanUserID HAVING COUNT(*)>1)
    THROW 51000,N'Có liên kết còn hiệu lực bị trùng. Không tự xóa hoặc gộp.',1;
  IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.NguoiCaoTuoi_NguoiThan') AND name=N'UX_NCT_NguoiThan_Active')
    CREATE UNIQUE INDEX UX_NCT_NguoiThan_Active ON dbo.NguoiCaoTuoi_NguoiThan(NguoiThanUserID,NguoiCaoTuoiID)
      WHERE ThuHoiLuc IS NULL;
  IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.NguoiCaoTuoi_NguoiThan') AND name=N'IX_NCT_NguoiThan_Elderly')
    CREATE INDEX IX_NCT_NguoiThan_Elderly ON dbo.NguoiCaoTuoi_NguoiThan(NguoiCaoTuoiID,ThuHoiLuc,NguoiThanUserID);

  IF OBJECT_ID(N'dbo.LichSuLienKetNguoiThan',N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.LichSuLienKetNguoiThan(
      LichSuID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_LichSuLienKetNguoiThan PRIMARY KEY,
      LienKetID int NOT NULL,
      HanhDong nvarchar(20) NOT NULL,
      NguoiThucHienID int NOT NULL,
      ThoiGian datetime2(7) NOT NULL CONSTRAINT DF_NT_AuditTime DEFAULT SYSUTCDATETIME(),
      LyDo nvarchar(500) NOT NULL,
      DuLieuCu nvarchar(max) NULL,
      DuLieuMoi nvarchar(max) NOT NULL,
      CONSTRAINT FK_NT_AuditLink FOREIGN KEY(LienKetID) REFERENCES dbo.NguoiCaoTuoi_NguoiThan(LienKetID),
      CONSTRAINT FK_NT_AuditActor FOREIGN KEY(NguoiThucHienID) REFERENCES dbo.NguoiDung(UserID),
      CONSTRAINT CK_NT_AuditAction CHECK(HanhDong IN(N'CAP',N'CAP_NHAT',N'THU_HOI')),
      CONSTRAINT CK_NT_AuditJson CHECK(ISJSON(DuLieuMoi)=1 AND (DuLieuCu IS NULL OR ISJSON(DuLieuCu)=1)),
      CONSTRAINT CK_NT_AuditReason CHECK(LEN(LTRIM(RTRIM(LyDo)))>0)
    );
  END;
  IF (SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.LichSuLienKetNguoiThan'))<>8
    OR EXISTS(SELECT 1 FROM (VALUES
      (N'LichSuID',N'int',4,0),(N'LienKetID',N'int',4,0),(N'HanhDong',N'nvarchar',40,0),
      (N'NguoiThucHienID',N'int',4,0),(N'ThoiGian',N'datetime2',8,0),(N'LyDo',N'nvarchar',1000,0),
      (N'DuLieuCu',N'nvarchar',-1,1),(N'DuLieuMoi',N'nvarchar',-1,0)) expected(name,typeName,length,nullable)
      LEFT JOIN sys.columns c ON c.object_id=OBJECT_ID(N'dbo.LichSuLienKetNguoiThan') AND c.name=expected.name
      WHERE c.column_id IS NULL OR TYPE_NAME(c.system_type_id)<>expected.typeName
        OR c.max_length<>expected.length OR c.is_nullable<>expected.nullable)
    THROW 51000,N'Bảng lịch sử Người thân không khớp v1.',1;
  IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.LichSuLienKetNguoiThan') AND name=N'IX_NT_AuditLink')
    CREATE INDEX IX_NT_AuditLink ON dbo.LichSuLienKetNguoiThan(LienKetID,LichSuID DESC);

  IF NOT EXISTS(SELECT 1 FROM sys.indexes i WHERE i.object_id=OBJECT_ID(N'dbo.NguoiCaoTuoi_NguoiThan')
      AND i.name=N'UX_NCT_NguoiThan_Active' AND i.is_unique=1 AND i.is_disabled=0
      AND REPLACE(REPLACE(REPLACE(i.filter_definition,N' ',N''),N'[',N''),N']',N'')=N'(ThuHoiLucISNULL)'
      AND (SELECT COUNT(*) FROM sys.index_columns c WHERE c.object_id=i.object_id AND c.index_id=i.index_id AND c.key_ordinal>0)=2
      AND EXISTS(SELECT 1 FROM sys.index_columns c JOIN sys.columns col ON col.object_id=c.object_id AND col.column_id=c.column_id
        WHERE c.object_id=i.object_id AND c.index_id=i.index_id AND c.key_ordinal=1 AND col.name=N'NguoiThanUserID')
      AND EXISTS(SELECT 1 FROM sys.index_columns c JOIN sys.columns col ON col.object_id=c.object_id AND col.column_id=c.column_id
        WHERE c.object_id=i.object_id AND c.index_id=i.index_id AND c.key_ordinal=2 AND col.name=N'NguoiCaoTuoiID'))
    THROW 51000,N'Filtered unique index Người thân không khớp v1.',1;
  IF (SELECT COUNT(*) FROM sys.foreign_keys WHERE name IN
    (N'FK_NT_NCT',N'FK_NT_User',N'FK_NT_NguoiTao',N'FK_NT_NguoiThuHoi',N'FK_NT_AuditLink',N'FK_NT_AuditActor')
    AND parent_object_id IN(OBJECT_ID(N'dbo.NguoiCaoTuoi_NguoiThan'),OBJECT_ID(N'dbo.LichSuLienKetNguoiThan'))
    AND is_disabled=0 AND is_not_trusted=0 AND delete_referential_action=0)<>6
    THROW 51000,N'Khóa ngoại Người thân thiếu, bị tắt hoặc không đáng tin cậy.',1;
  IF (SELECT COUNT(*) FROM sys.check_constraints WHERE name IN
    (N'CK_NT_Consent',N'CK_NT_Time',N'CK_NT_Revoke',N'CK_NT_AuditAction',N'CK_NT_AuditJson',N'CK_NT_AuditReason')
    AND parent_object_id IN(OBJECT_ID(N'dbo.NguoiCaoTuoi_NguoiThan'),OBJECT_ID(N'dbo.LichSuLienKetNguoiThan'))
    AND is_disabled=0 AND is_not_trusted=0)<>6
    THROW 51000,N'CHECK constraints Người thân thiếu, bị tắt hoặc không đáng tin cậy.',1;

  IF NOT EXISTS(SELECT 1 FROM dbo.VaiTro WHERE TenVaiTro=N'NguoiThan')
    INSERT INTO dbo.VaiTro(TenVaiTro,MoTa) VALUES(N'NguoiThan',N'Web chỉ xem NCT được liên kết và đồng ý chia sẻ');
  INSERT INTO dbo.PhanQuyen(VaiTroID,ChucNangID,ChoPhepXem,ChoPhepThem,ChoPhepSua,ChoPhepXoa)
  SELECT vt.VaiTroID,cn.ChucNangID,
    CASE WHEN cn.MaChucNang IN('QLHOSONCT','QLCHISOSK','QLLICHUONGTHUOC','QLLICHKHAM','QLCANHBAO') THEN 1 ELSE 0 END,0,0,0
  FROM dbo.VaiTro vt CROSS JOIN dbo.ChucNang cn
  WHERE vt.TenVaiTro=N'NguoiThan' AND NOT EXISTS(SELECT 1 FROM dbo.PhanQuyen pq WITH(UPDLOCK,HOLDLOCK)
    WHERE pq.VaiTroID=vt.VaiTroID AND pq.ChucNangID=cn.ChucNangID);
  IF EXISTS(SELECT 1 FROM dbo.PhanQuyen pq JOIN dbo.VaiTro vt ON vt.VaiTroID=pq.VaiTroID
    JOIN dbo.ChucNang cn ON cn.ChucNangID=pq.ChucNangID WHERE vt.TenVaiTro=N'NguoiThan'
      AND (pq.ChoPhepThem=1 OR pq.ChoPhepSua=1 OR pq.ChoPhepXoa=1
        OR (pq.ChoPhepXem=1 AND cn.MaChucNang NOT IN('QLHOSONCT','QLCHISOSK','QLLICHUONGTHUOC','QLLICHKHAM','QLCANHBAO'))))
    THROW 51000,N'Quyền Người thân hiện có vượt giới hạn chỉ xem. Cần kiểm tra thủ công.',1;
  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT>0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
