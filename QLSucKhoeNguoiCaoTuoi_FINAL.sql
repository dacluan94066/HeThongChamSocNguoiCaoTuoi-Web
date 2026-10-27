/* =====================================================================
   DO AN: HE THONG QUAN LY VA CANH BAO CHAM SOC SUC KHOE NGUOI CAO TUOI
   CSDL: SQL Server
   File nay tao database + toan bo bang + danh muc + 33 dong phan quyen.
   Khong chen tai khoan demo de tranh luu mat khau mac dinh trong source.
   Tai khoan demo duoc tao rieng bang server/seed_users.js (bcrypt).
   ===================================================================== */

IF DB_ID(N'QLSucKhoeNguoiCaoTuoi') IS NOT NULL
BEGIN
    ALTER DATABASE QLSucKhoeNguoiCaoTuoi SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE QLSucKhoeNguoiCaoTuoi;
END
GO

CREATE DATABASE QLSucKhoeNguoiCaoTuoi;
GO

USE QLSucKhoeNguoiCaoTuoi;
GO

-- Bat buoc cho filtered unique index tren cac cot cho phep NULL.
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* =====================================================================
   NHOM 1: QUAN LY NGUOI DUNG VA PHAN QUYEN
   ===================================================================== */

CREATE TABLE VaiTro (
    VaiTroID        INT IDENTITY(1,1) PRIMARY KEY,
    TenVaiTro       NVARCHAR(50) NOT NULL UNIQUE,
    MoTa            NVARCHAR(200) NULL
);
GO

CREATE TABLE ChucNang (
    ChucNangID      INT IDENTITY(1,1) PRIMARY KEY,
    MaChucNang      VARCHAR(50) NOT NULL UNIQUE,
    TenChucNang     NVARCHAR(150) NOT NULL,
    NhomChucNang    NVARCHAR(100) NULL
);
GO

CREATE TABLE PhanQuyen (
    PhanQuyenID     INT IDENTITY(1,1) PRIMARY KEY,
    VaiTroID        INT NOT NULL,
    ChucNangID      INT NOT NULL,
    ChoPhepXem      BIT NOT NULL DEFAULT 0,
    ChoPhepThem     BIT NOT NULL DEFAULT 0,
    ChoPhepSua      BIT NOT NULL DEFAULT 0,
    ChoPhepXoa      BIT NOT NULL DEFAULT 0,
    CONSTRAINT FK_PhanQuyen_VaiTro FOREIGN KEY (VaiTroID) REFERENCES VaiTro(VaiTroID) ON DELETE CASCADE,
    CONSTRAINT FK_PhanQuyen_ChucNang FOREIGN KEY (ChucNangID) REFERENCES ChucNang(ChucNangID) ON DELETE CASCADE,
    CONSTRAINT UQ_PhanQuyen UNIQUE (VaiTroID, ChucNangID)
);
GO

CREATE TABLE NguoiDung (
    UserID          INT IDENTITY(1,1) PRIMARY KEY,
    TenDangNhap     VARCHAR(50) NOT NULL UNIQUE,
    MatKhauHash     VARCHAR(255) NOT NULL,
    HoTen           NVARCHAR(100) NOT NULL,
    Email           VARCHAR(100) NULL,
    GoogleSubject   VARCHAR(255) NULL,
    SoDienThoai     VARCHAR(15) NULL,
    AnhDaiDien      NVARCHAR(255) NULL,
    MaOTP            VARCHAR(255) NULL,
    MaOTPHetHan      DATETIME2 NULL,
    MaOTPGuiLuc      DATETIME2 NULL,
    MaOTPCuaSoBatDau DATETIME2 NULL,
    SoLanGuiOTP      INT NOT NULL DEFAULT 0,
    VaiTroID        INT NOT NULL,
    TrangThai       NVARCHAR(20) NOT NULL DEFAULT N'HoatDong'
                        CHECK (TrangThai IN (N'HoatDong', N'KhoaTaiKhoan', N'ChoDuyet')),
    NgayTao         DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    LanDangNhapCuoi DATETIME2 NULL,
    CONSTRAINT FK_NguoiDung_VaiTro FOREIGN KEY (VaiTroID) REFERENCES VaiTro(VaiTroID)
);
GO

