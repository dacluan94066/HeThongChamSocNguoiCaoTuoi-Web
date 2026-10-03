/* =====================================================================
   DO AN: HE THONG QUAN LY VA CANH BAO CHAM SOC SUC KHOE NGUOI CAO TUOI
   CSDL: SQL Server
   File nay tao database + toan bo bang + danh muc + 44 dong phan quyen.
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
    SoDienThoai     VARCHAR(15) NULL,
    AnhDaiDien      NVARCHAR(255) NULL,
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

-- Bang trung gian: 1 NCT co the co nhieu nguoi cham soc, 1 nguoi cham soc phu trach nhieu NCT
-- Cot MoiQuanHe phan biet than nhan ('Con ruot', 'Nguoi than'...) hay nhan vien ('Dieu duong'...)
CREATE TABLE NguoiCaoTuoi_NguoiChamSoc (
    ID              INT IDENTITY(1,1) PRIMARY KEY,
    NguoiCaoTuoiID  INT NOT NULL,
    NguoiChamSocID  INT NOT NULL,
    MoiQuanHe       NVARCHAR(50) NULL,
    LaChinh         BIT NOT NULL DEFAULT 0,
    NgayBatDau      DATE NOT NULL DEFAULT CAST(GETDATE() AS DATE),
    NgayKetThuc     DATE NULL,
    CONSTRAINT FK_NCT_NCS_NCT FOREIGN KEY (NguoiCaoTuoiID) REFERENCES HoSoNguoiCaoTuoi(NguoiCaoTuoiID) ON DELETE CASCADE,
    CONSTRAINT FK_NCT_NCS_NCS FOREIGN KEY (NguoiChamSocID) REFERENCES NguoiChamSoc(NguoiChamSocID),
    CONSTRAINT UQ_NCT_NCS UNIQUE (NguoiCaoTuoiID, NguoiChamSocID)
);
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

/* =====================================================================
   DU LIEU MAU: VAI TRO (4 vai tro - khong co Y ta)
   ===================================================================== */

INSERT INTO VaiTro (TenVaiTro, MoTa) VALUES
(N'QuanTriVien', N'Quan tri toan he thong, dung Web'),
(N'BacSi', N'Bac si - chuyen mon y te, dung Web'),
(N'NguoiChamSoc', N'Nguoi cham soc / nguoi than (bao gom ca than nhan va dieu duong, phan biet qua cot MoiQuanHe) - dung Mobile'),
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
   DU LIEU MAU: PHAN QUYEN (Mo hinh B)
   - QuanTriVien + BacSi: dung duoc Web
   - NguoiChamSoc + NguoiCaoTuoi: chi dung Mobile (chan o tang API dang nhap,
     xem server/src/controllers/auth.controller.js - kiem tra "platform")
   - Du 2 vai tro duoi khong dung Web, van can quyen tren API vi Mobile
     goi chung 1 bo API nay
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

-- BacSi: dong bo voi server/seed_phanquyen.js
(N'BacSi','QLNGUOIDUNG',0,0,0,0),(N'BacSi','QLHOSONCT',1,1,1,0),
(N'BacSi','QLNGUOICHAMSOC',1,1,1,0),(N'BacSi','QLTHUOC',1,1,1,0),
(N'BacSi','QLLICHUONGTHUOC',1,1,1,1),(N'BacSi','QLLICHKHAM',1,1,1,1),
(N'BacSi','QLCHISOSK',1,1,1,0),(N'BacSi','QLCANHBAO',1,1,1,0),
(N'BacSi','QLLIENHEKC',1,1,1,0),(N'BacSi','QLNHATKY',1,1,1,0),
(N'BacSi','QLBAOCAO',1,0,0,0),

-- NguoiChamSoc: dung Mobile, quyen gioi han trong pham vi NCT minh phu trach
(N'NguoiChamSoc','QLNGUOIDUNG',0,0,0,0),(N'NguoiChamSoc','QLHOSONCT',1,0,1,0),
(N'NguoiChamSoc','QLNGUOICHAMSOC',1,0,0,0),(N'NguoiChamSoc','QLTHUOC',1,0,0,0),
(N'NguoiChamSoc','QLLICHUONGTHUOC',1,1,1,0),(N'NguoiChamSoc','QLLICHKHAM',1,1,1,0),
(N'NguoiChamSoc','QLCHISOSK',1,1,1,0),(N'NguoiChamSoc','QLCANHBAO',1,1,1,0),
(N'NguoiChamSoc','QLLIENHEKC',1,1,1,0),(N'NguoiChamSoc','QLNHATKY',1,1,1,0),
(N'NguoiChamSoc','QLBAOCAO',1,0,0,0),

-- NguoiCaoTuoi: dung Mobile, chi xem/cap nhat du lieu cua chinh minh
(N'NguoiCaoTuoi','QLNGUOIDUNG',0,0,0,0),(N'NguoiCaoTuoi','QLHOSONCT',1,0,0,0),
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

PRINT N'Tao CSDL QLSucKhoeNguoiCaoTuoi hoan tat - 4 vai tro, 11 chuc nang, 44 dong phan quyen.';
GO
