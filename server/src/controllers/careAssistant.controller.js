const { poolPromise, sql } = require('../config/db');
const { ok, fail } = require('../utils/response');
const { ownsElderlyId } = require('../middlewares/mobile-scope.middleware');
const { detectIntent, answer } = require('../services/careAssistant.service');
const { createRepository } = require('../services/careAssistant.repository');
const { chat, configuration, validateHistory } = require('../services/careAssistant.ai');
const { createScopedRepository, AssistantAccessError } = require('../services/careAssistant.tools');
const { boundedQuery } = require('../utils/boundedQuery');
const { encodeContext,decodeContext } = require('../services/careAssistant.session');
const roles = new Set(['NguoiCaoTuoi','NguoiChamSoc']);
const buckets = new Map();
const protect = async (req,res,next) => {
  req.assistantDeadline = Date.now() + 35000;
  if (!roles.has(req.user?.tenVaiTro)) return fail(res,'Trợ lý chỉ hỗ trợ tài khoản Mobile.','FORBIDDEN',403);
  const key = req.user.userId; const now=Date.now();
  // Bounded, per-process rate limit. No questions or medical data are retained.
  let bucket = buckets.get(key);
  if (!bucket || now-bucket.start >= 60000) bucket={start:now,count:0};
  if (++bucket.count > 30) { res.set('Retry-After','60'); return fail(res,'Bạn hỏi quá nhanh. Vui lòng chờ một phút.','RATE_LIMIT',429); }
  if (buckets.size >= 10000 && !buckets.has(key)) buckets.delete(buckets.keys().next().value);
  buckets.set(key,bucket);
  res.set('Cache-Control','no-store');
  try {
    const pool = await poolPromise;
    const request = pool.request(); request.timeout=10000;
    request.input('userId',sql.Int,key);
    const account = await boundedQuery(request, `
      SELECT nd.TrangThai AS trangThai,vt.TenVaiTro AS tenVaiTro FROM NguoiDung nd
      JOIN VaiTro vt ON vt.VaiTroID=nd.VaiTroID WHERE nd.UserID=@userId`,req.assistantDeadline);
    const row=account.recordset[0];
    if (!row || row.trangThai !== 'HoatDong' || row.tenVaiTro !== req.user.tenVaiTro)
      return fail(res,'Tài khoản đã khóa hoặc vai trò đã thay đổi. Vui lòng đăng nhập lại.','ACCOUNT_UNAVAILABLE',403);
    next();
  } catch (_) { return fail(res,'Không tải được dữ liệu từ máy chủ. Vui lòng thử lại.','DATA_UNAVAILABLE',503); }
};
const profiles = async (req,res) => {
  try {
    const ids=req.mobileElderlyIds || [];
    if (!ids.length) return ok(res,[]);
    const pool=await poolPromise; const request=pool.request(); request.timeout=10000;
    const parameters=ids.map((id,i) => {request.input('id'+i,sql.Int,id); return '@id'+i;});
    const result=await boundedQuery(request,`SELECT NguoiCaoTuoiID AS id,HoTen AS hoTen FROM HoSoNguoiCaoTuoi
      WHERE NguoiCaoTuoiID IN (${parameters.join(',')}) ORDER BY HoTen,NguoiCaoTuoiID`,req.assistantDeadline);
    return ok(res,result.recordset);
  } catch (_) {return fail(res,'Không tải được danh sách hồ sơ.','DATA_UNAVAILABLE',503);}
};
const query = async (req,res) => {
  const body=req.body;
  const aiEnabled=req.route?.path === '/chat';
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(k => !(aiEnabled ? ['question','elderlyId','history','conversationToken'] : ['question','elderlyId']).includes(k)) ||
      typeof body.question !== 'string' || !body.question.trim() || body.question.length > 500)
    return fail(res,'Câu hỏi cần từ 1 đến 500 ký tự.','INVALID_QUESTION',400);
  if (aiEnabled && !validateHistory(body.history)) return fail(res,'Lịch sử hội thoại không hợp lệ.','INVALID_HISTORY',400);
  if (body.elderlyId != null && (!Number.isInteger(body.elderlyId) || body.elderlyId<1 || body.elderlyId>2147483647))
    return fail(res,'Hồ sơ không hợp lệ.','INVALID_PROFILE',400);
  const intent=detectIntent(body.question);
  const needsProfile=!['clarification','capabilities','help','unknown','notifications','sos','emergency','medical','visit_preparation','visit_fasting'].includes(intent);
  let id=body.elderlyId;
  if (req.user.tenVaiTro==='NguoiCaoTuoi') {
    const ownId=req.mobileElderlyIds?.[0];
    if (id != null && id!==ownId) return fail(res,'Bạn chỉ được hỏi hồ sơ của mình.','FORBIDDEN_ELDERLY',403);
    id=ownId;
  }
  if (id != null && !ownsElderlyId(req,id)) return fail(res,'Bạn không được phân công chăm sóc hồ sơ này.','FORBIDDEN_ELDERLY',403);
  if (!aiEnabled && needsProfile && id == null) return fail(res,
    req.user.tenVaiTro==='NguoiChamSoc' ? 'Hãy chọn một hồ sơ đang được phân công.' : 'Tài khoản chưa có hồ sơ liên kết.',
    'PROFILE_REQUIRED',req.user.tenVaiTro==='NguoiChamSoc' ? 400 : 404);
  try {
    const pool=await poolPromise; let profile=null;
    if (id != null) {
      const request=pool.request();request.timeout=10000;
      request.input('id',sql.Int,id);
      const result=await boundedQuery(request,'SELECT NguoiCaoTuoiID AS id,HoTen AS hoTen FROM HoSoNguoiCaoTuoi WHERE NguoiCaoTuoiID=@id',req.assistantDeadline);
      if (!result.recordset.length) return fail(res,'Không tìm thấy hồ sơ.','PROFILE_NOT_FOUND',404);
      profile=result.recordset[0];
    }
    const sessionContext=aiEnabled ? decodeContext(body.conversationToken,req.user,profile) : null;
    const data=aiEnabled
      ? await chat({question:body.question,history:body.history,profile,user:req.user,sessionContext,
        repository:createScopedRepository(pool,sql,req.user,profile,req.assistantDeadline)})
      : await answer({question:body.question,profile,user:req.user,repository:createScopedRepository(pool,sql,req.user,profile,req.assistantDeadline)});
    const {conversationContext,...reply}=data;
    return ok(res,{...reply,conversationToken:aiEnabled ? encodeContext(conversationContext,req.user,profile) : null});
  } catch (error) {
    if (error instanceof AssistantAccessError) return fail(res,error.message,error.code,error.status);
    return fail(res,'Không tải được dữ liệu. Vui lòng thử lại; đây không phải kết quả chưa có dữ liệu.','DATA_UNAVAILABLE',503);
  }
};
const status = (req,res) => {
  const config = configuration();
  return ok(res, { aiConfigured: config.configured,
    provider: config.provider === 'groq' ? 'groq' : 'unsupported',
    model: config.model || null, keyConfigured: Boolean(config.key) });
};
const ownCaregivers = async (req,res) => {
  if (req.user.tenVaiTro !== 'NguoiCaoTuoi') return fail(res,'Chỉ người cao tuổi được xem người chăm sóc của mình.','FORBIDDEN',403);
  const id=req.mobileElderlyIds?.[0];
  if (!id) return fail(res,'Tài khoản chưa có hồ sơ liên kết.','PROFILE_NOT_FOUND',404);
  try {
    const request=(await poolPromise).request();request.timeout=10000;
    const result=await request.input('id',sql.Int,id).query(`
      SELECT DISTINCT ncs.NguoiChamSocID AS id,ncs.HoTen AS hoTen,ncs.SoDienThoai AS soDienThoai,
        lk.LaChinh AS laChinh,lk.MoiQuanHe AS moiQuanHe
      FROM NguoiCaoTuoi_NguoiChamSoc lk JOIN NguoiChamSoc ncs ON ncs.NguoiChamSocID=lk.NguoiChamSocID
      WHERE lk.NguoiCaoTuoiID=@id AND lk.NgayBatDau<=CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE)
        AND (lk.NgayKetThuc IS NULL OR lk.NgayKetThuc>=CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE))
      ORDER BY laChinh DESC,hoTen,id`);
    return ok(res,result.recordset);
  } catch (_) { return fail(res,'Không tải được người chăm sóc.','DATA_UNAVAILABLE',503); }
};
const assignedProfiles = async (req,res) => {
  if (req.user.tenVaiTro !== 'NguoiChamSoc') return fail(res,'Chỉ người chăm sóc được xem phân công.','FORBIDDEN',403);
  try {
    const pool=await poolPromise;const request=pool.request();request.timeout=10000;
    const result=await request.input('userId',sql.Int,req.user.userId).query(`
      SELECT nct.NguoiCaoTuoiID AS id,nct.HoTen AS hoTen,nct.NgaySinh AS ngaySinh,
        nct.GioiTinh AS gioiTinh,nct.TrangThai AS trangThai,lk.LaChinh AS laChinh,lk.MoiQuanHe AS moiQuanHe,
        DATEDIFF(YEAR,nct.NgaySinh,GETDATE()) - CASE WHEN DATEADD(YEAR,DATEDIFF(YEAR,nct.NgaySinh,GETDATE()),nct.NgaySinh)>GETDATE() THEN 1 ELSE 0 END AS tuoi,
        pending.CanhBaoKhanCapID AS canhBaoKhanCapId,pending.NoiDung AS noiDungCanhBao,CONVERT(VARCHAR(19),pending.NgayGui,126) AS ngayGuiCanhBao,
        CAST(CASE WHEN pending.CanhBaoKhanCapID IS NULL THEN 0 ELSE 1 END AS BIT) AS coCanhBaoKhanCap
      FROM NguoiChamSoc ncs JOIN NguoiCaoTuoi_NguoiChamSoc lk ON lk.NguoiChamSocID=ncs.NguoiChamSocID
      JOIN HoSoNguoiCaoTuoi nct ON nct.NguoiCaoTuoiID=lk.NguoiCaoTuoiID
      OUTER APPLY (SELECT TOP 1 kc.CanhBaoKhanCapID,kc.NoiDung,kc.NgayGui FROM CanhBaoKhanCap kc
        WHERE kc.NguoiCaoTuoiID=nct.NguoiCaoTuoiID AND kc.TrangThai IN (N'DangGui',N'DaTiepNhan')
        ORDER BY kc.NgayGui DESC,kc.CanhBaoKhanCapID DESC) pending
      WHERE ncs.UserID=@userId AND lk.NgayBatDau<=CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE)
        AND (lk.NgayKetThuc IS NULL OR lk.NgayKetThuc>=CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE)) ORDER BY coCanhBaoKhanCap DESC,nct.HoTen`);
    return ok(res,result.recordset);
  } catch (_) { return fail(res,'Không tải được hồ sơ được phân công.','DATA_UNAVAILABLE',503); }
};
module.exports={protect,profiles,query,status,ownCaregivers,assignedProfiles};