-- Cho phep nhieu tai khoan khong co email; neu co email thi phai duy nhat.
CREATE UNIQUE INDEX UX_NguoiDung_Email
    ON NguoiDung(Email)
    WHERE Email IS NOT NULL;
GO

CREATE UNIQUE INDEX UX_NguoiDung_SoDienThoai
    ON NguoiDung(SoDienThoai)
    WHERE SoDienThoai IS NOT NULL;
GO

-- Dinh danh `sub` da duoc Google ky; moi tai khoan Google chi lien ket mot user.
CREATE UNIQUE INDEX UX_NguoiDung_GoogleSubject
    ON NguoiDung(GoogleSubject)
    WHERE GoogleSubject IS NOT NULL;
GO

CREATE TABLE NhatKyDangNhap (
    LogID           INT IDENTITY(1,1) PRIMARY KEY,
    UserID          INT NOT NULL,
    ThoiGianDangNhap DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    DiaChiIP        VARCHAR(50) NULL,
    ThietBi         NVARCHAR(100) NULL,
    KetQua          NVARCHAR(20) NOT NULL DEFAULT N'ThanhCong'
                        CHECK (KetQua IN (N'ThanhCong', N'ThatBai')),
    CONSTRAINT FK_NhatKyDangNhap_NguoiDung FOREIGN KEY (UserID) REFERENCES NguoiDung(UserID)
);
GO

/* =====================================================================
   NHOM 2: HO SO NGUOI CAO TUOI VA NGUOI CHAM SOC
   ===================================================================== */

CREATE TABLE HoSoNguoiCaoTuoi (
    NguoiCaoTuoiID  INT IDENTITY(1,1) PRIMARY KEY,
    UserID          INT NULL,
    HoTen           NVARCHAR(100) NOT NULL,
    NgaySinh        DATE NOT NULL,
    GioiTinh        NVARCHAR(10) NOT NULL CHECK (GioiTinh IN (N'Nam', N'Nữ', N'Khác')),
    CCCD            VARCHAR(20) NULL,
    DiaChi          NVARCHAR(255) NULL,
    SoDienThoai     VARCHAR(15) NULL,
    NhomMau         VARCHAR(5) NULL,
    BenhNen         NVARCHAR(500) NULL,
    DiUng           NVARCHAR(300) NULL,
    AnhDaiDien      NVARCHAR(255) NULL,
    TrangThai       NVARCHAR(25) NOT NULL DEFAULT N'DangTheoDoi'
                        CHECK (TrangThai IN (N'DangTheoDoi', N'CanChamSocDacBiet', N'NgungTheoDoi')),
    NguoiTaoID      INT NULL,
    NgayTao         DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_HoSoNCT_NguoiDung FOREIGN KEY (UserID) REFERENCES NguoiDung(UserID),
    CONSTRAINT FK_HoSoNCT_NguoiTao FOREIGN KEY (NguoiTaoID) REFERENCES NguoiDung(UserID)
);
GO

-- Ho so co the chua gan tai khoan/CCCD; gia tri da nhap van phai duy nhat.
CREATE UNIQUE INDEX UX_HoSoNCT_UserID
    ON HoSoNguoiCaoTuoi(UserID)
    WHERE UserID IS NOT NULL;
GO

CREATE UNIQUE INDEX UX_HoSoNCT_CCCD
    ON HoSoNguoiCaoTuoi(CCCD)
    WHERE CCCD IS NOT NULL;
GO

