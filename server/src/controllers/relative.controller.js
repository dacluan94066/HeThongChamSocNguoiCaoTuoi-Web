const { poolPromise, sql } = require('../config/db');
const { ok, fail } = require('../utils/response');
const { RelativeError, readOptions } = require('../utils/relativeValidation');
const { createRelativeAccess } = require('../services/relativeAccess.service');
const { createRelativeReadRepository } = require('../services/relativeRead.repository');
const { emitToUser } = require('../socket');

const endpoint = (handler) => async(req,res) => {
  res.set('Cache-Control','no-store');
  try {
    const pool=await poolPromise;
    const access=createRelativeAccess(pool,sql,{onAccessChanged:(userId,payload)=>emitToUser(userId,'relatives:access-changed',payload)});
    return ok(res,await handler(req,access,createRelativeReadRepository(pool,sql)));
  } catch (error) {
    if (error instanceof RelativeError) return fail(res,error.message,error.code,error.status);
    // Never send SQL, consent proof, or user input through the general error logger.
    return fail(res,'Không thể xử lý dữ liệu Người thân. Vui lòng thử lại.','RELATIVES_UNAVAILABLE',503);
  }
};
module.exports = {
  listLinks:endpoint((req,access)=>access.list(req.user.userId,req.query)),
  grant:endpoint((req,access)=>access.grant(req.user.userId,req.body)),
  update:endpoint((req,access)=>access.update(req.user.userId,req.params.id,req.body)),
  revoke:endpoint((req,access)=>access.revoke(req.user.userId,req.params.id,req.body)),
  history:endpoint((req,access)=>access.history(req.user.userId,req.params.id,readOptions(req.query))),
  elderly:endpoint((req,_access,reads)=>reads.elderly(req.user.userId,req.query)),
  read:section=>endpoint((req,_access,reads)=>reads.read(req.user.userId,req.params.id,section,req.query)),
  notifications:endpoint((req,_access,reads)=>reads.notifications(req.user.userId,req.query)),
};
