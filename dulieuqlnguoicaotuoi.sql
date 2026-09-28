/* =====================================================================
   ĐỒ ÁN: HỆ THỐNG QUẢN LÝ VÀ CẢNH BÁO CHĂM SÓC SỨC KHỎE NGƯỜI CAO TUỔI
   CSDL: SQL Server
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
 
/* =====================================================================
   NHÓM 1: QUẢN LÝ NGƯỜI DÙNG VÀ PHÂN QUYỀN
   ===================================================================== */
 
-- Vai trò trong hệ thống (Admin, Bác sĩ, Người chăm sóc, Người cao tuổi, Người thân...)
CREATE TABLE VaiTro (
    VaiTroID        INT IDENTITY(1,1) PRIMARY KEY,
    TenVaiTro       NVARCHAR(50) NOT NULL UNIQUE,
    MoTa            NVARCHAR(200) NULL
);
GO
 
-- Danh sách các chức năng/module trong hệ thống (dùng để phân quyền chi tiết)
CREATE TABLE ChucNang (
    ChucNangID      INT IDENTITY(1,1) PRIMARY KEY,
    MaChucNang      VARCHAR(50) NOT NULL UNIQUE,
    TenChucNang     NVARCHAR(150) NOT NULL,
    NhomChucNang    NVARCHAR(100) NULL      -- VD: 'Hồ sơ', 'Thuốc', 'Cảnh báo'...
);
GO
 
-- Ma trận phân quyền: mỗi vai trò được Xem/Thêm/Sửa/Xóa với từng chức năng
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
 
-- Tài khoản người dùng (dùng chung cho cả Web và Mobile)
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

-- Email có thể để trống ở nhiều tài khoản, nhưng nếu đã nhập thì phải là duy nhất
CREATE UNIQUE INDEX UQ_NguoiDung_Email ON NguoiDung(Email) WHERE Email IS NOT NULL;
GO
 
-- Nhật ký đăng nhập (phục vụ audit, bảo mật cho cả Web/Mobile)
CREATE TABLE NhatKyDangNhap (
    LogID           INT IDENTITY(1,1) PRIMARY KEY,
    UserID          INT NOT NULL,
    ThoiGianDangNhap DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    DiaChiIP        VARCHAR(50) NULL,
    ThietBi         NVARCHAR(100) NULL,     -- VD: 'Web', 'Android', 'iOS'
    KetQua          NVARCHAR(20) NOT NULL DEFAULT N'ThanhCong'
                        CHECK (KetQua IN (N'ThanhCong', N'ThatBai')),
    CONSTRAINT FK_NhatKyDangNhap_NguoiDung FOREIGN KEY (UserID) REFERENCES NguoiDung(UserID)
);
GO
 
/* =====================================================================
   NHÓM 2: HỒ SƠ NGƯỜI CAO TUỔI VÀ NGƯỜI CHĂM SÓC
   ===================================================================== */
 
-- Hồ sơ người cao tuổi (có thể có hoặc không có tài khoản đăng nhập riêng)
CREATE TABLE HoSoNguoiCaoTuoi (
    NguoiCaoTuoiID  INT IDENTITY(1,1) PRIMARY KEY,
    UserID          INT NULL UNIQUE,        -- liên kết tài khoản mobile nếu NCT tự dùng app
    HoTen           NVARCHAR(100) NOT NULL,
    NgaySinh        DATE NOT NULL,
    GioiTinh        NVARCHAR(10) NOT NULL CHECK (GioiTinh IN (N'Nam', N'Nữ', N'Khác')),
    CCCD            VARCHAR(20) NULL,
    DiaChi          NVARCHAR(255) NULL,
    SoDienThoai     VARCHAR(15) NULL,
    NhomMau         VARCHAR(5) NULL,
    BenhNen         NVARCHAR(500) NULL,     -- các bệnh nền, mãn tính
    DiUng           NVARCHAR(300) NULL,     -- dị ứng thuốc/thực phẩm
    AnhDaiDien      NVARCHAR(255) NULL,
    TrangThai       NVARCHAR(20) NOT NULL DEFAULT N'DangTheoDoi'
                        CHECK (TrangThai IN (N'DangTheoDoi', N'NgungTheoDoi')),
    NguoiTaoID      INT NULL,
    NgayTao         DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_HoSoNCT_NguoiDung FOREIGN KEY (UserID) REFERENCES NguoiDung(UserID),
    CONSTRAINT FK_HoSoNCT_NguoiTao FOREIGN KEY (NguoiTaoID) REFERENCES NguoiDung(UserID)
);
GO