CREATE TABLE NguoiChamSoc (
    NguoiChamSocID  INT IDENTITY(1,1) PRIMARY KEY,
    UserID          INT NULL,
    HoTen           NVARCHAR(100) NOT NULL,
    SoDienThoai     VARCHAR(15) NOT NULL,
    Email           VARCHAR(100) NULL,
    DiaChi          NVARCHAR(255) NULL,
    NgheNghiep      NVARCHAR(100) NULL,
    NamKinhNghiem   INT NOT NULL DEFAULT 0 CHECK (NamKinhNghiem >= 0),
    TrangThai       NVARCHAR(20) NOT NULL DEFAULT N'DangLamViec'
                        CHECK (TrangThai IN (N'DangLamViec', N'TamNghi', N'NgungLamViec')),
    GhiChu          NVARCHAR(300) NULL,
    NgayTao         DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_NguoiChamSoc_NguoiDung FOREIGN KEY (UserID) REFERENCES NguoiDung(UserID)
);
GO

-- Mot tai khoan chi gan cho mot nguoi cham soc; cho phep nhieu NCS chua co tai khoan.
CREATE UNIQUE INDEX UX_NguoiChamSoc_UserID
    ON NguoiChamSoc(UserID)
    WHERE UserID IS NOT NULL;
GO

-- Moi nguoi cham soc dung mot email rieng de dang nhap va khoi phuc mat khau.
CREATE UNIQUE INDEX UX_NguoiChamSoc_Email
    ON NguoiChamSoc(Email)
    WHERE Email IS NOT NULL;
GO

-- Bang trung gian: 1 NCT co the co nhieu nguoi cham soc, 1 nguoi cham soc phu trach nhieu NCT
-- Cot MoiQuanHe phan biet than nhan ('Con ruot', 'Nguoi than'...) hay nhan vien ('Dieu duong'...)
CREATE TABLE NguoiCaoTuoi_NguoiChamSoc (
    ID              INT IDENTITY(1,1) PRIMARY KEY,
    NguoiCaoTuoiID  INT NOT NULL,
    NguoiChamSocID  INT NOT NULL,
    MoiQuanHe       NVARCHAR(50) NULL,
    LaChinh         BIT NOT NULL DEFAULT 0,
    NgayBatDau      DATE NOT NULL DEFAULT CAST(GETDATE() AS DATE),
    NgayKetThuc     DATE NULL, -- Moc het hieu luc, khong tinh ngay nay vao phan cong
    CONSTRAINT FK_NCT_NCS_NCT FOREIGN KEY (NguoiCaoTuoiID) REFERENCES HoSoNguoiCaoTuoi(NguoiCaoTuoiID) ON DELETE CASCADE,
    CONSTRAINT FK_NCT_NCS_NCS FOREIGN KEY (NguoiChamSocID) REFERENCES NguoiChamSoc(NguoiChamSocID),
    CONSTRAINT UQ_NCT_NCS UNIQUE (NguoiCaoTuoiID, NguoiChamSocID)
);
GO

-- Moi nguoi cao tuoi chi co toi da mot nguoi cham soc chinh dang hoat dong.
CREATE UNIQUE INDEX UX_NCT_NCS_OneActivePrimary
    ON NguoiCaoTuoi_NguoiChamSoc(NguoiCaoTuoiID)
    WHERE LaChinh = 1;
GO

CREATE TABLE LienHeKhanCap (
    LienHeID        INT IDENTITY(1,1) PRIMARY KEY,
    NguoiCaoTuoiID  INT NOT NULL,
    HoTen           NVARCHAR(100) NOT NULL,
    MoiQuanHe       NVARCHAR(50) NULL,
    SoDienThoai     VARCHAR(15) NOT NULL,
    SoDienThoaiPhu  VARCHAR(15) NULL,
    Email           VARCHAR(100) NULL,
    DiaChi          NVARCHAR(255) NULL,
    GhiChu          NVARCHAR(500) NULL,
    ThuTuUuTien     INT NOT NULL DEFAULT 1,
    CONSTRAINT FK_LienHeKhanCap_NCT FOREIGN KEY (NguoiCaoTuoiID) REFERENCES HoSoNguoiCaoTuoi(NguoiCaoTuoiID) ON DELETE CASCADE
);
GO

/* =====================================================================
   NHOM 3: DANH MUC THUOC VA LICH UONG THUOC
   ===================================================================== */

