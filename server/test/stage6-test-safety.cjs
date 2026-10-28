const Module = require('node:module');
const path = require('node:path');

// SQL integration tests must inject their guarded Stage6 pool everywhere.
// Accidentally importing production config/db must fail before opening a socket.
exports.forbidLiveDbImport = t => {
  const liveFile = path.resolve(__dirname, '../src/config/db.js').toLowerCase();
  const original = Module._load;
  Module._load = function (name, parent, ...rest) {
    const resolved = Module._resolveFilename(name, parent);
    if (typeof resolved === 'string' && resolved.toLowerCase() === liveFile) {
      throw Error('LIVE_DB_CONFIG_FORBIDDEN_IN_STAGE6_TEST');
    }
    return original.call(this, name, parent, ...rest);
  };
  t.after(() => { Module._load = original; });
};
