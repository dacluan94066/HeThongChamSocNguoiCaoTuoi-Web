const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('route declaration requires NguoiThan role and checkPermission QLCHISOSK/them', () => {
  const file = path.resolve(__dirname, '../src/routes/relative.routes.js');
  const source = fs.readFileSync(file, 'utf8');
  assert.match(source, /router\.post\(\s*'\/me\/elderly\/:id\/health-metrics',\s*relative,\s*checkPermission\('QLCHISOSK',\s*'them'\),\s*ctrl\.createHealthMetric\s*\)/);
});

test('relativePolicy allowedRelativeRequest permits POST /api/relatives/me/elderly/:id/health-metrics and GET /api/health-metric-types', () => {
  const { allowedRelativeRequest, relativePermission } = require('../src/utils/relativePolicy');
  assert.equal(allowedRelativeRequest({ method: 'POST', originalUrl: '/api/relatives/me/elderly/7/health-metrics' }), true);
  assert.equal(allowedRelativeRequest({ method: 'POST', originalUrl: '/api/relatives/me/elderly/abc/health-metrics' }), false);
  assert.equal(allowedRelativeRequest({ method: 'GET', originalUrl: '/api/health-metric-types' }), true);
  assert.equal(relativePermission('QLCHISOSK', 'them'), true);
  assert.equal(relativePermission('QLCHISOSK', 'sua'), false);
  assert.equal(relativePermission('QLCHISOSK', 'xoa'), false);
  assert.equal(relativePermission('QLHOSONCT', 'them'), false);
});