CREATE TABLE DanhMucThuoc (
    ThuocID         INT IDENTITY(1,1) PRIMARY KEY,
    TenThuoc        NVARCHAR(150) NOT NULL,
    HoatChat        NVARCHAR(150) NULL,
    DonViTinh       NVARCHAR(30) NOT NULL,
    NhaSanXuat      NVARCHAR(150) NULL,
    CachDung        NVARCHAR(300) NULL,
    TacDungPhu      NVARCHAR(500) NULL,
    MoTa            NVARCHAR(500) NULL,
    TrangThai       BIT NOT NULL DEFAULT 1
);
GO

CREATE TABLE DonThuoc (
    DonThuocID      INT IDENTITY(1,1) PRIMARY KEY,
    NguoiCaoTuoiID  INT NOT NULL,
    BacSiKeDon      NVARCHAR(100) NULL,
    NoiKeDon        NVARCHAR(150) NULL,
    NgayKeDon       DATE NOT NULL DEFAULT CAST(GETDATE() AS DATE),
    NgayBatDau      DATE NOT NULL,
    NgayKetThuc     DATE NULL,
    GhiChu          NVARCHAR(500) NULL,
    NguoiTaoID      INT NULL,
    NgayTao         DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_DonThuoc_NCT FOREIGN KEY (NguoiCaoTuoiID) REFERENCES HoSoNguoiCaoTuoi(NguoiCaoTuoiID) ON DELETE CASCADE,
    CONSTRAINT FK_DonThuoc_NguoiTao FOREIGN KEY (NguoiTaoID) REFERENCES NguoiDung(UserID)
);
GO

CREATE TABLE DonThuocChiTiet (
    DonThuocChiTietID INT IDENTITY(1,1) PRIMARY KEY,
    DonThuocID      INT NOT NULL,
    ThuocID         INT NOT NULL,
    LieuDung        NVARCHAR(100) NOT NULL,
    SoLanMoiNgay    INT NOT NULL DEFAULT 1,
    ThoiDiemUong    NVARCHAR(200) NULL,
    GhiChu          NVARCHAR(300) NULL,
    CONSTRAINT FK_DTCT_DonThuoc FOREIGN KEY (DonThuocID) REFERENCES DonThuoc(DonThuocID) ON DELETE CASCADE,
    CONSTRAINT FK_DTCT_Thuoc FOREIGN KEY (ThuocID) REFERENCES DanhMucThuoc(ThuocID)
);
GO

CREATE TABLE LichUongThuoc (
    LichUongThuocID INT IDENTITY(1,1) PRIMARY KEY,
    DonThuocChiTietID INT NOT NULL,
    NguoiCaoTuoiID  INT NOT NULL,
    ThoiGianDuKien  DATETIME2 NOT NULL,
    ThoiGianThucTe  DATETIME2 NULL,
    TrangThai       NVARCHAR(20) NOT NULL DEFAULT N'ChuaDenGio'
                        CHECK (TrangThai IN (N'ChuaDenGio', N'DaUong', N'BoLo', N'TuChoi')),
    NguoiXacNhanID  INT NULL,
    GhiChu          NVARCHAR(300) NULL,
    CONSTRAINT FK_LichUong_DTCT FOREIGN KEY (DonThuocChiTietID) REFERENCES DonThuocChiTiet(DonThuocChiTietID) ON DELETE CASCADE,
    CONSTRAINT FK_LichUong_NCT FOREIGN KEY (NguoiCaoTuoiID) REFERENCES HoSoNguoiCaoTuoi(NguoiCaoTuoiID),
    CONSTRAINT FK_LichUong_NguoiXacNhan FOREIGN KEY (NguoiXacNhanID) REFERENCES NguoiDung(UserID)
);
GO
CREATE INDEX IX_LichUongThuoc_ThoiGian ON LichUongThuoc(NguoiCaoTuoiID, ThoiGianDuKien);
GO
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

/* =====================================================================
   NHOM 4: LICH KHAM BENH
   ===================================================================== */

