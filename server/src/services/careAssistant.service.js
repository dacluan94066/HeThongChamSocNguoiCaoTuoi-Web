// Deterministic, read-only assistant. Stored notes are data, never instructions.
const { normalize, resolveQuestion, detectIntent } = require('./careAssistant.context');

const value = (v, fallback = 'Chưa ghi nhận') => v == null || String(v).trim() === '' ? fallback : String(v).trim().slice(0, 400);
const dateOnly = raw => String(raw || '').replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1');
const time = (raw) => {
  if (!raw) return 'Chưa ghi thời gian';
  // SQL DATETIME2 is serialized without a timezone; keep the stored wall time.
  const match = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return match ? `${match[4]}:${match[5]} ${match[3]}/${match[2]}/${match[1]}` : value(raw);
};
const medication = (r) => `• ${value(r.tenThuoc)} — liều đã lưu: ${value(r.lieuDung)}; lịch ${time(r.thoiGianDuKien)}; ${({ChuaDenGio:'Chưa có xác nhận uống',DaUong:'Đã xác nhận uống',BoLo:'Đã ghi nhận bỏ lỡ',TuChoi:'Đã ghi nhận từ chối'})[r.trangThai] || value(r.trangThai)}${r.thoiGianThucTe ? ' lúc ' + time(r.thoiGianThucTe) : ''}`;
const appointment = (r) => `• ${time(r.thoiGianKham)} — ${value(r.tenBenhVien)}, bác sĩ: ${value(r.bacSiPhuTrach)}${r.trangThai ? '; ' + (({ChuaDen:'Chưa đến',DaKham:'Đã khám',DaHuy:'Đã hủy',Huy:'Đã hủy',DaDoiLich:'Đã đổi lịch'})[r.trangThai] || 'Chưa rõ trạng thái') : ''}`;
const allowedActions = new Set(['medications','appointments','health','caregivers','notifications','notes','sos']);
async function answer({ question, history = [], profile, user, repository, resolved, now = new Date() }) {
  const context = resolved || resolveQuestion(question, history);
  const intent = context.intent;
  if (context.options.invalidDate) return {mode:'functional',intent,profile,text:'Ngày bạn nhập chưa hợp lệ. Bạn cho mình ngày theo dạng ngày/tháng/năm nhé.',actions:[],rows:[],truncated:false,fetchedAt:new Date().toISOString()};
  let text; let rows = []; let actions = []; let truncated = false;
  const load = async (section) => {
    const result = await repository.read(section, profile?.id, user.userId, { ...context.options, now });
    truncated ||= result.truncated;
    return result.rows;
  };
  const sayRows = (items, render, empty) => items.length ? items.map(render).join('\n') : empty;
  const select = (items, name) => {
    const wording = normalize(question + ' ' + context.anchor);
    const matched = items.filter(r => {
      if (!r[name]) return false;
      const label = normalize(r[name]);
      if (wording.includes(label)) return true;
      const lastName = label.split(' ').at(-1);
      return intent === 'caregivers' && ['ong','ba','anh','chi','co','chu'].some(title => (' ' + wording + ' ').includes(' ' + title + ' ' + lastName + ' '));
    });
    if (intent==='appointments' && context.options.entityId) {
      const selected=items.filter(r=>r.id===context.options.entityId);
      if(selected.length) return selected;
      text='Lịch vừa nhắc tới không còn phù hợp với trạng thái đang tra. Bạn muốn xem lịch sắp tới hay lịch đã hủy?';
      return null;
    }
    if (matched.length && (intent==='medications' || matched.length===1)) return matched;
    if (matched.length>1) { text=intent==='appointments'?'Có nhiều lịch phù hợp. Bạn muốn hỏi ngày hoặc giờ khám nào?':'Có nhiều người chăm sóc phù hợp. Bạn muốn hỏi người nào?';return null; }
    if (context.options.entityLabel) {
      const selected = items.filter(r => normalize(r[name])===normalize(context.options.entityLabel));
      if (selected.length && (intent==='medications' || selected.length===1)) return selected;
      if (selected.length>1) { text=intent==='appointments'?'Có nhiều lịch cùng địa điểm. Bạn cho mình ngày hoặc giờ khám để chọn đúng nhé.':'Có nhiều người chăm sóc cùng tên. Bạn muốn hỏi người nào?';return null; }
      text='Đối tượng vừa nhắc tới không còn trong dữ liệu của khoảng thời gian này. Bạn muốn tra lại đối tượng nào?';
      return null;
    }
    if (!context.options.specific) return items;
    if (intent === 'appointments' && context.options.nextAppointment && items.length &&
        (items.length === 1 || items[0].thoiGianKham !== items[1].thoiGianKham)) return items.slice(0, 1);
    const identities = new Set(items.map(r => normalize(r[name])));
    if (identities.size > 1 || (items.length > 1 && intent === 'appointments')) {
      text = intent === 'caregivers' ? 'Bạn muốn hỏi người chăm sóc nào?' : intent === 'medications' ? 'Bạn muốn hỏi thuốc nào?' : 'Bạn muốn hỏi lịch khám nào?';
      text += '\n' + [...new Set(items.map(r => value(r[name])))].slice(0, 5).join(', ');
      return null;
    }
    return items;
  };
  const displayed = (items, render, empty) => {
    if (items.length > 5) truncated = true;
    return sayRows(items.slice(0, 5), render, empty);
  };
  if (context.general) {
    if (repository.authorize) await repository.authorize(false);
    return { mode:'functional', intent:'help', profile, text:'Mình chưa trả lời được phần giải thích chung này. Bạn có thể hỏi lại cụ thể hơn hoặc tra dữ liệu đã lưu.', actions:[], rows:[], truncated:false, fetchedAt:new Date().toISOString() };
  }
  switch (intent) {
      case 'capabilities':
        text = 'Mình có thể giúp bạn xem lịch thuốc và việc đã xác nhận uống, lịch khám, chỉ số sức khỏe đã lưu, người chăm sóc, thông báo và nhật ký. Bạn cũng có thể hỏi cách dùng ứng dụng; nếu chăm sóc nhiều người, hãy chọn hồ sơ trước khi hỏi dữ liệu của họ. Mình không chẩn đoán, kê thuốc, đổi liều hoặc tự gửi SOS.';
        break;
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
      rows = rows.filter(r => !context.options.period || (context.options.period === 'evening' ? Number(r.thoiGianDuKien?.slice(11,13)) >= 17 : context.options.period === 'morning' ? Number(r.thoiGianDuKien?.slice(11,13)) < 12 : Number(r.thoiGianDuKien?.slice(11,13)) >= 12 && Number(r.thoiGianDuKien?.slice(11,13)) < 17));
      { const selected = select(rows, 'tenThuoc');
        if (selected) {
          rows = selected;
          const render = context.options.remaining ? r => `• ${value(r.tenThuoc)}: ${r.ngayKetThuc && Number.isInteger(r.soNgayConLai) ? (r.soNgayConLai >= 0 ? `còn ${r.soNgayConLai} ngày đến ngày kết thúc đã lưu ${dateOnly(r.ngayKetThuc)}` : `ngày kết thúc đã lưu là ${dateOnly(r.ngayKetThuc)}, đã qua ${-r.soNgayConLai} ngày`) : 'chưa ghi ngày kết thúc, mình chưa tính được số ngày còn lại'}.` : medication;
          text = displayed(rows, render, 'Chưa có lịch uống thuốc trong khoảng thời gian bạn hỏi được lưu cho hồ sơ này.');
        } }
      actions = ['medications']; break;
    case 'appointments':
      rows = await load('appointments');
      if (context.options.remaining || context.reference) {
        const selected = select(rows, 'tenBenhVien');
        if (!selected) { actions = ['appointments']; break; }
        rows = selected;
      }
      text = displayed(rows, appointment, 'Chưa có lịch khám phù hợp với thời gian và trạng thái bạn hỏi được lưu cho hồ sơ này.');
      if (rows.length === 1 && context.options.location) text = 'Địa điểm khám đã lưu: ' + value(rows[0].tenBenhVien) + '.';
      if (rows.length === 1 && context.options.remaining && Number.isInteger(rows[0].soNgayConLai)) {
        const days = rows[0].soNgayConLai;
        text = (days >= 0 ? `Còn ${days} ngày theo ngày lịch Việt Nam.` : `Lịch này đã qua ${-days} ngày.`) + '\n' + appointment(rows[0]);
      }
      if (!context.options.explicitDay && context.options.appointmentStatus === 'upcoming' && !context.options.remaining && !context.reference) {
        const next = rows.filter(r=>r.thoiGianKham===rows[0]?.thoiGianKham);
        text = next.length > 1 ? 'Có nhiều lịch cùng thời điểm gần nhất. Bạn muốn hỏi lịch nào?\n' + displayed(next,appointment,'') : rows.length ? 'Lịch khám tiếp theo:\n' + appointment(rows[0]) : 'Chưa có lịch khám sắp tới được lưu cho hồ sơ này.';
      }
      actions = ['appointments']; break;
    case 'health':
      rows = await load('health');
      if (context.options.healthType) rows = rows.filter(r => normalize(r.tenChiSo).includes(context.options.healthType));
      else if (context.options.entityLabel) rows = rows.filter(r => normalize(r.tenChiSo).includes(normalize(context.options.entityLabel)));
      if (context.reference && !context.options.healthType && rows.length > 1) {
        text = 'Bạn muốn hỏi chỉ số nào: ' + rows.slice(0,5).map(r => value(r.tenChiSo)).join(', ') + '?';
        actions = ['health']; break;
      }
      text = displayed(rows, r => `• ${value(r.tenChiSo)}: ${value(r.giaTri)}${r.giaTriPhu == null ? '' : '/' + r.giaTriPhu} ${value(r.donVi, '')} — đo lúc ${time(r.thoiGianDo)}${r.laBatThuong === true || r.laBatThuong === 1 ? '; bản ghi được đánh dấu bất thường' : ''}`, 'Chưa có chỉ số sức khỏe được lưu cho hồ sơ này.');
      text += '\nĐây là số đo đã lưu, không phải đánh giá sức khỏe tổng thể hiện tại.'; actions = ['health']; break;
    case 'caregivers':
      rows = await load('caregivers');
      { const selected = select(rows, 'hoTen'); if (selected) { rows = selected; text = displayed(rows, r => `• ${value(r.hoTen)} — điện thoại: ${value(r.soDienThoai)}`, 'Chưa có người chăm sóc đang được phân công cho hồ sơ này.'); } }
      actions = ['caregivers']; break;
    case 'notifications':
      rows = await load('notifications');
      text = rows.length ? `Tài khoản của bạn có ${rows[0].soChuaDoc} thông báo chưa đọc.` : 'Không tải được số thông báo.';
      actions = ['notifications']; break;
    case 'notes':
      rows = await load('notes');
      text = displayed(rows, r => `• ${time(r.ngayGhi)} — ${value(r.hoatDong)}\n${value(r.moTaChiTiet)}`, 'Chưa có nhật ký chăm sóc được lưu cho hồ sơ này.'); actions = ['notes']; break;
    case 'today': {
      const meds = await load('medications');
      const appointments = await load('todayAppointments');
      const notes = await load('todayNotes');
      text = 'Việc theo lịch đã lưu trong ngày bạn hỏi:\n' +
        displayed(meds, medication, '• Chưa có lịch thuốc trong ngày này.') + '\n' +
        displayed(appointments, appointment, '• Chưa có lịch khám trong ngày này.') +
        `\nNhật ký đã ghi hôm nay: ${notes.length}${truncated ? ' (danh sách có giới hạn)' : ''} mục.` +
        '\nĐây là tổng hợp lịch đã lưu, không phải kế hoạch điều trị mới.';
      actions = ['medications','appointments','notes']; break;
    }
    case 'clarification':
      text = 'Bạn cần mình hỗ trợ việc gì? Bạn có thể nói rõ về lịch thuốc, lịch khám, chỉ số hoặc cách dùng ứng dụng nhé.';
      break;
    case 'help':
      text = /chao/.test(normalize(question)) ? 'Chào bạn! Bạn muốn mình giúp việc gì hôm nay?' : /cam on/.test(normalize(question)) ? 'Rất vui được giúp bạn.' : /tam biet/.test(normalize(question)) ? 'Chào bạn, hẹn gặp lại nhé.' : 'Bạn có thể hỏi dữ liệu đã lưu hoặc chọn nút dưới câu trả lời để xem chi tiết. Nếu chăm sóc nhiều người, hãy chọn hồ sơ ở phía trên trước khi hỏi.';
      break;
    default:
      text = /tro chuyen|noi chuyen|ke chuyen|toi (?:dang )?(?:buon|vui|co don)/.test(normalize(question)) ? 'Mình đang nghe đây. Bạn muốn chia sẻ điều gì?' : 'Bạn muốn hỏi về thuốc, lịch khám, chỉ số hay người chăm sóc? Bạn nói thêm một chút để mình tra đúng nhé.';
  }
  if (repository.authorize) await repository.authorize(Boolean(profile) && actions.some(a => a !== 'notifications'));
  if (truncated) text += '\nCó thêm bản ghi; bạn có thể mở chi tiết để xem.';
  const field=({medications:'tenThuoc',appointments:'tenBenhVien',health:'tenChiSo',caregivers:'hoTen'})[intent];
  const labels=field ? [...new Set(rows.map(r=>r[field]).filter(Boolean))] : [];
  const nextIsUnique=rows.length===1 || (rows.length>1&&rows[0].thoiGianKham!==rows[1].thoiGianKham);
  const entityLabel=labels.length===1 && (intent!=='appointments'||rows.length===1) ? labels[0] : intent==='appointments' && context.options.nextAppointment && rows.length && nextIsUnique ? rows[0][field] : intent==='health' ? context.options.healthType || context.options.entityLabel : null;
  const entityId=intent==='appointments' && (rows.length===1 || context.options.nextAppointment && nextIsUnique) ? rows[0]?.id || null : null;
  const conversationContext={topic:intent,entityLabel,entityId,dayOffset:context.options.dayOffset,targetDate:context.options.targetDate,nextAppointment:context.options.nextAppointment,period:context.options.period,appointmentStatus:context.options.appointmentStatus};
  return {mode:'functional', intent, profile, text: text.slice(0,2200), actions:actions.filter(a => allowedActions.has(a) && (a === 'notifications' || a === 'sos' || Boolean(profile))), rows, truncated, fetchedAt:new Date().toISOString(), dataTimeZone:'Asia/Ho_Chi_Minh',conversationContext};
}
module.exports = { normalize, detectIntent, answer };
