const jwt = require('jsonwebtoken');
const {createHmac}=require('node:crypto');
const { AssistantAccessError } = require('./careAssistant.tools');
const {PERSONAL}=require('./careAssistant.context');
// A signed reference carries subject/selection, never old measurements, doses or phone numbers.
const contextKey=()=>createHmac('sha256',process.env.JWT_SECRET).update('care-assistant-context-v1').digest('hex');
function encodeContext(context, user, profile) {
  if (!context || !PERSONAL.includes(context.topic) || !process.env.JWT_SECRET) return null;
  return jwt.sign({kind:'care-assistant-context',accountId:user.userId,profileId:profile?.id || null,context},
    contextKey(),{expiresIn:'30m'});
}
function decodeContext(token, user, profile) {
  if (token == null) return null;
  try {
    if (typeof token !== 'string' || token.length > 4000) throw new Error('Invalid');
    const decoded=jwt.verify(token,contextKey());
    if (decoded.kind!=='care-assistant-context' || decoded.accountId!==user.userId || decoded.profileId!==(profile?.id || null)) throw new Error('Invalid');
    return decoded.context;
  } catch (_) { throw new AssistantAccessError('Ngữ cảnh đã hết hạn hoặc đổi hồ sơ. Hãy xóa cuộc trò chuyện rồi hỏi lại.',400,'INVALID_CONTEXT'); }
}
module.exports={encodeContext,decodeContext};