CREATE TABLE LichKhamBenh (
    LichKhamID      INT IDENTITY(1,1) PRIMARY KEY,
    NguoiCaoTuoiID  INT NOT NULL,
    TenBenhVien     NVARCHAR(200) NOT NULL,
    BacSiPhuTrach   NVARCHAR(100) NULL,
    ChuyenKhoa      NVARCHAR(100) NULL,
    ThoiGianKham    DATETIME2 NOT NULL,
    LyDoKham        NVARCHAR(300) NULL,
    TrangThai       NVARCHAR(20) NOT NULL DEFAULT N'ChuaDen'
                        CHECK (TrangThai IN (N'ChuaDen', N'DaKham', N'Huy', N'DaDoiLich')),
    KetQuaKham      NVARCHAR(500) NULL,
    NguoiTaoID      INT NULL,
    NgayTao         DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_LichKham_NCT FOREIGN KEY (NguoiCaoTuoiID) REFERENCES HoSoNguoiCaoTuoi(NguoiCaoTuoiID) ON DELETE CASCADE,
    CONSTRAINT FK_LichKham_NguoiTao FOREIGN KEY (NguoiTaoID) REFERENCES NguoiDung(UserID)
);
GO
CREATE INDEX IX_LichKhamBenh_ThoiGian ON LichKhamBenh(NguoiCaoTuoiID, ThoiGianKham);
GO

/* =====================================================================
   NHOM 5: CHI SO SUC KHOE
   ===================================================================== */

CREATE TABLE LoaiChiSoSucKhoe (
    LoaiChiSoID     INT IDENTITY(1,1) PRIMARY KEY,
    TenChiSo        NVARCHAR(100) NOT NULL UNIQUE,
    DonVi           NVARCHAR(20) NOT NULL,
    GiaTriMin       DECIMAL(10,2) NULL,
    GiaTriMax       DECIMAL(10,2) NULL,
    GiaTriMin2      DECIMAL(10,2) NULL,
    GiaTriMax2      DECIMAL(10,2) NULL,
    MoTa            NVARCHAR(300) NULL
);
GO

CREATE TABLE ChiSoSucKhoe (
    ChiSoID         INT IDENTITY(1,1) PRIMARY KEY,
    NguoiCaoTuoiID  INT NOT NULL,
    LoaiChiSoID     INT NOT NULL,
    GiaTri          DECIMAL(10,2) NOT NULL,
    GiaTriPhu       DECIMAL(10,2) NULL,
    ThoiGianDo      DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    NguoiDoID       INT NULL,
    LaBatThuong     BIT NOT NULL DEFAULT 0,
    GhiChu          NVARCHAR(300) NULL,
    CONSTRAINT FK_ChiSo_NCT FOREIGN KEY (NguoiCaoTuoiID) REFERENCES HoSoNguoiCaoTuoi(NguoiCaoTuoiID) ON DELETE CASCADE,
    CONSTRAINT FK_ChiSo_LoaiChiSo FOREIGN KEY (LoaiChiSoID) REFERENCES LoaiChiSoSucKhoe(LoaiChiSoID),
    CONSTRAINT FK_ChiSo_NguoiDo FOREIGN KEY (NguoiDoID) REFERENCES NguoiDung(UserID)
);
GO
CREATE INDEX IX_ChiSoSucKhoe_NCT_ThoiGian ON ChiSoSucKhoe(NguoiCaoTuoiID, ThoiGianDo);
GO

/* =====================================================================
   NHOM 6: CANH BAO VA THONG BAO
   ===================================================================== */

