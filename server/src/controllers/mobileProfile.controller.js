// Existing mobile screens need raw records, scoped by server-loaded assignments.
const {poolPromise,sql}=require('../config/db');
const {ok,fail}=require('../utils/response');
const {ownsElderlyId,isMobileRole}=require('../middlewares/mobile-scope.middleware');
const {boundedQuery}=require('../utils/boundedQuery');
const statements={
 allAppointments:`SELECT LichKhamID AS id,NguoiCaoTuoiID AS nguoiCaoTuoiId,TenBenhVien AS tenBenhVien,BacSiPhuTrach AS bacSiPhuTrach,ChuyenKhoa AS chuyenKhoa,
 CONVERT(VARCHAR(19),ThoiGianKham,126) AS thoiGianKham,TrangThai AS trangThai,LyDoKham AS lyDoKham,KetQuaKham AS ketQuaKham FROM LichKhamBenh WHERE NguoiCaoTuoiID=@id ORDER BY ThoiGianKham,LichKhamID`,
 medications:`SELECT l.LichUongThuocID AS id,l.NguoiCaoTuoiID AS nguoiCaoTuoiId,dm.TenThuoc AS tenThuoc,ct.LieuDung AS lieuDung,
 CONVERT(VARCHAR(19),l.ThoiGianDuKien,126) AS thoiGianDuKien,CONVERT(VARCHAR(19),l.ThoiGianThucTe,126) AS thoiGianThucTe,l.TrangThai AS trangThai
 FROM LichUongThuoc l JOIN DonThuocChiTiet ct ON ct.DonThuocChiTietID=l.DonThuocChiTietID
 JOIN DonThuoc d ON d.DonThuocID=ct.DonThuocID AND d.NguoiCaoTuoiID=l.NguoiCaoTuoiID
 JOIN DanhMucThuoc dm ON dm.ThuocID=ct.ThuocID WHERE l.NguoiCaoTuoiID=@id AND l.ThoiGianDuKien>=@from AND l.ThoiGianDuKien<DATEADD(DAY,1,@to) ORDER BY l.ThoiGianDuKien,l.LichUongThuocID`,
 health:`SELECT c.ChiSoID AS id,c.NguoiCaoTuoiID AS nguoiCaoTuoiId,l.TenChiSo AS tenChiSo,l.DonVi AS donVi,c.GiaTri AS giaTri,c.GiaTriPhu AS giaTriPhu,
 CONVERT(VARCHAR(19),c.ThoiGianDo,126) AS thoiGianDo,c.LaBatThuong AS laBatThuong FROM ChiSoSucKhoe c JOIN LoaiChiSoSucKhoe l ON l.LoaiChiSoID=c.LoaiChiSoID WHERE c.NguoiCaoTuoiID=@id ORDER BY c.ThoiGianDo DESC,c.ChiSoID DESC`,
 appointments:`SELECT LichKhamID AS id,NguoiCaoTuoiID AS nguoiCaoTuoiId,TenBenhVien AS tenBenhVien,BacSiPhuTrach AS bacSiPhuTrach,ChuyenKhoa AS chuyenKhoa,
 CONVERT(VARCHAR(19),ThoiGianKham,126) AS thoiGianKham,TrangThai AS trangThai FROM LichKhamBenh WHERE NguoiCaoTuoiID=@id AND TrangThai=N'ChuaDen' AND ThoiGianKham>=DATEADD(HOUR,7,SYSUTCDATETIME()) ORDER BY ThoiGianKham,LichKhamID`,
 alerts:`SELECT CanhBaoID AS id,NguoiCaoTuoiID AS nguoiCaoTuoiId,LoaiCanhBao AS loaiCanhBao,NoiDung AS noiDung,MucDo AS mucDo,TrangThai AS trangThai,
   CONVERT(VARCHAR(19),NgayTao,126) AS ngayTao,NguonBang AS nguonBang,NguonID AS nguonId,
   NguoiXuLyID AS nguoiXuLyId,CONVERT(VARCHAR(19),NgayXuLy,126) AS ngayXuLy,GhiChuXuLy AS ghiChuXuLy
   FROM CanhBao WHERE NguoiCaoTuoiID=@id
   UNION ALL
   SELECT NULL,NguoiCaoTuoiID,N'KhanCap',NoiDung,N'KhanCap',
    CASE TrangThai WHEN N'DangGui' THEN N'ChuaXuLy' WHEN N'DaTiepNhan' THEN N'DaXem' WHEN N'DaXuLy' THEN N'DaXuLy' ELSE N'BoQua' END,
    CONVERT(VARCHAR(19),NgayGui,126),N'CanhBaoKhanCap',CanhBaoKhanCapID,NguoiXuLyID,CONVERT(VARCHAR(19),NgayXuLy,126),NULL
   FROM CanhBaoKhanCap s WHERE NguoiCaoTuoiID=@id AND NOT EXISTS(SELECT 1 FROM CanhBao c WHERE c.NguonBang=N'CanhBaoKhanCap' AND c.NguonID=s.CanhBaoKhanCapID)
   ORDER BY ngayTao DESC,id DESC`,
};
const read=section=>async(req,res,next)=>{
 try{
  if(!isMobileRole(req))return fail(res,'Đường dẫn này chỉ dành cho tài khoản mobile.','FORBIDDEN',403);
  if(!req.params.id&&req.user.tenVaiTro!=='NguoiCaoTuoi')return fail(res,'Tài khoản chưa có hồ sơ người cao tuổi của chính mình.','ELDERLY_PROFILE_NOT_FOUND',404);
  const id=req.params.id ? Number(req.params.id) : req.mobileElderlyIds?.[0];
  if(!id||!ownsElderlyId(req,id))return fail(res,'Không có quyền xem hồ sơ này.','FORBIDDEN',403);
  const pool=await poolPromise;const request=pool.request().input('id',sql.Int,id);
  if(section==='medications'){
   const valid=s=>typeof s==='string'&&/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
   const today=require('../services/careAssistant.context').vietnamNow().slice(0,10);
   const from=req.query.tuNgay||today,to=req.query.denNgay||from;
   if(!valid(from)||!valid(to)||from>to)return fail(res,'Khoảng ngày không hợp lệ.','INVALID_DATE_RANGE',400);
   request.input('from',sql.Date,from).input('to',sql.Date,to);
  }
  return ok(res,(await boundedQuery(request,statements[section])).recordset);
 }catch(error){next(error);}
};
module.exports={read};