-- CCCD có thể để trống ở nhiều hồ sơ, nhưng nếu đã nhập thì phải là duy nhất
CREATE UNIQUE INDEX UQ_HoSoNCT_CCCD ON HoSoNguoiCaoTuoi(CCCD) WHERE CCCD IS NOT NULL;
GO
 
-- Thông tin người chăm sóc (có tài khoản để dùng Web/Mobile)
CREATE TABLE NguoiChamSoc (
    NguoiChamSocID  INT IDENTITY(1,1) PRIMARY KEY,
    UserID          INT NOT NULL UNIQUE,
    HoTen           NVARCHAR(100) NOT NULL,
    SoDienThoai     VARCHAR(15) NOT NULL,
    Email           VARCHAR(100) NULL,
    DiaChi          NVARCHAR(255) NULL,
    NgheNghiep      NVARCHAR(100) NULL,
    GhiChu          NVARCHAR(300) NULL,
    NgayTao         DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_NguoiChamSoc_NguoiDung FOREIGN KEY (UserID) REFERENCES NguoiDung(UserID)
);
GO
 
-- Bảng trung gian: một NCT có thể có nhiều người chăm sóc, một người chăm sóc có thể phụ trách nhiều NCT
CREATE TABLE NguoiCaoTuoi_NguoiChamSoc (
    ID              INT IDENTITY(1,1) PRIMARY KEY,
    NguoiCaoTuoiID  INT NOT NULL,
    NguoiChamSocID  INT NOT NULL,
    MoiQuanHe       NVARCHAR(50) NULL,      -- VD: Con ruột, Điều dưỡng, Người thân...
    LaChinh         BIT NOT NULL DEFAULT 0, -- người chăm sóc chính
    NgayBatDau      DATE NOT NULL DEFAULT CAST(GETDATE() AS DATE),
    NgayKetThuc     DATE NULL,
    CONSTRAINT FK_NCT_NCS_NCT FOREIGN KEY (NguoiCaoTuoiID) REFERENCES HoSoNguoiCaoTuoi(NguoiCaoTuoiID) ON DELETE CASCADE,
    CONSTRAINT FK_NCT_NCS_NCS FOREIGN KEY (NguoiChamSocID) REFERENCES NguoiChamSoc(NguoiChamSocID),
    CONSTRAINT UQ_NCT_NCS UNIQUE (NguoiCaoTuoiID, NguoiChamSocID)
);
GO
 
-- Danh sách liên hệ khẩn cấp của từng người cao tuổi (có thể trùng/khác người chăm sóc)
CREATE TABLE LienHeKhanCap (
    LienHeID        INT IDENTITY(1,1) PRIMARY KEY,
    NguoiCaoTuoiID  INT NOT NULL,
    HoTen           NVARCHAR(100) NOT NULL,
    MoiQuanHe       NVARCHAR(50) NULL,
    SoDienThoai     VARCHAR(15) NOT NULL,
    DiaChi          NVARCHAR(255) NULL,
    ThuTuUuTien     INT NOT NULL DEFAULT 1, -- 1 = ưu tiên gọi đầu tiên
    CONSTRAINT FK_LienHeKhanCap_NCT FOREIGN KEY (NguoiCaoTuoiID) REFERENCES HoSoNguoiCaoTuoi(NguoiCaoTuoiID) ON DELETE CASCADE
);
GO
 
/* =====================================================================
   NHÓM 3: DANH MỤC THUỐC VÀ LỊCH UỐNG THUỐC
   ===================================================================== */
 
-- Danh mục thuốc dùng chung toàn hệ thống
CREATE TABLE DanhMucThuoc (
    ThuocID         INT IDENTITY(1,1) PRIMARY KEY,
    TenThuoc        NVARCHAR(150) NOT NULL,
    HoatChat        NVARCHAR(150) NULL,
    DonViTinh       NVARCHAR(30) NOT NULL,      -- viên, ml, gói...
    NhaSanXuat      NVARCHAR(150) NULL,
    CachDung        NVARCHAR(300) NULL,
    TacDungPhu      NVARCHAR(500) NULL,
    MoTa            NVARCHAR(500) NULL,
    TrangThai       BIT NOT NULL DEFAULT 1      -- 1 = đang sử dụng trong danh mục
);
GO
 