CREATE TABLE CanhBao (
    CanhBaoID       INT IDENTITY(1,1) PRIMARY KEY,
    NguoiCaoTuoiID  INT NOT NULL,
    LoaiCanhBao     NVARCHAR(30) NOT NULL
                        CHECK (LoaiCanhBao IN (N'NhacUongThuoc', N'NhacLichKham', N'ChiSoBatThuong', N'KhanCap', N'Khac')),
    NoiDung         NVARCHAR(500) NOT NULL,
    MucDo           NVARCHAR(20) NOT NULL DEFAULT N'TrungBinh'
                        CHECK (MucDo IN (N'Thap', N'TrungBinh', N'Cao', N'KhanCap')),
    NguonBang       NVARCHAR(50) NULL,
    NguonID         INT NULL,
    TrangThai       NVARCHAR(20) NOT NULL DEFAULT N'ChuaXuLy'
                        CHECK (TrangThai IN (N'ChuaXuLy', N'DaXem', N'DaXuLy', N'BoQua')),
    NgayTao         DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    NgayXuLy        DATETIME2 NULL,
    NguoiXuLyID     INT NULL,
    GhiChuXuLy      NVARCHAR(500) NULL,
    CONSTRAINT FK_CanhBao_NCT FOREIGN KEY (NguoiCaoTuoiID) REFERENCES HoSoNguoiCaoTuoi(NguoiCaoTuoiID) ON DELETE CASCADE,
    CONSTRAINT FK_CanhBao_NguoiXuLy FOREIGN KEY (NguoiXuLyID) REFERENCES NguoiDung(UserID)
);
GO
CREATE INDEX IX_CanhBao_NCT_TrangThai ON CanhBao(NguoiCaoTuoiID, TrangThai);
GO

CREATE TABLE CanhBaoKhanCap (
    CanhBaoKhanCapID INT IDENTITY(1,1) PRIMARY KEY,
    NguoiCaoTuoiID  INT NOT NULL,
    NguoiGuiID      INT NOT NULL,
    ViDo            DECIMAL(9,6) NULL,
    KinhDo          DECIMAL(9,6) NULL,
    NoiDung         NVARCHAR(500) NULL,
    TrangThai       NVARCHAR(20) NOT NULL DEFAULT N'DangGui'
                        CHECK (TrangThai IN (N'DangGui', N'DaTiepNhan', N'DaXuLy', N'Huy')),
    NgayGui         DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    NgayXuLy        DATETIME2 NULL,
    NguoiXuLyID     INT NULL,
    CONSTRAINT FK_CBKC_NCT FOREIGN KEY (NguoiCaoTuoiID) REFERENCES HoSoNguoiCaoTuoi(NguoiCaoTuoiID) ON DELETE CASCADE,
    CONSTRAINT FK_CBKC_NguoiGui FOREIGN KEY (NguoiGuiID) REFERENCES NguoiDung(UserID),
    CONSTRAINT FK_CBKC_NguoiXuLy FOREIGN KEY (NguoiXuLyID) REFERENCES NguoiDung(UserID)
);
GO

CREATE TABLE ThongBao (
    ThongBaoID      INT IDENTITY(1,1) PRIMARY KEY,
    UserID          INT NOT NULL,
    TieuDe          NVARCHAR(150) NOT NULL,
    NoiDung         NVARCHAR(500) NOT NULL,
    LoaiThongBao    NVARCHAR(30) NOT NULL DEFAULT N'HeThong'
                        CHECK (LoaiThongBao IN (N'NhacThuoc', N'NhacLichKham', N'CanhBaoChiSo', N'KhanCap', N'HeThong')),
    LienKetBang     NVARCHAR(50) NULL,
    LienKetID       INT NULL,
    DaDoc           BIT NOT NULL DEFAULT 0,
    NgayTao         DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_ThongBao_NguoiDung FOREIGN KEY (UserID) REFERENCES NguoiDung(UserID) ON DELETE CASCADE
);
GO
CREATE INDEX IX_ThongBao_User_DaDoc ON ThongBao(UserID, DaDoc);
GO

/* =====================================================================
   NHOM 7: NHAT KY CHAM SOC
   ===================================================================== */

