/* =====================================================================
   DU LIEU MAU DAY DU - HE THONG QL SUC KHOE NGUOI CAO TUOI

   Cach dung:
   1. Chay QLSucKhoeNguoiCaoTuoi_FINAL.sql
   2. Chay: cd server && node seed_users.js
   3. Mo file nay trong SSMS va nhan F5

   Script an toan khi chay lai: chi them cac ban ghi mau chua ton tai.
   ===================================================================== */

USE QLSucKhoeNguoiCaoTuoi;
SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @AdminID INT = (SELECT UserID FROM NguoiDung WHERE TenDangNhap = 'admin');
    DECLARE @DoctorID INT = (SELECT UserID FROM NguoiDung WHERE TenDangNhap = 'doctor01');
    DECLARE @NurseID INT = (SELECT UserID FROM NguoiDung WHERE TenDangNhap = 'nurse01');
    DECLARE @CaregiverUserID INT = (SELECT UserID FROM NguoiDung WHERE TenDangNhap = 'caregiver01');

    IF @AdminID IS NULL OR @DoctorID IS NULL OR @CaregiverUserID IS NULL
        THROW 50001, N'Chua co tai khoan demo. Hay chay server/seed_users.js truoc.', 1;

    IF @NurseID IS NULL SET @NurseID = @DoctorID;

    /* ================================================================
       1. HO SO NGUOI CAO TUOI
       ================================================================ */
    IF NOT EXISTS (SELECT 1 FROM HoSoNguoiCaoTuoi WHERE CCCD = '079047000101')
        INSERT INTO HoSoNguoiCaoTuoi
            (HoTen, NgaySinh, GioiTinh, CCCD, DiaChi, SoDienThoai, NhomMau, BenhNen, DiUng, TrangThai, NguoiTaoID)
        VALUES
            (N'Nguyễn Văn An', '1947-03-12', N'Nam', '079047000101', N'Quận 3, TP. Hồ Chí Minh', '0908000101', 'O+',
             N'Tăng huyết áp, rối loạn lipid máu', N'Không ghi nhận', N'DangTheoDoi', @AdminID);

    IF NOT EXISTS (SELECT 1 FROM HoSoNguoiCaoTuoi WHERE CCCD = '079052000102')
        INSERT INTO HoSoNguoiCaoTuoi
            (HoTen, NgaySinh, GioiTinh, CCCD, DiaChi, SoDienThoai, NhomMau, BenhNen, DiUng, TrangThai, NguoiTaoID)
        VALUES
            (N'Trần Thị Bình', '1952-08-25', N'Nữ', '079052000102', N'Quận Bình Thạnh, TP. Hồ Chí Minh', '0908000102', 'A+',
             N'Đái tháo đường type 2, thoái hóa khớp gối', N'Dị ứng Penicillin', N'CanChamSocDacBiet', @AdminID);

    IF NOT EXISTS (SELECT 1 FROM HoSoNguoiCaoTuoi WHERE CCCD = '079044000103')
        INSERT INTO HoSoNguoiCaoTuoi
            (HoTen, NgaySinh, GioiTinh, CCCD, DiaChi, SoDienThoai, NhomMau, BenhNen, DiUng, TrangThai, NguoiTaoID)
        VALUES
            (N'Lê Văn Cường', '1944-11-02', N'Nam', '079044000103', N'Thành phố Thủ Đức, TP. Hồ Chí Minh', '0908000103', 'B+',
             N'Bệnh phổi tắc nghẽn mạn tính', N'Dị ứng hải sản', N'CanChamSocDacBiet', @AdminID);

    IF NOT EXISTS (SELECT 1 FROM HoSoNguoiCaoTuoi WHERE CCCD = '079056000104')
        INSERT INTO HoSoNguoiCaoTuoi
            (HoTen, NgaySinh, GioiTinh, CCCD, DiaChi, SoDienThoai, NhomMau, BenhNen, DiUng, TrangThai, NguoiTaoID)
        VALUES
            (N'Phạm Thị Dung', '1956-01-18', N'Nữ', '079056000104', N'Quận Tân Bình, TP. Hồ Chí Minh', '0908000104', 'AB+',
             N'Loãng xương, đau khớp mạn tính', N'Không ghi nhận', N'DangTheoDoi', @AdminID);

    IF NOT EXISTS (SELECT 1 FROM HoSoNguoiCaoTuoi WHERE CCCD = '079050000105')
        INSERT INTO HoSoNguoiCaoTuoi
            (HoTen, NgaySinh, GioiTinh, CCCD, DiaChi, SoDienThoai, NhomMau, BenhNen, DiUng, TrangThai, NguoiTaoID)
        VALUES
            (N'Võ Minh Đức', '1950-06-30', N'Nam', '079050000105', N'Quận Gò Vấp, TP. Hồ Chí Minh', '0908000105', 'O-',
             N'Rung nhĩ, tăng huyết áp', N'Dị ứng Aspirin liều cao', N'DangTheoDoi', @AdminID);

    DECLARE @NctAn INT = (SELECT NguoiCaoTuoiID FROM HoSoNguoiCaoTuoi WHERE CCCD = '079047000101');
    DECLARE @NctBinh INT = (SELECT NguoiCaoTuoiID FROM HoSoNguoiCaoTuoi WHERE CCCD = '079052000102');
    DECLARE @NctCuong INT = (SELECT NguoiCaoTuoiID FROM HoSoNguoiCaoTuoi WHERE CCCD = '079044000103');
    DECLARE @NctDung INT = (SELECT NguoiCaoTuoiID FROM HoSoNguoiCaoTuoi WHERE CCCD = '079056000104');
    DECLARE @NctDuc INT = (SELECT NguoiCaoTuoiID FROM HoSoNguoiCaoTuoi WHERE CCCD = '079050000105');

    /* ================================================================
       2. NGUOI CHAM SOC VA PHAN CONG
       ================================================================ */
    IF NOT EXISTS (SELECT 1 FROM NguoiChamSoc WHERE SoDienThoai = '0934567890')
        INSERT INTO NguoiChamSoc
            (UserID, HoTen, SoDienThoai, Email, DiaChi, NgheNghiep, NamKinhNghiem, TrangThai, GhiChu)
        VALUES
            (@CaregiverUserID, N'Phạm Văn Đức', '0934567890', 'phamvanduc@qlsuckhoe.vn', N'Quận 3, TP. Hồ Chí Minh',
             N'Điều dưỡng tại nhà', 6, N'DangLamViec', N'Có kinh nghiệm chăm sóc người bệnh tăng huyết áp');

    IF NOT EXISTS (SELECT 1 FROM NguoiChamSoc WHERE SoDienThoai = '0908111222')
        INSERT INTO NguoiChamSoc
            (HoTen, SoDienThoai, Email, DiaChi, NgheNghiep, NamKinhNghiem, TrangThai, GhiChu)
        VALUES
            (N'Nguyễn Thị Lan', '0908111222', 'lan.nguyen@example.com', N'Quận Bình Thạnh, TP. Hồ Chí Minh',
             N'Nhân viên chăm sóc', 4, N'DangLamViec', N'Phụ trách theo dõi dinh dưỡng và vận động');

    IF NOT EXISTS (SELECT 1 FROM NguoiChamSoc WHERE SoDienThoai = '0908333444')
        INSERT INTO NguoiChamSoc
            (HoTen, SoDienThoai, Email, DiaChi, NgheNghiep, NamKinhNghiem, TrangThai, GhiChu)
        VALUES
            (N'Võ Hoàng Nam', '0908333444', 'nam.vo@example.com', N'Thành phố Thủ Đức, TP. Hồ Chí Minh',
             N'Kỹ thuật viên phục hồi chức năng', 3, N'DangLamViec', N'Hỗ trợ vật lý trị liệu tại nhà');

    DECLARE @NcsDuc INT = (SELECT NguoiChamSocID FROM NguoiChamSoc WHERE SoDienThoai = '0934567890');
    DECLARE @NcsLan INT = (SELECT NguoiChamSocID FROM NguoiChamSoc WHERE SoDienThoai = '0908111222');
    DECLARE @NcsNam INT = (SELECT NguoiChamSocID FROM NguoiChamSoc WHERE SoDienThoai = '0908333444');

    DECLARE @PhanCong TABLE (NctID INT, NcsID INT, MoiQuanHe NVARCHAR(50), LaChinh BIT);
    INSERT INTO @PhanCong VALUES
        (@NctAn, @NcsDuc, N'Điều dưỡng', 1),
        (@NctBinh, @NcsLan, N'Người chăm sóc', 1),
        (@NctCuong, @NcsDuc, N'Điều dưỡng', 1),
        (@NctDung, @NcsNam, N'Kỹ thuật viên', 1),
        (@NctDuc, @NcsLan, N'Người chăm sóc', 1);

    INSERT INTO NguoiCaoTuoi_NguoiChamSoc (NguoiCaoTuoiID, NguoiChamSocID, MoiQuanHe, LaChinh, NgayBatDau)
    SELECT p.NctID, p.NcsID, p.MoiQuanHe, p.LaChinh, DATEADD(MONTH, -6, CAST(GETDATE() AS DATE))
    FROM @PhanCong p
    WHERE NOT EXISTS (
        SELECT 1 FROM NguoiCaoTuoi_NguoiChamSoc x
        WHERE x.NguoiCaoTuoiID = p.NctID AND x.NguoiChamSocID = p.NcsID
    );

    /* ================================================================
       3. LIEN HE KHAN CAP
       ================================================================ */
    DECLARE @LienHe TABLE
    (NctID INT, HoTen NVARCHAR(100), MoiQuanHe NVARCHAR(50), DienThoai VARCHAR(15), DienThoaiPhu VARCHAR(15), Email VARCHAR(100), DiaChi NVARCHAR(255), GhiChu NVARCHAR(500), UuTien INT);
    INSERT INTO @LienHe VALUES
        (@NctAn, N'Nguyễn Minh Khang', N'Con trai', '0911000101', '0911000201', 'khang.nguyen@example.com', N'Quận 3, TP. Hồ Chí Minh', N'Liên hệ đầu tiên khi có bất thường', 1),
        (@NctBinh, N'Trần Ngọc Mai', N'Con gái', '0911000102', NULL, 'mai.tran@example.com', N'Quận Bình Thạnh, TP. Hồ Chí Minh', N'Có thể hỗ trợ đưa đi khám', 1),
        (@NctCuong, N'Lê Thị Hạnh', N'Vợ', '0911000103', '0911000203', 'hanh.le@example.com', N'Thành phố Thủ Đức, TP. Hồ Chí Minh', N'Sống cùng người cao tuổi', 1),
        (@NctDung, N'Phạm Quốc Bảo', N'Con trai', '0911000104', NULL, 'bao.pham@example.com', N'Quận Tân Bình, TP. Hồ Chí Minh', NULL, 1),
        (@NctDuc, N'Võ Thanh Hà', N'Con gái', '0911000105', NULL, 'ha.vo@example.com', N'Quận Gò Vấp, TP. Hồ Chí Minh', N'Ưu tiên gọi ngoài giờ hành chính', 1);

    INSERT INTO LienHeKhanCap
        (NguoiCaoTuoiID, HoTen, MoiQuanHe, SoDienThoai, SoDienThoaiPhu, Email, DiaChi, GhiChu, ThuTuUuTien)
    SELECT l.NctID, l.HoTen, l.MoiQuanHe, l.DienThoai, l.DienThoaiPhu, l.Email, l.DiaChi, l.GhiChu, l.UuTien
    FROM @LienHe l
    WHERE NOT EXISTS (
        SELECT 1 FROM LienHeKhanCap x
        WHERE x.NguoiCaoTuoiID = l.NctID AND x.SoDienThoai = l.DienThoai
    );

    /* ================================================================
       4. DANH MUC THUOC
       ================================================================ */
    DECLARE @ThuocMau TABLE
    (Ten NVARCHAR(150), HoatChat NVARCHAR(150), DonVi NVARCHAR(30), NhaSX NVARCHAR(150), CachDung NVARCHAR(300), TacDungPhu NVARCHAR(500), MoTa NVARCHAR(500));
    INSERT INTO @ThuocMau VALUES
        (N'Amlodipine 5mg', N'Amlodipine', N'Viên', N'Dược Hậu Giang', N'Uống nguyên viên theo chỉ định', N'Có thể gây phù chân, chóng mặt', N'Thuốc thuộc nhóm chẹn kênh canxi'),
        (N'Losartan 50mg', N'Losartan potassium', N'Viên', N'Stada Việt Nam', N'Uống vào cùng một thời điểm mỗi ngày', N'Có thể gây chóng mặt', N'Thuốc đối kháng thụ thể angiotensin II'),
        (N'Metformin 500mg', N'Metformin hydrochloride', N'Viên', N'Imexpharm', N'Uống trong hoặc sau bữa ăn', N'Có thể gây khó chịu tiêu hóa', N'Thuốc hỗ trợ kiểm soát đường huyết'),
        (N'Gliclazide MR 30mg', N'Gliclazide', N'Viên', N'Servier', N'Uống cùng bữa sáng theo chỉ định', N'Có nguy cơ hạ đường huyết', N'Viên phóng thích kéo dài'),
        (N'Atorvastatin 20mg', N'Atorvastatin', N'Viên', N'Pymepharco', N'Uống theo chỉ định của bác sĩ', N'Có thể gây đau cơ', N'Thuốc hỗ trợ kiểm soát lipid máu'),
        (N'Bisoprolol 2.5mg', N'Bisoprolol fumarate', N'Viên', N'Merck', N'Uống buổi sáng theo chỉ định', N'Có thể gây chậm nhịp tim', N'Thuốc chẹn beta chọn lọc'),
        (N'Paracetamol 500mg', N'Paracetamol', N'Viên', N'Dược Hậu Giang', N'Uống sau ăn khi có chỉ định', N'Không dùng quá liều được kê', N'Thuốc giảm đau, hạ sốt'),
        (N'Omeprazole 20mg', N'Omeprazole', N'Viên', N'Trường Thọ Pharma', N'Uống trước bữa sáng', N'Có thể gây đau đầu, đầy hơi', N'Thuốc giảm tiết acid dạ dày'),
        (N'Salbutamol 2mg', N'Salbutamol', N'Viên', N'Medipharco', N'Dùng đúng liều bác sĩ kê', N'Có thể gây hồi hộp, run tay', N'Thuốc giãn phế quản'),
        (N'Calcium D3', N'Calcium carbonate + Vitamin D3', N'Viên', N'United Pharma', N'Uống sau bữa ăn', N'Có thể gây táo bón', N'Bổ sung calci và vitamin D3'),
        (N'Vitamin B1-B6-B12', N'Vitamin B1 + B6 + B12', N'Viên', N'Mekophar', N'Uống sau bữa ăn', N'Hiếm gặp phản ứng dị ứng', N'Bổ sung vitamin nhóm B'),
        (N'Aspirin 81mg', N'Acetylsalicylic acid', N'Viên', N'Agimexpharm', N'Chỉ dùng theo đơn và uống sau ăn', N'Có thể tăng nguy cơ chảy máu', N'Thuốc chống kết tập tiểu cầu liều thấp');

    INSERT INTO DanhMucThuoc (TenThuoc, HoatChat, DonViTinh, NhaSanXuat, CachDung, TacDungPhu, MoTa, TrangThai)
    SELECT t.Ten, t.HoatChat, t.DonVi, t.NhaSX, t.CachDung, t.TacDungPhu, t.MoTa, 1
    FROM @ThuocMau t
    WHERE NOT EXISTS (SELECT 1 FROM DanhMucThuoc d WHERE d.TenThuoc = t.Ten);

    /* ================================================================
       5. DON THUOC VA CHI TIET DON
       ================================================================ */
    DECLARE @GhiChuDT1 NVARCHAR(500) = N'Dữ liệu mẫu DT001 - theo dõi huyết áp mỗi ngày';
    DECLARE @GhiChuDT2 NVARCHAR(500) = N'Dữ liệu mẫu DT002 - theo dõi đường huyết trước bữa sáng';
    DECLARE @GhiChuDT3 NVARCHAR(500) = N'Dữ liệu mẫu DT003 - theo dõi hô hấp và SpO2';
    DECLARE @GhiChuDT4 NVARCHAR(500) = N'Dữ liệu mẫu DT004 - theo dõi mạch và dấu hiệu chảy máu';

    IF NOT EXISTS (SELECT 1 FROM DonThuoc WHERE GhiChu = @GhiChuDT1)
        INSERT INTO DonThuoc (NguoiCaoTuoiID, BacSiKeDon, NoiKeDon, NgayKeDon, NgayBatDau, NgayKetThuc, GhiChu, NguoiTaoID)
        VALUES (@NctAn, N'BS. Trần Thị Minh', N'Bệnh viện Nhân Dân 115', DATEADD(DAY,-10,CAST(GETDATE() AS DATE)), DATEADD(DAY,-9,CAST(GETDATE() AS DATE)), DATEADD(DAY,21,CAST(GETDATE() AS DATE)), @GhiChuDT1, @DoctorID);
    IF NOT EXISTS (SELECT 1 FROM DonThuoc WHERE GhiChu = @GhiChuDT2)
        INSERT INTO DonThuoc (NguoiCaoTuoiID, BacSiKeDon, NoiKeDon, NgayKeDon, NgayBatDau, NgayKetThuc, GhiChu, NguoiTaoID)
        VALUES (@NctBinh, N'BS. Trần Thị Minh', N'Bệnh viện Đại học Y Dược', DATEADD(DAY,-8,CAST(GETDATE() AS DATE)), DATEADD(DAY,-7,CAST(GETDATE() AS DATE)), DATEADD(DAY,23,CAST(GETDATE() AS DATE)), @GhiChuDT2, @DoctorID);
    IF NOT EXISTS (SELECT 1 FROM DonThuoc WHERE GhiChu = @GhiChuDT3)
        INSERT INTO DonThuoc (NguoiCaoTuoiID, BacSiKeDon, NoiKeDon, NgayKeDon, NgayBatDau, NgayKetThuc, GhiChu, NguoiTaoID)
        VALUES (@NctCuong, N'BS. Lê Hoàng Nam', N'Bệnh viện Phạm Ngọc Thạch', DATEADD(DAY,-6,CAST(GETDATE() AS DATE)), DATEADD(DAY,-5,CAST(GETDATE() AS DATE)), DATEADD(DAY,25,CAST(GETDATE() AS DATE)), @GhiChuDT3, @DoctorID);
    IF NOT EXISTS (SELECT 1 FROM DonThuoc WHERE GhiChu = @GhiChuDT4)
        INSERT INTO DonThuoc (NguoiCaoTuoiID, BacSiKeDon, NoiKeDon, NgayKeDon, NgayBatDau, NgayKetThuc, GhiChu, NguoiTaoID)
        VALUES (@NctDuc, N'BS. Trần Thị Minh', N'Viện Tim TP. Hồ Chí Minh', DATEADD(DAY,-12,CAST(GETDATE() AS DATE)), DATEADD(DAY,-11,CAST(GETDATE() AS DATE)), DATEADD(DAY,19,CAST(GETDATE() AS DATE)), @GhiChuDT4, @DoctorID);

    DECLARE @DT1 INT = (SELECT DonThuocID FROM DonThuoc WHERE GhiChu = @GhiChuDT1);
    DECLARE @DT2 INT = (SELECT DonThuocID FROM DonThuoc WHERE GhiChu = @GhiChuDT2);
    DECLARE @DT3 INT = (SELECT DonThuocID FROM DonThuoc WHERE GhiChu = @GhiChuDT3);
    DECLARE @DT4 INT = (SELECT DonThuocID FROM DonThuoc WHERE GhiChu = @GhiChuDT4);

    DECLARE @ChiTietMau TABLE (DonID INT, ThuocID INT, Lieu NVARCHAR(100), SoLan INT, ThoiDiem NVARCHAR(200), GhiChu NVARCHAR(300));
    INSERT INTO @ChiTietMau
    SELECT @DT1, ThuocID, N'1 viên/lần', 1, N'07:00', N'Sau bữa sáng' FROM DanhMucThuoc WHERE TenThuoc=N'Amlodipine 5mg'
    UNION ALL SELECT @DT1, ThuocID, N'1 viên/lần', 1, N'19:00', N'Sau bữa tối' FROM DanhMucThuoc WHERE TenThuoc=N'Losartan 50mg'
    UNION ALL SELECT @DT2, ThuocID, N'1 viên/lần', 2, N'07:00, 19:00', N'Uống trong hoặc sau bữa ăn' FROM DanhMucThuoc WHERE TenThuoc=N'Metformin 500mg'
    UNION ALL SELECT @DT2, ThuocID, N'1 viên/lần', 1, N'07:00', N'Uống cùng bữa sáng' FROM DanhMucThuoc WHERE TenThuoc=N'Gliclazide MR 30mg'
    UNION ALL SELECT @DT3, ThuocID, N'1 viên/lần', 2, N'07:30, 19:30', N'Theo dõi nhịp tim sau dùng' FROM DanhMucThuoc WHERE TenThuoc=N'Salbutamol 2mg'
    UNION ALL SELECT @DT4, ThuocID, N'1 viên/lần', 1, N'07:00', N'Đo mạch trước khi dùng' FROM DanhMucThuoc WHERE TenThuoc=N'Bisoprolol 2.5mg'
    UNION ALL SELECT @DT4, ThuocID, N'1 viên/lần', 1, N'12:00', N'Uống sau bữa trưa' FROM DanhMucThuoc WHERE TenThuoc=N'Aspirin 81mg';

    INSERT INTO DonThuocChiTiet (DonThuocID, ThuocID, LieuDung, SoLanMoiNgay, ThoiDiemUong, GhiChu)
    SELECT c.DonID, c.ThuocID, c.Lieu, c.SoLan, c.ThoiDiem, c.GhiChu
    FROM @ChiTietMau c
    WHERE NOT EXISTS (
        SELECT 1 FROM DonThuocChiTiet x WHERE x.DonThuocID=c.DonID AND x.ThuocID=c.ThuocID
    );

    /* ================================================================
       6. LICH UONG THUOC HOM NAY
       ================================================================ */
    DECLARE @HomNay DATETIME2 = CAST(CAST(GETDATE() AS DATE) AS DATETIME2);
    DECLARE @LichMau TABLE
    (ChiTietID INT, NctID INT, Gio INT, Phut INT, TrangThai NVARCHAR(20), NguoiXN INT, GhiChu NVARCHAR(300));

    INSERT INTO @LichMau
    SELECT c.DonThuocChiTietID, @NctAn, 7, 0, N'DaUong', @CaregiverUserID, N'Dữ liệu mẫu LUT001 - đã xác nhận sau bữa sáng'
      FROM DonThuocChiTiet c JOIN DanhMucThuoc t ON c.ThuocID=t.ThuocID WHERE c.DonThuocID=@DT1 AND t.TenThuoc=N'Amlodipine 5mg'
    UNION ALL
    SELECT c.DonThuocChiTietID, @NctAn, 19, 0, N'ChuaDenGio', NULL, N'Dữ liệu mẫu LUT002'
      FROM DonThuocChiTiet c JOIN DanhMucThuoc t ON c.ThuocID=t.ThuocID WHERE c.DonThuocID=@DT1 AND t.TenThuoc=N'Losartan 50mg'
    UNION ALL
    SELECT c.DonThuocChiTietID, @NctBinh, 7, 0, N'DaUong', @CaregiverUserID, N'Dữ liệu mẫu LUT003 - đã xác nhận'
      FROM DonThuocChiTiet c JOIN DanhMucThuoc t ON c.ThuocID=t.ThuocID WHERE c.DonThuocID=@DT2 AND t.TenThuoc=N'Metformin 500mg'
    UNION ALL
    SELECT c.DonThuocChiTietID, @NctBinh, 19, 0, N'ChuaDenGio', NULL, N'Dữ liệu mẫu LUT004'
      FROM DonThuocChiTiet c JOIN DanhMucThuoc t ON c.ThuocID=t.ThuocID WHERE c.DonThuocID=@DT2 AND t.TenThuoc=N'Metformin 500mg'
    UNION ALL
    SELECT c.DonThuocChiTietID, @NctBinh, 7, 15, N'BoLo', NULL, N'Dữ liệu mẫu LUT005 - chưa xác nhận dùng thuốc'
      FROM DonThuocChiTiet c JOIN DanhMucThuoc t ON c.ThuocID=t.ThuocID WHERE c.DonThuocID=@DT2 AND t.TenThuoc=N'Gliclazide MR 30mg'
    UNION ALL
    SELECT c.DonThuocChiTietID, @NctCuong, 7, 30, N'DaUong', @CaregiverUserID, N'Dữ liệu mẫu LUT006 - đã xác nhận'
      FROM DonThuocChiTiet c JOIN DanhMucThuoc t ON c.ThuocID=t.ThuocID WHERE c.DonThuocID=@DT3 AND t.TenThuoc=N'Salbutamol 2mg'
    UNION ALL
    SELECT c.DonThuocChiTietID, @NctCuong, 19, 30, N'ChuaDenGio', NULL, N'Dữ liệu mẫu LUT007'
      FROM DonThuocChiTiet c JOIN DanhMucThuoc t ON c.ThuocID=t.ThuocID WHERE c.DonThuocID=@DT3 AND t.TenThuoc=N'Salbutamol 2mg'
    UNION ALL
    SELECT c.DonThuocChiTietID, @NctDuc, 7, 0, N'DaUong', @CaregiverUserID, N'Dữ liệu mẫu LUT008 - đã đo mạch trước khi dùng'
      FROM DonThuocChiTiet c JOIN DanhMucThuoc t ON c.ThuocID=t.ThuocID WHERE c.DonThuocID=@DT4 AND t.TenThuoc=N'Bisoprolol 2.5mg'
    UNION ALL
    SELECT c.DonThuocChiTietID, @NctDuc, 12, 0, N'TuChoi', @CaregiverUserID, N'Dữ liệu mẫu LUT009 - người bệnh báo khó chịu dạ dày'
      FROM DonThuocChiTiet c JOIN DanhMucThuoc t ON c.ThuocID=t.ThuocID WHERE c.DonThuocID=@DT4 AND t.TenThuoc=N'Aspirin 81mg';

    INSERT INTO LichUongThuoc
        (DonThuocChiTietID, NguoiCaoTuoiID, ThoiGianDuKien, ThoiGianThucTe, TrangThai, NguoiXacNhanID, GhiChu)
    SELECT l.ChiTietID, l.NctID, DATEADD(MINUTE, l.Phut, DATEADD(HOUR, l.Gio, @HomNay)),
           CASE WHEN l.TrangThai=N'DaUong' THEN DATEADD(MINUTE, l.Phut+8, DATEADD(HOUR, l.Gio, @HomNay)) ELSE NULL END,
           l.TrangThai, l.NguoiXN, l.GhiChu
    FROM @LichMau l
    WHERE NOT EXISTS (SELECT 1 FROM LichUongThuoc x WHERE x.GhiChu=l.GhiChu);

    /* ================================================================
       7. LICH KHAM BENH
       ================================================================ */
    DECLARE @LichKhamMau TABLE
    (NctID INT, BenhVien NVARCHAR(200), BacSi NVARCHAR(100), ChuyenKhoa NVARCHAR(100), NgayGio DATETIME2, LyDo NVARCHAR(300), TrangThai NVARCHAR(20), KetQua NVARCHAR(500));
    INSERT INTO @LichKhamMau VALUES
        (@NctAn, N'Bệnh viện Nhân Dân 115', N'BS. Nguyễn Hoàng Phúc', N'Tim mạch', DATEADD(HOUR,9,DATEADD(DAY,2,@HomNay)), N'Tái khám tim mạch định kỳ - dữ liệu mẫu LK001', N'ChuaDen', NULL),
        (@NctBinh, N'Bệnh viện Đại học Y Dược', N'BS. Phạm Thu Trang', N'Nội tiết', DATEADD(HOUR,14,DATEADD(DAY,5,@HomNay)), N'Đánh giá kiểm soát đường huyết - dữ liệu mẫu LK002', N'ChuaDen', NULL),
        (@NctCuong, N'Bệnh viện Phạm Ngọc Thạch', N'BS. Lê Hoàng Nam', N'Hô hấp', DATEADD(HOUR,8,DATEADD(DAY,7,@HomNay)), N'Kiểm tra chức năng hô hấp - dữ liệu mẫu LK003', N'ChuaDen', NULL),
        (@NctDung, N'Bệnh viện Chấn thương Chỉnh hình', N'BS. Trần Quốc Huy', N'Cơ xương khớp', DATEADD(HOUR,10,DATEADD(DAY,-7,@HomNay)), N'Tái khám đau khớp - dữ liệu mẫu LK004', N'DaKham', N'Duy trì vận động nhẹ và tái khám sau 4 tuần'),
        (@NctDuc, N'Viện Tim TP. Hồ Chí Minh', N'BS. Võ Thanh Tùng', N'Tim mạch', DATEADD(HOUR,15,DATEADD(DAY,10,@HomNay)), N'Theo dõi rung nhĩ - dữ liệu mẫu LK005', N'ChuaDen', NULL);

    INSERT INTO LichKhamBenh
        (NguoiCaoTuoiID, TenBenhVien, BacSiPhuTrach, ChuyenKhoa, ThoiGianKham, LyDoKham, TrangThai, KetQuaKham, NguoiTaoID)
    SELECT l.NctID, l.BenhVien, l.BacSi, l.ChuyenKhoa, l.NgayGio, l.LyDo, l.TrangThai, l.KetQua, @DoctorID
    FROM @LichKhamMau l
    WHERE NOT EXISTS (SELECT 1 FROM LichKhamBenh x WHERE x.LyDoKham=l.LyDo);

    /* ================================================================
       8. CHI SO SUC KHOE
       ================================================================ */
    DECLARE @HuyetAp INT = (SELECT LoaiChiSoID FROM LoaiChiSoSucKhoe WHERE TenChiSo=N'Huyết áp');
    DECLARE @NhipTim INT = (SELECT LoaiChiSoID FROM LoaiChiSoSucKhoe WHERE TenChiSo=N'Nhịp tim');
    DECLARE @DuongHuyet INT = (SELECT LoaiChiSoID FROM LoaiChiSoSucKhoe WHERE TenChiSo=N'Đường huyết');
    DECLARE @NhietDo INT = (SELECT LoaiChiSoID FROM LoaiChiSoSucKhoe WHERE TenChiSo=N'Nhiệt độ cơ thể');
    DECLARE @Spo2 INT = (SELECT LoaiChiSoID FROM LoaiChiSoSucKhoe WHERE TenChiSo=N'SpO2');

    DECLARE @ChiSoMau TABLE
    (NctID INT, LoaiID INT, GiaTri DECIMAL(10,2), GiaTriPhu DECIMAL(10,2), ThoiGian DATETIME2, BatThuong BIT, GhiChu NVARCHAR(300));
    INSERT INTO @ChiSoMau VALUES
        (@NctAn, @HuyetAp, 136, 84, DATEADD(DAY,-3,DATEADD(HOUR,7,@HomNay)), 0, N'Dữ liệu mẫu CS001 - đo buổi sáng'),
        (@NctAn, @HuyetAp, 148, 94, DATEADD(DAY,-1,DATEADD(HOUR,7,@HomNay)), 1, N'Dữ liệu mẫu CS002 - huyết áp cao hơn ngưỡng theo dõi'),
        (@NctAn, @HuyetAp, 158, 98, DATEADD(HOUR,-7,SYSDATETIME()), 1, N'Dữ liệu mẫu CS003 - cần đo lại sau khi nghỉ'),
        (@NctAn, @NhipTim, 88, NULL, DATEADD(HOUR,-7,SYSDATETIME()), 0, N'Dữ liệu mẫu CS004'),
        (@NctBinh, @DuongHuyet, 128, NULL, DATEADD(DAY,-2,DATEADD(HOUR,6,@HomNay)), 0, N'Dữ liệu mẫu CS005 - trước bữa sáng'),
        (@NctBinh, @DuongHuyet, 186, NULL, DATEADD(HOUR,-10,SYSDATETIME()), 1, N'Dữ liệu mẫu CS006 - đường huyết vượt ngưỡng theo dõi'),
        (@NctCuong, @Spo2, 96, NULL, DATEADD(DAY,-2,DATEADD(HOUR,8,@HomNay)), 0, N'Dữ liệu mẫu CS007'),
        (@NctCuong, @Spo2, 91, NULL, DATEADD(HOUR,-2,SYSDATETIME()), 1, N'Dữ liệu mẫu CS008 - SpO2 thấp cần xác minh lại'),
        (@NctDung, @NhietDo, 36.7, NULL, DATEADD(HOUR,-4,SYSDATETIME()), 0, N'Dữ liệu mẫu CS009'),
        (@NctDung, @NhipTim, 76, NULL, DATEADD(HOUR,-4,SYSDATETIME()), 0, N'Dữ liệu mẫu CS010'),
        (@NctDuc, @NhipTim, 108, NULL, DATEADD(HOUR,-5,SYSDATETIME()), 1, N'Dữ liệu mẫu CS011 - nhịp tim vượt ngưỡng theo dõi'),
        (@NctDuc, @HuyetAp, 142, 88, DATEADD(HOUR,-5,SYSDATETIME()), 1, N'Dữ liệu mẫu CS012 - huyết áp tâm thu cao');

    INSERT INTO ChiSoSucKhoe
        (NguoiCaoTuoiID, LoaiChiSoID, GiaTri, GiaTriPhu, ThoiGianDo, NguoiDoID, LaBatThuong, GhiChu)
    SELECT c.NctID, c.LoaiID, c.GiaTri, c.GiaTriPhu, c.ThoiGian, @NurseID, c.BatThuong, c.GhiChu
    FROM @ChiSoMau c
    WHERE NOT EXISTS (SELECT 1 FROM ChiSoSucKhoe x WHERE x.GhiChu=c.GhiChu);

    /* ================================================================
       9. CANH BAO - DU LIEU CHO DASHBOARD THONG MINH
       ================================================================ */
    DECLARE @CsAnCao INT = (SELECT ChiSoID FROM ChiSoSucKhoe WHERE GhiChu=N'Dữ liệu mẫu CS003 - cần đo lại sau khi nghỉ');
    DECLARE @CsBinhDuong INT = (SELECT ChiSoID FROM ChiSoSucKhoe WHERE GhiChu=N'Dữ liệu mẫu CS006 - đường huyết vượt ngưỡng theo dõi');
    DECLARE @CsCuongSpo2 INT = (SELECT ChiSoID FROM ChiSoSucKhoe WHERE GhiChu=N'Dữ liệu mẫu CS008 - SpO2 thấp cần xác minh lại');
    DECLARE @CsDucNhipTim INT = (SELECT ChiSoID FROM ChiSoSucKhoe WHERE GhiChu=N'Dữ liệu mẫu CS011 - nhịp tim vượt ngưỡng theo dõi');

    IF NOT EXISTS (SELECT 1 FROM CanhBao WHERE NguonBang=N'ChiSoSucKhoe' AND NguonID=@CsCuongSpo2)
        INSERT INTO CanhBao (NguoiCaoTuoiID, LoaiCanhBao, NoiDung, MucDo, NguonBang, NguonID, TrangThai, NgayTao)
        VALUES (@NctCuong, N'ChiSoBatThuong', N'SpO2 ghi nhận 91%, thấp hơn ngưỡng theo dõi 95–100%.', N'Cao', N'ChiSoSucKhoe', @CsCuongSpo2, N'ChuaXuLy', DATEADD(HOUR,-2,SYSDATETIME()));

    IF NOT EXISTS (SELECT 1 FROM CanhBao WHERE NguonBang=N'ChiSoSucKhoe' AND NguonID=@CsAnCao)
        INSERT INTO CanhBao (NguoiCaoTuoiID, LoaiCanhBao, NoiDung, MucDo, NguonBang, NguonID, TrangThai, NgayTao)
        VALUES (@NctAn, N'ChiSoBatThuong', N'Huyết áp ghi nhận 158/98 mmHg, vượt ngưỡng theo dõi.', N'Cao', N'ChiSoSucKhoe', @CsAnCao, N'ChuaXuLy', DATEADD(HOUR,-7,SYSDATETIME()));

    IF NOT EXISTS (SELECT 1 FROM CanhBao WHERE NguonBang=N'ChiSoSucKhoe' AND NguonID=@CsBinhDuong)
        INSERT INTO CanhBao (NguoiCaoTuoiID, LoaiCanhBao, NoiDung, MucDo, NguonBang, NguonID, TrangThai, NgayTao)
        VALUES (@NctBinh, N'ChiSoBatThuong', N'Đường huyết ghi nhận 186 mg/dL, vượt ngưỡng theo dõi.', N'TrungBinh', N'ChiSoSucKhoe', @CsBinhDuong, N'ChuaXuLy', DATEADD(HOUR,-10,SYSDATETIME()));

    IF NOT EXISTS (SELECT 1 FROM CanhBao WHERE NguonBang=N'ChiSoSucKhoe' AND NguonID=@CsDucNhipTim)
        INSERT INTO CanhBao (NguoiCaoTuoiID, LoaiCanhBao, NoiDung, MucDo, NguonBang, NguonID, TrangThai, NgayTao, NguoiXuLyID)
        VALUES (@NctDuc, N'ChiSoBatThuong', N'Nhịp tim ghi nhận 108 lần/phút, cần kiểm tra lại sau khi nghỉ.', N'TrungBinh', N'ChiSoSucKhoe', @CsDucNhipTim, N'DaXem', DATEADD(HOUR,-5,SYSDATETIME()), @NurseID);

    IF NOT EXISTS (SELECT 1 FROM CanhBao WHERE NguonBang=N'DuLieuMau' AND NguonID=101)
        INSERT INTO CanhBao (NguoiCaoTuoiID, LoaiCanhBao, NoiDung, MucDo, NguonBang, NguonID, TrangThai, NgayTao)
        VALUES (@NctBinh, N'NhacUongThuoc', N'Lịch Gliclazide buổi sáng chưa được xác nhận.', N'TrungBinh', N'DuLieuMau', 101, N'ChuaXuLy', DATEADD(HOUR,-4,SYSDATETIME()));

    IF NOT EXISTS (SELECT 1 FROM CanhBao WHERE NguonBang=N'DuLieuMau' AND NguonID=102)
        INSERT INTO CanhBao (NguoiCaoTuoiID, LoaiCanhBao, NoiDung, MucDo, NguonBang, NguonID, TrangThai, NgayTao)
        VALUES (@NctAn, N'NhacLichKham', N'Lịch tái khám tim mạch còn 2 ngày, cần xác nhận phương tiện di chuyển.', N'Thap', N'DuLieuMau', 102, N'ChuaXuLy', DATEADD(HOUR,-1,SYSDATETIME()));

    IF NOT EXISTS (SELECT 1 FROM CanhBao WHERE NguonBang=N'DuLieuMau' AND NguonID=103)
        INSERT INTO CanhBao (NguoiCaoTuoiID, LoaiCanhBao, NoiDung, MucDo, NguonBang, NguonID, TrangThai, NgayTao)
        VALUES (@NctCuong, N'KhanCap', N'Người chăm sóc báo khó thở tăng khi vận động.', N'KhanCap', N'DuLieuMau', 103, N'ChuaXuLy', DATEADD(MINUTE,-20,SYSDATETIME()));

    -- Cac canh bao da xu ly o nhung thang truoc giup bieu do bao cao co du lieu.
    IF NOT EXISTS (SELECT 1 FROM CanhBao WHERE NguonBang=N'DuLieuMau' AND NguonID=201)
        INSERT INTO CanhBao (NguoiCaoTuoiID, LoaiCanhBao, NoiDung, MucDo, NguonBang, NguonID, TrangThai, NgayTao, NgayXuLy, NguoiXuLyID, GhiChuXuLy)
        VALUES (@NctAn, N'ChiSoBatThuong', N'Huyết áp tăng nhẹ trong lần đo buổi sáng.', N'TrungBinh', N'DuLieuMau', 201, N'DaXuLy', DATEADD(MONTH,-1,SYSDATETIME()), DATEADD(MINUTE,45,DATEADD(MONTH,-1,SYSDATETIME())), @DoctorID, N'Đã liên hệ, đo lại và ghi nhận chỉ số ổn định.');
    IF NOT EXISTS (SELECT 1 FROM CanhBao WHERE NguonBang=N'DuLieuMau' AND NguonID=202)
        INSERT INTO CanhBao (NguoiCaoTuoiID, LoaiCanhBao, NoiDung, MucDo, NguonBang, NguonID, TrangThai, NgayTao, NgayXuLy, NguoiXuLyID, GhiChuXuLy)
        VALUES (@NctBinh, N'NhacUongThuoc', N'Bỏ lỡ một lịch uống thuốc buổi tối.', N'TrungBinh', N'DuLieuMau', 202, N'DaXuLy', DATEADD(MONTH,-2,SYSDATETIME()), DATEADD(HOUR,2,DATEADD(MONTH,-2,SYSDATETIME())), @NurseID, N'Đã xác minh với người chăm sóc.');
    IF NOT EXISTS (SELECT 1 FROM CanhBao WHERE NguonBang=N'DuLieuMau' AND NguonID=203)
        INSERT INTO CanhBao (NguoiCaoTuoiID, LoaiCanhBao, NoiDung, MucDo, NguonBang, NguonID, TrangThai, NgayTao, NgayXuLy, NguoiXuLyID, GhiChuXuLy)
        VALUES (@NctDung, N'NhacLichKham', N'Lịch khám cơ xương khớp cần xác nhận.', N'Thap', N'DuLieuMau', 203, N'DaXuLy', DATEADD(MONTH,-3,SYSDATETIME()), DATEADD(HOUR,4,DATEADD(MONTH,-3,SYSDATETIME())), @AdminID, N'Đã xác nhận lịch với bệnh viện.');

    /* ================================================================
       10. CANH BAO KHAN CAP, THONG BAO VA NHAT KY CHAM SOC
       ================================================================ */
    IF NOT EXISTS (SELECT 1 FROM CanhBaoKhanCap WHERE NoiDung=N'Dữ liệu mẫu KC001 - khó thở khi vận động')
        INSERT INTO CanhBaoKhanCap
            (NguoiCaoTuoiID, NguoiGuiID, ViDo, KinhDo, NoiDung, TrangThai, NgayGui)
        VALUES
            (@NctCuong, @CaregiverUserID, 10.849523, 106.771912, N'Dữ liệu mẫu KC001 - khó thở khi vận động', N'DangGui', DATEADD(MINUTE,-20,SYSDATETIME()));

    DECLARE @ThongBaoMau TABLE
    (UserID INT, TieuDe NVARCHAR(150), NoiDung NVARCHAR(500), Loai NVARCHAR(30), Bang NVARCHAR(50), LienKetID INT, DaDoc BIT);
    INSERT INTO @ThongBaoMau VALUES
        (@AdminID, N'Cảnh báo khẩn cần tiếp nhận', N'Ông Lê Văn Cường có cảnh báo khó thở khi vận động.', N'KhanCap', N'CanhBao', 103, 0),
        (@DoctorID, N'Chỉ số SpO2 bất thường', N'Chỉ số SpO2 mới cần được đánh giá.', N'CanhBaoChiSo', N'ChiSoSucKhoe', @CsCuongSpo2, 0),
        (@CaregiverUserID, N'Nhắc lịch uống thuốc', N'Vui lòng xác nhận lịch thuốc buổi tối của ông Nguyễn Văn An.', N'NhacThuoc', N'LichUongThuoc', NULL, 0),
        (@NurseID, N'Lịch khám sắp tới', N'Có lịch tái khám tim mạch trong 2 ngày tới.', N'NhacLichKham', N'LichKhamBenh', NULL, 1);

    INSERT INTO ThongBao (UserID, TieuDe, NoiDung, LoaiThongBao, LienKetBang, LienKetID, DaDoc)
    SELECT t.UserID, t.TieuDe, t.NoiDung, t.Loai, t.Bang, t.LienKetID, t.DaDoc
    FROM @ThongBaoMau t
    WHERE NOT EXISTS (SELECT 1 FROM ThongBao x WHERE x.UserID=t.UserID AND x.TieuDe=t.TieuDe);

    DECLARE @NhatKyMau TABLE
    (NctID INT, NcsID INT, NgayGhi DATETIME2, Loai NVARCHAR(30), HoatDong NVARCHAR(200), ChiTiet NVARCHAR(1000), TrangThai NVARCHAR(20));
    INSERT INTO @NhatKyMau VALUES
        (@NctAn, @NcsDuc, DATEADD(HOUR,-6,SYSDATETIME()), N'CHAM_SOC_HANG_NGAY', N'Đo huyết áp và hỗ trợ dùng thuốc', N'Người bệnh tỉnh táo, ăn sáng tốt; đã ghi nhận huyết áp để bác sĩ theo dõi.', N'HOAN_THANH'),
        (@NctBinh, @NcsLan, DATEADD(HOUR,-5,SYSDATETIME()), N'CHAM_SOC_HANG_NGAY', N'Kiểm tra đường huyết trước bữa ăn', N'Đường huyết cao hơn ngưỡng, đã nhắc hạn chế thực phẩm ngọt.', N'HOAN_THANH'),
        (@NctCuong, @NcsDuc, DATEADD(HOUR,-2,SYSDATETIME()), N'CANH_BAO', N'Ghi nhận khó thở khi vận động', N'Đã cho người bệnh nghỉ, kiểm tra SpO2 và gửi cảnh báo đến nhân viên y tế.', N'DANG_THUC_HIEN'),
        (@NctDung, @NcsNam, DATEADD(DAY,-1,SYSDATETIME()), N'VAT_LY_TRI_LIEU', N'Tập vận động khớp gối', N'Hoàn thành bài tập nhẹ 20 phút, không ghi nhận đau tăng.', N'HOAN_THANH'),
        (@NctDuc, @NcsLan, DATEADD(HOUR,-4,SYSDATETIME()), N'CHAM_SOC_HANG_NGAY', N'Đo mạch và huyết áp', N'Nhịp tim cao hơn ngưỡng theo dõi, đã hướng dẫn nghỉ và đo lại.', N'HOAN_THANH'),
        (@NctAn, @NcsDuc, DATEADD(DAY,-2,SYSDATETIME()), N'CHAM_SOC_HANG_NGAY', N'Đi bộ nhẹ buổi sáng', N'Đi bộ 15 phút quanh nhà, không chóng mặt hoặc khó thở.', N'HOAN_THANH');

    INSERT INTO NhatKyChamSoc
        (NguoiCaoTuoiID, NguoiChamSocID, NgayGhi, LoaiNhatKy, HoatDong, MoTaChiTiet, TrangThai)
    SELECT n.NctID, n.NcsID, n.NgayGhi, n.Loai, n.HoatDong, n.ChiTiet, n.TrangThai
    FROM @NhatKyMau n
    WHERE NOT EXISTS (
        SELECT 1 FROM NhatKyChamSoc x
        WHERE x.NguoiCaoTuoiID=n.NctID AND x.HoatDong=n.HoatDong
    );

    COMMIT TRANSACTION;

    PRINT N'Hoàn tất thêm dữ liệu mẫu.';
    SELECT N'HoSoNguoiCaoTuoi' AS Bang, COUNT(*) AS SoLuong FROM HoSoNguoiCaoTuoi
    UNION ALL SELECT N'NguoiChamSoc', COUNT(*) FROM NguoiChamSoc
    UNION ALL SELECT N'DanhMucThuoc', COUNT(*) FROM DanhMucThuoc
    UNION ALL SELECT N'DonThuoc', COUNT(*) FROM DonThuoc
    UNION ALL SELECT N'LichUongThuoc', COUNT(*) FROM LichUongThuoc
    UNION ALL SELECT N'LichKhamBenh', COUNT(*) FROM LichKhamBenh
    UNION ALL SELECT N'ChiSoSucKhoe', COUNT(*) FROM ChiSoSucKhoe
    UNION ALL SELECT N'CanhBao', COUNT(*) FROM CanhBao
    UNION ALL SELECT N'LienHeKhanCap', COUNT(*) FROM LienHeKhanCap
    UNION ALL SELECT N'NhatKyChamSoc', COUNT(*) FROM NhatKyChamSoc;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
