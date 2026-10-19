// Only user wording supplies conversational references. Old assistant facts never do.
const normalize = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  .replace(/\btui\b/g, 'toi')
  .replace(/\b(?:thuoccs?|thouc|thuooc)\b/g, 'thuoc').replace(/\bkhma\b/g, 'kham')
  .replace(/\bhuyet app\b/g, 'huyet ap').replace(/\bkham benh\b/g, 'kham');
const PERSONAL = ['medications', 'appointments', 'health', 'caregivers', 'notifications', 'today', 'notes'];
function isCapabilities(question) {
  const q=normalize(question);
  return /^(?:ban|tro ly)(?: co the)? (?:giup|ho tro)(?: cho)?(?: toi| minh)?(?: duoc)? (?:gi|nhung gi|viec gi|nhung viec gi|nhu the nao)$/.test(q) ||
    /^(?:ban|tro ly) (?:lam duoc|co the lam|co chuc nang|co nhung chuc nang) (?:gi|nhung gi)$/.test(q);
}
function detectIntent(question) {
  const q = normalize(question);
  if (isCapabilities(question)) return 'capabilities';
  if (/dau nguc|kho tho|bat tinh|ngat xiu|khong tho|chay mau nhieu|meo mieng/.test(q)) return 'emergency';
  if (/chan doan|ke don|doi lieu|tang lieu|giam lieu|nen uong thuoc|bi benh gi/.test(q)) return 'medical';
  if (/sos|khan cap|cap cuu/.test(q)) return 'sos';
  if (/nhin an|nhin uong/.test(q)) return 'visit_fasting';
  if (/(chuan bi|mang theo|can mang|giay to|bhyt).*(kham|xet nghiem)|(kham|xet nghiem).*(chuan bi|mang theo|can mang|giay to|bhyt)|(truoc|khi).*kham.*(chuan bi|mang|can gi)/.test(q)) return 'visit_preparation';
  if (/nhat ky/.test(q)) return 'notes';
  if (/ke hoach|viec gi|viec can|can lam|hom nay lam|cong viec/.test(q)) return 'today';
  if (/thong bao|chua doc/.test(q)) return 'notifications';
  if (/\bkham\b|cuoc hen|hen bac si|hen benh vien/.test(q)) return 'appointments';
  if (/chi so|suc khoe|huyet ap|nhip tim|duong huyet|spo2|nhiet do|can nang/.test(q)) return 'health';
  if (/cham soc|nguoi than|ai dang|ai phu trach|so dien thoai|lien lac/.test(q)) return 'caregivers';
  if (/thuoc|uong gi|lieu dung/.test(q)) return 'medications';
  if (/doi mat khau|thay mat khau|cap nhat mat khau|doi password|change password/.test(q)) return 'change_password';
  if (/^(?:giup|ho tro)(?: cho)?(?: toi)?(?: voi| nhe| di)?$/.test(q)) return 'clarification';
  if (/huong dan|su dung|dung ung dung|tro giup|giup toi|xin chao|\bchao\b|cam on|tam biet|help/.test(q)) return 'help';
  return 'unknown';
}
function isGeneral(question) {
  const q = normalize(question);
  if (['visit_preparation','visit_fasting'].includes(detectIntent(question))) return true;
  return /la gi|nghia la|tai sao|giai thich|thong tin chung|cach cham soc/.test(q) &&
    !/cua toi|gan nhat|hom nay|toi nay|ngay mai|da luu|thuoc do|lich do|chi so do|nguoi do/.test(q);
}
const OUT_OF_SCOPE = 'Xin lỗi, tôi chỉ hỗ trợ các câu hỏi về CareSenior và sức khỏe. Bạn có thể hỏi tôi về thuốc, lịch khám, chỉ số sức khỏe, SOS hoặc cách sử dụng ứng dụng.';
function isAppGuidance(question) {
  const q = normalize(question);
  return /\b(?:lam sao|cach|huong dan|su dung|o dau|nhan nut nao|co ho tro|co chuc nang)\b/.test(q) &&
    /\b(?:xem|mo|nhap|cap nhat|them|theo doi|xac nhan|kiem tra|lich thuoc|lich kham|chi so|thong bao|canh bao|ho so|nguoi cham soc|caresenior|ung dung|app)\b/.test(q);
}
function classifyDomain(question, history = [], resolved = resolveQuestion(question, history)) {
  const q = normalize(question);
  // Explicit unrelated subjects win over incidental app/health words (e.g. "app game").
  if (/\b(?:code|coding|lap trinh|ma nguon|html|css|javascript|python|game|tro choi dien tu|chinh tri|bau cu|chung khoan|co phieu|dau tu|tai chinh|gia vang|hoc bai|hoc tap|mon hoc|bai tap|giai toan|viet (?:bai )?van|lam tho|ke chuyen|du lich|dat ve|may bay|phim anh|ca nhac|bong da|thoi tiet|may tinh|dien thoai moi|cong nghe)\b/.test(q) ||
      /\b(?:trang web|website|webpage|web site)\b/.test(q) && !/\b(?:caresenior|ung dung)\b/.test(q)) return 'OUT_OF_SCOPE';
  const intent = resolved.intent;
  if (/\b(?:toi|minh|ong|ba) (?:dang |bi |cam thay )?(?:dau|met|chong mat|buon non|sot|ho|kho ngu|te|phu|tieu chay|tao bon)\b/.test(q)) return 'HEALTH';
  if (/\bcam thay\b.*\b(?:rat te|khong khoe|kho chiu|met|dau)\b/.test(q)) return 'HEALTH';
  // Asking which medicine might help a condition is general health advice, not
  // a lookup of the caller's stored medication schedule.
  const personalLookup = /\b(?:cua toi|cho toi|cua minh|cho minh|da luu|gan nhat|hom nay|ngay mai|lich|may gio|luc nao|nguoi cham soc cua|thong bao cua|chi so cua)\b/.test(q);
  if (!personalLookup && /\bthuoc\b/.test(q) &&
      /\b(?:co thuoc nao|thuoc nao|thuoc gi|thuoc tri|thuoc chua|thuoc giam|tac dung|tac hai|dieu tri)\b/.test(q)) return 'HEALTH';
  if (['sos', 'capabilities', 'change_password', 'clarification'].includes(intent) ||
      /\b(?:caresenior|ung dung|app|tai khoan|dang nhap|dang xuat|ho so|nut|tab|man hinh|chuc nang|thao tac)\b/.test(q)) return 'APP';
  if (['emergency', 'medical', 'visit_preparation', 'visit_fasting'].includes(intent)) return 'HEALTH';
  // Questions about meaning, symptoms, care and medicines in general are not record lookups.
  const healthTopic = /\b(?:dau|met|chong mat|buon non|sot|ho|kho ngu|mat ngu|te|phu|tieu chay|tao bon|trieu chung|benh|dinh duong|an uong|van dong|tap the duc|giam can|tang can|thua can|beo phi|thuoc|lieu|huyet ap|nhip tim|duong huyet|spo2|nhiet do|can nang|suc khoe|cham soc nguoi cao tuoi)\b/.test(q);
  if (healthTopic && !personalLookup && (resolved.general ||
      /\b(?:toi bi|toi dang|toi thay|cam thay|nen lam gi|phai lam sao|co sao khong|co nguy hiem|tac dung|tac hai|la gi|tai sao|the nao|cach cham soc|nen an|nen uong|co nen|bao nhieu la|khi nao nen)\b/.test(q) ||
      ['unknown', 'medical'].includes(intent))) return 'HEALTH';
  if (intent === 'help') return 'APP';
  if (PERSONAL.includes(intent)) return 'APP';
  // Short follow-ups to a health question remain health, without inheriting any personal facts.
  const previous = [...history].reverse().find(turn => turn.role === 'user');
  if (previous && /^(?:vay|the|con|toi nen|phai lam sao|co sao khong)/.test(q) &&
      classifyDomain(previous.content, [], resolveQuestion(previous.content)) === 'HEALTH') return 'HEALTH';
  // Only genuinely vague/conversational turns may ask for clarification.
  if (/^(?:cai do sao roi|co gi hay khong|giup toi(?: voi)?|ho tro toi(?: voi)?|toi muon hoi(?: ban)?|cu the(?: hon)?|noi ro|con (?:bao lau|may ngay|gi nua)|o dau|dia chi|luc nao|may gio|bao lau|ban vua|vi du)/.test(q)) return 'APP';
  if (previous && ['help', 'capabilities'].includes(detectIntent(previous.content)) &&
      /^(?:cu the|noi ro|con gi nua|ban vua|vi du)/.test(q)) return 'APP';
  return 'OUT_OF_SCOPE';
}
function resolveQuestion(question, history = [], sessionContext = null) {
  const q = normalize(question);
  let intent = detectIntent(question);
  let reference = /(?:thuoc|lich|chi so|nguoi) (?:do|nay)|nguoi ay|^(con |luc nao|may gio|bao lau|so dien thoai|da uong|o dau|dia chi)/.test(q);
  const userTurns = history.filter(h => h.role === 'user');
  let index = userTurns.findLastIndex(h => PERSONAL.includes(detectIntent(h.content)) && !isGeneral(h.content));
  // A new unrelated turn is a boundary. Elliptical location/time continuations
  // may cross other continuations, but not a capabilities/help/unrelated turn.
  const continuation = text => /^(con |o dau|dia chi|luc nao|may gio|bao lau|so dien thoai|da uong)|(?:thuoc|lich|chi so|nguoi) (?:do|nay)/.test(normalize(text));
  const boundary = index>=0 && userTurns.slice(index+1).some(h => !continuation(h.content));
  if(boundary) index=-1;
  const previous = index >= 0 ? userTurns[index] : null;
  if (!boundary && (sessionContext?.topic==='caregivers' || previous && detectIntent(previous.content)==='caregivers') &&
      ['unknown','caregivers'].includes(intent) && /^(ong|ba|anh|chi|co|chu) (?!gi(?: |$)|the(?: |$))/.test(q)) reference=true;
  // A new explicit subject wins over the prior subject (e.g. "thuốc đó" after appointments).
  const candidate = previous ? detectIntent(previous.content) : !boundary ? sessionContext?.topic : null;
  // A follow-up operation must make sense for its subject; location cannot
  // silently become a medication lookup just because medicines came first.
  const compatible = /^(o dau|dia chi)/.test(q) ? candidate==='appointments' :
    /^so dien thoai/.test(q) ? candidate==='caregivers' : PERSONAL.includes(candidate);
  if (intent === 'unknown' && reference && compatible) intent=candidate;
  const sameContext = reference && !boundary && sessionContext?.topic===intent ? sessionContext : null;
  const anchor = reference && previous && detectIntent(previous.content) === intent
    ? userTurns.slice(index).map(h => h.content).join(' ').slice(-1500) : '';
  const combined = normalize(anchor + ' ' + question);
  const currentRelativeDay=/\bmai\b|ngay kia|ngay mot|hom qua|hom nay|toi nay|sang nay|chieu nay/.test(q);
  const rawDate = String(question).match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  const vnDate = String(question).match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  const anchorDate = !currentRelativeDay ? String(anchor).match(/\b(\d{4})-(\d{2})-(\d{2})\b/) : null;
  const targetDate = rawDate ? rawDate[0] : vnDate ? `${vnDate[3]}-${vnDate[2].padStart(2,'0')}-${vnDate[1].padStart(2,'0')}` : anchorDate?.[0] || null;
  const validDate = !targetDate || (!Number.isNaN(Date.parse(targetDate+'T00:00:00Z')) && new Date(targetDate+'T00:00:00Z').toISOString().slice(0,10)===targetDate);
  const dayOffset = /ngay kia|mot kia|ngay mot/.test(q) ? 2 : /\bmai\b/.test(q) ? 1 : /hom qua/.test(q) ? -1 :
    /hom nay|toi nay|sang nay|chieu nay/.test(q) ? 0 :
    /\bmai\b/.test(normalize(anchor)) ? 1 : /hom qua/.test(normalize(anchor)) ? -1 : 0;
  const explicitDay = Boolean(targetDate) || /\bmai\b|ngay kia|ngay mot|hom qua|hom nay|toi nay|sang nay|chieu nay/.test(combined);
  return { question, intent, anchor, reference, general: isGeneral(question), options: {
    dayOffset: sameContext && !explicitDay ? sameContext.dayOffset || 0 : dayOffset,
    explicitDay: explicitDay || Boolean(sameContext?.targetDate),
    targetDate: validDate ? targetDate || (sameContext && !explicitDay ? sameContext.targetDate : null) : null, invalidDate: !validDate,
    period: /toi nay|buoi toi|thuoc toi|toi mai/.test(q) ? 'evening' : /buoi sang|sang nay|sang mai/.test(q) ? 'morning' : /buoi chieu|chieu nay|chieu mai/.test(q) ? 'afternoon' : sameContext?.period || null,
    appointmentStatus: /da huy|bi huy|huy/.test(q) ? 'cancelled' : /da qua|da kham|truoc day|lich cu/.test(q) ? 'past' : /sap toi|tiep theo/.test(q) ? 'upcoming' : sameContext?.appointmentStatus || (/da qua|da kham|truoc day|lich cu/.test(normalize(anchor)) ? 'past' : /huy/.test(normalize(anchor)) ? 'cancelled' : 'upcoming'),
    remaining: /con .*ngay|bao lau|bao nhieu ngay/.test(q),
    nextAppointment: /tiep theo|sap toi|gan nhat/.test(normalize(anchor || question)) || Boolean(sameContext?.nextAppointment),
    specific: reference && !currentRelativeDay || /dien thoai|may gio|luc nao|lieu|cach dung/.test(q),
    location: /o dau|dia chi|noi kham/.test(q),
    healthType: ['huyet ap', 'nhip tim', 'duong huyet', 'spo2', 'nhiet do', 'can nang'].find(t => combined.includes(t)) || null,
    entityLabel: !currentRelativeDay ? sameContext?.entityLabel || null : null,
    entityId: !currentRelativeDay ? sameContext?.entityId || null : null,
  } };
}
function vietnamNow(now = new Date()) {
  // DATETIME2 values are local wall times in this application, not UTC instants.
  return new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 19);
}
module.exports = { normalize, detectIntent, resolveQuestion, classifyDomain, isAppGuidance, OUT_OF_SCOPE, isGeneral, isCapabilities, vietnamNow, PERSONAL };