CREATE TABLE NhatKyChamSoc (
    NhatKyID        INT IDENTITY(1,1) PRIMARY KEY,
    NguoiCaoTuoiID  INT NOT NULL,
    NguoiChamSocID  INT NULL,
    NgayGhi         DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    LoaiNhatKy      NVARCHAR(30) NOT NULL DEFAULT N'CHAM_SOC_HANG_NGAY'
                        CHECK (LoaiNhatKy IN (N'CHAM_SOC_HANG_NGAY', N'SU_CO', N'VAT_LY_TRI_LIEU', N'CANH_BAO')),
    HoatDong        NVARCHAR(200) NOT NULL,
    MoTaChiTiet     NVARCHAR(1000) NULL,
    HinhAnh         NVARCHAR(255) NULL,
    TrangThai       NVARCHAR(20) NOT NULL DEFAULT N'HOAN_THANH'
                        CHECK (TrangThai IN (N'HOAN_THANH', N'DANG_THUC_HIEN', N'HUY')),
    NgayTao         DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_NhatKy_NCT FOREIGN KEY (NguoiCaoTuoiID) REFERENCES HoSoNguoiCaoTuoi(NguoiCaoTuoiID) ON DELETE CASCADE,
    CONSTRAINT FK_NhatKy_NCS FOREIGN KEY (NguoiChamSocID) REFERENCES NguoiChamSoc(NguoiChamSocID)
);
GO
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

/* =====================================================================
   DU LIEU MAU: VAI TRO (3 vai tro)
   ===================================================================== */

INSERT INTO VaiTro (TenVaiTro, MoTa) VALUES
(N'QuanTriVien', N'Quan tri toan he thong, dung Web'),
(N'NguoiChamSoc', N'Nguoi cham soc quan ly nguoi cao tuoi duoc phan cong tren Web'),
(N'NguoiCaoTuoi', N'Nguoi cao tuoi su dung ung dung Mobile');
GO

/* =====================================================================
   DU LIEU MAU: DANH MUC CHUC NANG
   ===================================================================== */

INSERT INTO ChucNang (MaChucNang, TenChucNang, NhomChucNang) VALUES
('QLNGUOIDUNG', N'Quan ly nguoi dung', N'He thong'),
('QLHOSONCT', N'Quan ly ho so nguoi cao tuoi', N'Ho so'),
('QLNGUOICHAMSOC', N'Quan ly nguoi cham soc', N'Ho so'),
('QLTHUOC', N'Quan ly danh muc thuoc', N'Thuoc'),
('QLLICHUONGTHUOC', N'Theo doi lich uong thuoc', N'Thuoc'),
('QLLICHKHAM', N'Theo doi lich kham benh', N'Kham benh'),
('QLCHISOSK', N'Cap nhat, theo doi chi so suc khoe', N'Suc khoe'),
('QLCANHBAO', N'Quan ly canh bao, thong bao', N'Canh bao'),
('QLLIENHEKC', N'Quan ly lien he khan cap', N'Canh bao'),
('QLNHATKY', N'Nhat ky cham soc', N'Cham soc'),
('QLBAOCAO', N'Thong ke, bao cao', N'Bao cao');
GO

/* =====================================================================
   DU LIEU MAU: LOAI CHI SO SUC KHOE
   ===================================================================== */

INSERT INTO LoaiChiSoSucKhoe (TenChiSo, DonVi, GiaTriMin, GiaTriMax, GiaTriMin2, GiaTriMax2, MoTa) VALUES
(N'Huyết áp', N'mmHg', 90, 140, 60, 90, N'GiaTri = tam thu, GiaTriPhu = tam truong'),
(N'Nhịp tim', N'lần/phút', 60, 100, NULL, NULL, N'Nhip tim khi nghi'),
(N'Đường huyết', N'mg/dL', 70, 140, NULL, NULL, N'Do luc doi hoac sau an'),
(N'Nhiệt độ cơ thể', N'°C', 36.1, 37.5, NULL, NULL, NULL),
(N'SpO2', N'%', 95, 100, NULL, NULL, N'Nong do oxy trong mau'),
(N'Cân nặng', N'kg', NULL, NULL, NULL, NULL, N'Theo doi bien dong can nang theo thoi gian');
GO

/* =====================================================================
   DU LIEU MAU: PHAN QUYEN (3 vai tro)
   - QuanTriVien + NguoiChamSoc: dung Web
   - NguoiCaoTuoi: dung Mobile va chi truy cap du lieu cua minh
   ===================================================================== */