-- Đơn thuốc (do bác sĩ kê hoặc người chăm sóc/nhân viên nhập)
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
 
-- Chi tiết đơn thuốc: mỗi đơn gồm nhiều loại thuốc, mỗi loại có liều dùng riêng
CREATE TABLE DonThuocChiTiet (
    DonThuocChiTietID INT IDENTITY(1,1) PRIMARY KEY,
    DonThuocID      INT NOT NULL,
    ThuocID         INT NOT NULL,
    LieuDung        NVARCHAR(100) NOT NULL,     -- VD: '1 viên/lần'
    SoLanMoiNgay    INT NOT NULL DEFAULT 1,
    ThoiDiemUong    NVARCHAR(200) NULL,         -- VD: 'Sáng 07:00, Tối 19:00'
    GhiChu          NVARCHAR(300) NULL,
    CONSTRAINT FK_DTCT_DonThuoc FOREIGN KEY (DonThuocID) REFERENCES DonThuoc(DonThuocID) ON DELETE CASCADE,
    CONSTRAINT FK_DTCT_Thuoc FOREIGN KEY (ThuocID) REFERENCES DanhMucThuoc(ThuocID)
);
GO
 
-- Lịch uống thuốc cụ thể theo từng thời điểm (sinh ra từ DonThuocChiTiet) + trạng thái theo dõi thực tế
CREATE TABLE LichUongThuoc (
    LichUongThuocID INT IDENTITY(1,1) PRIMARY KEY,
    DonThuocChiTietID INT NOT NULL,
    NguoiCaoTuoiID  INT NOT NULL,
    ThoiGianDuKien  DATETIME2 NOT NULL,
    ThoiGianThucTe  DATETIME2 NULL,
    TrangThai       NVARCHAR(20) NOT NULL DEFAULT N'ChuaDenGio'
                        CHECK (TrangThai IN (N'ChuaDenGio', N'DaUong', N'BoLo', N'TuChoi')),
    NguoiXacNhanID  INT NULL,               -- ai xác nhận đã cho uống thuốc (mobile)
    GhiChu          NVARCHAR(300) NULL,
    CONSTRAINT FK_LichUong_DTCT FOREIGN KEY (DonThuocChiTietID) REFERENCES DonThuocChiTiet(DonThuocChiTietID) ON DELETE CASCADE,
    CONSTRAINT FK_LichUong_NCT FOREIGN KEY (NguoiCaoTuoiID) REFERENCES HoSoNguoiCaoTuoi(NguoiCaoTuoiID),
    CONSTRAINT FK_LichUong_NguoiXacNhan FOREIGN KEY (NguoiXacNhanID) REFERENCES NguoiDung(UserID)
);
GO
CREATE INDEX IX_LichUongThuoc_ThoiGian ON LichUongThuoc(NguoiCaoTuoiID, ThoiGianDuKien);
GO
 
/* =====================================================================
   NHÓM 4: LỊCH KHÁM BỆNH
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
   NHÓM 5: CHỈ SỐ SỨC KHỎE
   ===================================================================== */
 
-- Danh mục loại chỉ số (huyết áp, nhịp tim, đường huyết, nhiệt độ, cân nặng, SpO2...)
CREATE TABLE LoaiChiSoSucKhoe (
    LoaiChiSoID     INT IDENTITY(1,1) PRIMARY KEY,
    TenChiSo        NVARCHAR(100) NOT NULL UNIQUE,
    DonVi           NVARCHAR(20) NOT NULL,
    GiaTriMin       DECIMAL(10,2) NULL,     -- ngưỡng bình thường thấp nhất
    GiaTriMax       DECIMAL(10,2) NULL,     -- ngưỡng bình thường cao nhất
    GiaTriMin2      DECIMAL(10,2) NULL,     -- dùng cho chỉ số có 2 giá trị, VD huyết áp tâm trương
    GiaTriMax2      DECIMAL(10,2) NULL,
    MoTa            NVARCHAR(300) NULL
);
GO
 
