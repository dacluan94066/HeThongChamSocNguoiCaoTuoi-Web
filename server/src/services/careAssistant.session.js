const jwt = require('jsonwebtoken');
const {createHmac}=require('node:crypto');
const { AssistantAccessError } = require('./careAssistant.tools');
const {PERSONAL}=require('./careAssistant.context');
// Personal references carry selection only. General-health exchanges can keep a
// bounded AI reply so short follow-ups work without replaying private API output.
const contextKey=()=>createHmac('sha256',process.env.JWT_SECRET).update('care-assistant-context-v1').digest('hex');
const boundedText=(text,maxBytes)=>{
  let value=typeof text==='string'?text:'';
  while(Buffer.byteLength(value,'utf8')>maxBytes)value=value.slice(0,-1);
  return value;
};
function encodeContext(context, user, profile) {
  if (!context || ![...PERSONAL,'health_general'].includes(context.topic) || !process.env.JWT_SECRET) return null;
  if(context.topic==='health_general')context={topic:context.topic,
    question:boundedText(context.question,500),reply:boundedText(context.reply,1200)};
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