DECLARE @Quyen TABLE (TenVaiTro NVARCHAR(50), MaChucNang VARCHAR(50), Xem BIT, Them BIT, Sua BIT, Xoa BIT);

INSERT INTO @Quyen VALUES
-- QuanTriVien: toan quyen moi chuc nang
(N'QuanTriVien','QLNGUOIDUNG',1,1,1,1),(N'QuanTriVien','QLHOSONCT',1,1,1,1),
(N'QuanTriVien','QLNGUOICHAMSOC',1,1,1,1),(N'QuanTriVien','QLTHUOC',1,1,1,1),
(N'QuanTriVien','QLLICHUONGTHUOC',1,1,1,1),(N'QuanTriVien','QLLICHKHAM',1,1,1,1),
(N'QuanTriVien','QLCHISOSK',1,1,1,1),(N'QuanTriVien','QLCANHBAO',1,1,1,1),
(N'QuanTriVien','QLLIENHEKC',1,1,1,1),(N'QuanTriVien','QLNHATKY',1,1,1,1),
(N'QuanTriVien','QLBAOCAO',1,1,1,1),

-- NguoiChamSoc: dung Web, quyen gioi han trong pham vi NCT minh phu trach
(N'NguoiChamSoc','QLNGUOIDUNG',0,0,0,0),(N'NguoiChamSoc','QLHOSONCT',1,0,1,0),
(N'NguoiChamSoc','QLNGUOICHAMSOC',1,0,0,0),(N'NguoiChamSoc','QLTHUOC',1,1,1,0),
(N'NguoiChamSoc','QLLICHUONGTHUOC',1,1,1,0),(N'NguoiChamSoc','QLLICHKHAM',1,1,1,0),
(N'NguoiChamSoc','QLCHISOSK',1,1,1,0),(N'NguoiChamSoc','QLCANHBAO',1,1,1,0),
(N'NguoiChamSoc','QLLIENHEKC',1,1,1,1),(N'NguoiChamSoc','QLNHATKY',1,1,1,1),
(N'NguoiChamSoc','QLBAOCAO',1,0,0,0),

-- NguoiCaoTuoi: dung Mobile, chi xem/cap nhat du lieu cua chinh minh
(N'NguoiCaoTuoi','QLNGUOIDUNG',0,0,0,0),(N'NguoiCaoTuoi','QLHOSONCT',1,0,1,0),
(N'NguoiCaoTuoi','QLNGUOICHAMSOC',1,0,0,0),(N'NguoiCaoTuoi','QLTHUOC',1,0,0,0),
(N'NguoiCaoTuoi','QLLICHUONGTHUOC',1,0,1,0),(N'NguoiCaoTuoi','QLLICHKHAM',1,0,0,0),
(N'NguoiCaoTuoi','QLCHISOSK',1,1,0,0),(N'NguoiCaoTuoi','QLCANHBAO',1,1,0,0),
(N'NguoiCaoTuoi','QLLIENHEKC',1,0,0,0),(N'NguoiCaoTuoi','QLNHATKY',1,0,0,0),
(N'NguoiCaoTuoi','QLBAOCAO',0,0,0,0);

INSERT INTO PhanQuyen (VaiTroID, ChucNangID, ChoPhepXem, ChoPhepThem, ChoPhepSua, ChoPhepXoa)
SELECT vt.VaiTroID, cn.ChucNangID, q.Xem, q.Them, q.Sua, q.Xoa
FROM @Quyen q
JOIN VaiTro vt ON vt.TenVaiTro = q.TenVaiTro
JOIN ChucNang cn ON cn.MaChucNang = q.MaChucNang;
GO

PRINT N'Da tao schema va quyen cho 3 vai tro cu; tiep tuc cai dat NguoiThan.';
GO

-- RELATIVES_PATCH_BEGIN
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

GO
-- RELATIVES_PATCH_END
PRINT N'Hoan tat: 4 vai tro, 11 chuc nang, 44 dong phan quyen.';
GO