-- Chỉ số sức khỏe được đo/cập nhật theo thời gian
CREATE TABLE ChiSoSucKhoe (
    ChiSoID         INT IDENTITY(1,1) PRIMARY KEY,
    NguoiCaoTuoiID  INT NOT NULL,
    LoaiChiSoID     INT NOT NULL,
    GiaTri          DECIMAL(10,2) NOT NULL,     -- VD: huyết áp tâm thu, hoặc giá trị chính
    GiaTriPhu       DECIMAL(10,2) NULL,         -- VD: huyết áp tâm trương
    ThoiGianDo      DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    NguoiDoID       INT NULL,                   -- ai đo/nhập (mobile hoặc web)
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
   NHÓM 6: CẢNH BÁO VÀ THÔNG BÁO
   ===================================================================== */
 
-- Cảnh báo hệ thống: nhắc uống thuốc, nhắc lịch khám, chỉ số bất thường...
-- Bảng này đồng thời đóng vai trò LỊCH SỬ CẢNH BÁO (lưu qua TrangThai + NgayXuLy)
CREATE TABLE CanhBao (
    CanhBaoID       INT IDENTITY(1,1) PRIMARY KEY,
    NguoiCaoTuoiID  INT NOT NULL,
    LoaiCanhBao     NVARCHAR(30) NOT NULL
                        CHECK (LoaiCanhBao IN (N'NhacUongThuoc', N'NhacLichKham', N'ChiSoBatThuong', N'KhanCap', N'Khac')),
    NoiDung         NVARCHAR(500) NOT NULL,
    MucDo           NVARCHAR(20) NOT NULL DEFAULT N'TrungBinh'
                        CHECK (MucDo IN (N'Thap', N'TrungBinh', N'Cao', N'KhanCap')),
    NguonBang       NVARCHAR(50) NULL,      -- tên bảng nguồn phát sinh cảnh báo (VD: 'LichUongThuoc')
    NguonID         INT NULL,               -- ID bản ghi nguồn tương ứng
    TrangThai       NVARCHAR(20) NOT NULL DEFAULT N'ChuaXuLy'
                        CHECK (TrangThai IN (N'ChuaXuLy', N'DaXem', N'DaXuLy', N'BoQua')),
    NgayTao         DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    NgayXuLy        DATETIME2 NULL,
    NguoiXuLyID     INT NULL,
    CONSTRAINT FK_CanhBao_NCT FOREIGN KEY (NguoiCaoTuoiID) REFERENCES HoSoNguoiCaoTuoi(NguoiCaoTuoiID) ON DELETE CASCADE,
    CONSTRAINT FK_CanhBao_NguoiXuLy FOREIGN KEY (NguoiXuLyID) REFERENCES NguoiDung(UserID)
);
GO
CREATE INDEX IX_CanhBao_NCT_TrangThai ON CanhBao(NguoiCaoTuoiID, TrangThai);
GO
 
-- Cảnh báo khẩn cấp gửi từ Mobile (nút SOS) - tách riêng vì cần thêm vị trí GPS, mức độ ưu tiên xử lý
CREATE TABLE CanhBaoKhanCap (
    CanhBaoKhanCapID INT IDENTITY(1,1) PRIMARY KEY,
    NguoiCaoTuoiID  INT NOT NULL,
    NguoiGuiID      INT NOT NULL,           -- tài khoản gửi cảnh báo (NCT hoặc người chăm sóc)
    ViDo            DECIMAL(9,6) NULL,      -- vĩ độ GPS
    KinhDo          DECIMAL(9,6) NULL,      -- kinh độ GPS
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
 
-- Thông báo đẩy tới người dùng (Web/Mobile) - nhắc lịch, thông báo hệ thống, phản hồi cảnh báo...
CREATE TABLE ThongBao (
    ThongBaoID      INT IDENTITY(1,1) PRIMARY KEY,
    UserID          INT NOT NULL,           -- người nhận
    TieuDe          NVARCHAR(150) NOT NULL,
    NoiDung         NVARCHAR(500) NOT NULL,
    LoaiThongBao    NVARCHAR(30) NOT NULL DEFAULT N'HeThong'
                        CHECK (LoaiThongBao IN (N'NhacThuoc', N'NhacLichKham', N'CanhBaoChiSo', N'KhanCap', N'HeThong')),
    LienKetBang     NVARCHAR(50) NULL,      -- bảng liên quan, VD 'CanhBao'
    LienKetID       INT NULL,
    DaDoc           BIT NOT NULL DEFAULT 0,
    NgayTao         DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_ThongBao_NguoiDung FOREIGN KEY (UserID) REFERENCES NguoiDung(UserID) ON DELETE CASCADE
);
GO
CREATE INDEX IX_ThongBao_User_DaDoc ON ThongBao(UserID, DaDoc);
GO
 
/* =====================================================================
   NHÓM 7: NHẬT KÝ CHĂM SÓC
   ===================================================================== */
 
CREATE TABLE NhatKyChamSoc (
    NhatKyID        INT IDENTITY(1,1) PRIMARY KEY,
    NguoiCaoTuoiID  INT NOT NULL,
    NguoiChamSocID  INT NULL,
    NgayGhi         DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    HoatDong        NVARCHAR(200) NOT NULL,     -- VD: 'Ăn sáng', 'Tập vật lý trị liệu'
    MoTaChiTiet     NVARCHAR(1000) NULL,
    HinhAnh         NVARCHAR(255) NULL,
    NgayTao         DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_NhatKy_NCT FOREIGN KEY (NguoiCaoTuoiID) REFERENCES HoSoNguoiCaoTuoi(NguoiCaoTuoiID) ON DELETE CASCADE,
    CONSTRAINT FK_NhatKy_NCS FOREIGN KEY (NguoiChamSocID) REFERENCES NguoiChamSoc(NguoiChamSocID)
);
GO
 
/* =====================================================================
   DỮ LIỆU MẪU CHO CÁC BẢNG DANH MỤC (LOOKUP)
   ===================================================================== */
 
INSERT INTO VaiTro (TenVaiTro, MoTa) VALUES
(N'QuanTriVien', N'Quản trị toàn hệ thống'),
(N'BacSi', N'Bác sĩ / nhân viên y tế theo dõi'),
(N'NguoiChamSoc', N'Người chăm sóc / người thân'),
(N'NguoiCaoTuoi', N'Người cao tuổi sử dụng ứng dụng Mobile');
GO
 
INSERT INTO ChucNang (MaChucNang, TenChucNang, NhomChucNang) VALUES
('QLNGUOIDUNG', N'Quản lý người dùng', N'Hệ thống'),
('QLHOSONCT', N'Quản lý hồ sơ người cao tuổi', N'Hồ sơ'),
('QLNGUOICHAMSOC', N'Quản lý người chăm sóc', N'Hồ sơ'),
('QLTHUOC', N'Quản lý danh mục thuốc', N'Thuốc'),
('QLLICHUONGTHUOC', N'Theo dõi lịch uống thuốc', N'Thuốc'),
('QLLICHKHAM', N'Theo dõi lịch khám bệnh', N'Khám bệnh'),
('QLCHISOSK', N'Cập nhật, theo dõi chỉ số sức khỏe', N'Sức khỏe'),
('QLCANHBAO', N'Quản lý cảnh báo, thông báo', N'Cảnh báo'),
('QLLIENHEKC', N'Quản lý liên hệ khẩn cấp', N'Cảnh báo'),
('QLNHATKY', N'Nhật ký chăm sóc', N'Chăm sóc'),
('QLBAOCAO', N'Thống kê, báo cáo', N'Báo cáo');
GO
 
INSERT INTO LoaiChiSoSucKhoe (TenChiSo, DonVi, GiaTriMin, GiaTriMax, GiaTriMin2, GiaTriMax2, MoTa) VALUES
(N'Huyết áp', N'mmHg', 90, 140, 60, 90, N'GiaTri = tâm thu, GiaTriPhu = tâm trương'),
(N'Nhịp tim', N'lần/phút', 60, 100, NULL, NULL, N'Nhịp tim khi nghỉ'),
(N'Đường huyết', N'mg/dL', 70, 140, NULL, NULL, N'Đo lúc đói hoặc sau ăn'),
(N'Nhiệt độ cơ thể', N'°C', 36.1, 37.5, NULL, NULL, NULL),
(N'SpO2', N'%', 95, 100, NULL, NULL, N'Nồng độ oxy trong máu'),
(N'Cân nặng', N'kg', NULL, NULL, NULL, NULL, N'Theo dõi biến động cân nặng theo thời gian');
GO
 
PRINT N'Tạo cơ sở dữ liệu QLSucKhoeNguoiCaoTuoi hoàn tất.';
GO