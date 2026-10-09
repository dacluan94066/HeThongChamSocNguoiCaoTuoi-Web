// Deterministic, read-only assistant. Stored notes are data, never instructions.
const normalize = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function detectIntent(question) {
  const q = normalize(question);
  if (/dau nguc|kho tho|bat tinh|ngat xiu|khong tho|chay mau nhieu|meo mieng/.test(q)) return 'emergency';
  if (/chan doan|ke don|doi lieu|tang lieu|giam lieu|nen uong thuoc|bi benh gi/.test(q)) return 'medical';
  if (/sos|khan cap|cap cuu/.test(q)) return 'sos';
  if (/nhat ky/.test(q)) return 'notes';
  if (/ke hoach|viec gi|viec can|can lam|hom nay lam|cong viec/.test(q)) return 'today';
  if (/thong bao|chua doc/.test(q)) return 'notifications';
  if (/lich kham|kham tiep|kham khi|kham vao|hen kham/.test(q)) return 'appointments';
  if (/chi so|suc khoe|huyet ap|nhip tim|duong huyet|spo2|nhiet do/.test(q)) return 'health';
  if (/cham soc|nguoi than|ai dang|ai phu trach/.test(q)) return 'caregivers';
  if (/thuoc|uong gi|lieu dung/.test(q)) return 'medications';
  if (/huong dan|su dung|dung ung dung|tro giup|giup toi|xin chao|chao|help/.test(q)) return 'help';
  return 'unknown';
}
const value = (v, fallback = 'Chưa ghi nhận') => v == null || String(v).trim() === '' ? fallback : String(v).slice(0, 400);
const time = (raw) => {
  if (!raw) return 'Chưa ghi thời gian';
  // SQL DATETIME2 is serialized without a timezone; keep the stored wall time.
  const match = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return match ? `${match[4]}:${match[5]} ${match[3]}/${match[2]}/${match[1]}` : value(raw);
};
const medication = (r) => `• ${value(r.tenThuoc)} — liều: ${value(r.lieuDung)}; ${time(r.thoiGianDuKien)}; ${({ChuaDenGio:'Chưa uống',DaUong:'Đã uống',BoLo:'Bỏ lỡ',TuChoi:'Từ chối'})[r.trangThai] || value(r.trangThai)}`;
const appointment = (r) => `• ${time(r.thoiGianKham)} — ${value(r.tenBenhVien)}, bác sĩ: ${value(r.bacSiPhuTrach)}`;
const allowedActions = new Set(['medications','appointments','health','caregivers','notifications','notes','sos']);
async function answer({ question, profile, user, repository }) {
  const intent = detectIntent(question);
  let text; let rows = []; let actions = []; let truncated = false;
  const load = async (section) => {
    const result = await repository.read(section, profile?.id, user.userId);
    truncated ||= result.truncated;
    return result.rows;
  };
  const sayRows = (items, render, empty) => items.length ? items.map(render).join('\n') : empty;
  switch (intent) {
    case 'emergency':
      text = 'Nếu đang có triệu chứng này, hãy tìm hỗ trợ y tế ngay và liên hệ người chăm sóc/người thân. Đừng chờ trả lời trong chat. Tôi không thể chẩn đoán tình trạng của bạn.';
      actions = user.tenVaiTro === 'NguoiCaoTuoi' ? ['sos','caregivers'] : ['caregivers']; break;
    case 'medical':
      text = 'Tôi không chẩn đoán, kê thuốc hoặc thay đổi liều. Hãy hỏi bác sĩ/dược sĩ. Tôi có thể tra lịch thuốc đã lưu và chỉ số gần nhất.';
      actions = ['medications','health']; break;
    case 'sos':
      text = user.tenVaiTro === 'NguoiCaoTuoi'
        ? 'Mở màn hình Người chăm sóc, chọn gửi SOS rồi xác nhận. Chỉ khi bạn xác nhận, ứng dụng mới gửi cảnh báo. Kết quả gửi sẽ hiển thị số người chăm sóc được tạo thông báo.'
        : 'Người chăm sóc không gửi SOS thay người cao tuổi qua trợ lý. Hãy liên hệ người được chăm sóc và tìm hỗ trợ y tế khi cần.';
      actions = user.tenVaiTro === 'NguoiCaoTuoi' ? ['sos','caregivers'] : ['caregivers']; break;
    case 'medications':
      rows = await load('medications');
      text = sayRows(rows, medication, 'Chưa có lịch uống thuốc hôm nay được lưu cho hồ sơ này.');
      text += '\nDùng theo hướng dẫn đã lưu; trợ lý không thay đổi liều.'; actions = ['medications']; break;
    case 'appointments':
      rows = await load('appointments');
      text = rows.length ? 'Lịch khám tiếp theo:\n' + appointment(rows[0]) : 'Chưa có lịch khám sắp tới được lưu cho hồ sơ này.';
      actions = ['appointments']; break;
    case 'health':
      rows = await load('health');
      text = sayRows(rows, r => `• ${value(r.tenChiSo)}: ${value(r.giaTri)}${r.giaTriPhu == null ? '' : '/' + r.giaTriPhu} ${value(r.donVi, '')} — đo lúc ${time(r.thoiGianDo)}${r.laBatThuong === true || r.laBatThuong === 1 ? '; backend đánh dấu bất thường' : ''}`, 'Chưa có chỉ số sức khỏe được lưu cho hồ sơ này.');
      text += '\nMột chỉ số không đủ để xác nhận bạn an toàn. Trợ lý không tự đánh giá ngưỡng hoặc chẩn đoán.'; actions = ['health']; break;
    case 'caregivers':
      rows = await load('caregivers');
      text = sayRows(rows, r => `• ${value(r.hoTen)} — điện thoại: ${value(r.soDienThoai)}`, 'Chưa có người chăm sóc đang được phân công cho hồ sơ này.'); actions = ['caregivers']; break;
    case 'notifications':
      rows = await load('notifications');
      text = rows.length ? `Tài khoản của bạn có ${rows[0].soChuaDoc} thông báo chưa đọc.` : 'Không tải được số thông báo.';
      actions = ['notifications']; break;
    case 'notes':
      rows = await load('notes');
      text = sayRows(rows, r => `• ${time(r.ngayGhi)} — ${value(r.hoatDong)}\n${value(r.moTaChiTiet)}`, 'Chưa có nhật ký chăm sóc được lưu cho hồ sơ này.'); actions = ['notes']; break;
    case 'today': {
      const meds = await load('medications');
      const appointments = await load('todayAppointments');
      const notes = await load('todayNotes');
      text = 'Việc hôm nay theo dữ liệu đã lưu:\n' +
        sayRows(meds, medication, '• Chưa có lịch thuốc hôm nay.') + '\n' +
        sayRows(appointments, appointment, '• Chưa có lịch khám hôm nay.') +
        `\nNhật ký đã ghi hôm nay: ${notes.length}${truncated ? ' (danh sách có giới hạn)' : ''} mục.` +
        '\nProject chưa có module kế hoạch chăm sóc riêng. Đây là tổng hợp lịch đã lưu, không phải kế hoạch do bác sĩ lập.';
      actions = ['medications','appointments','notes']; break;
    }
    case 'help':
      text = 'Tôi là Trợ lý chăm sóc ở chế độ tra cứu theo chức năng, chưa kết nối AI trò chuyện mở. Bạn có thể hỏi thuốc hôm nay, lịch khám, chỉ số gần nhất, người chăm sóc, thông báo, việc hôm nay hoặc mở nhật ký. Chọn nút dưới câu trả lời để mở màn hình tương ứng. Với người chăm sóc, hãy chọn đúng hồ sơ phía trên.';
      break;
    default:
      text = 'Tôi chưa hiểu câu hỏi này. Hãy thử: “Hôm nay tôi uống thuốc gì?”, “Lịch khám tiếp theo?” hoặc “Hôm nay cần làm những việc gì?”. Tôi đang tra cứu theo chức năng, không trò chuyện mở.';
  }
  return {mode:'functional', intent, profile, text, actions:actions.filter(a => allowedActions.has(a)), rows, truncated, fetchedAt:new Date().toISOString()};
}
module.exports = { normalize, detectIntent, answer };
