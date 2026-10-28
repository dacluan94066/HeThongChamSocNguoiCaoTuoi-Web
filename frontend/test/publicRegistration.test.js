import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPublicRegistration, createPublicRegistrationApi, PUBLIC_REGISTRATION_ROLES } from '../src/utils/publicRegistration.js';

const values = role => ({ loaiTaiKhoan: role, tenDangNhap: ' fixture.user ', hoTen: ' Người dùng fixture ', email: ' USER@example.invalid ', matKhau: 'Fixture-123', soDienThoai: '0000000001',
  ngaySinh: { format: () => '1950-05-28' }, gioiTinh: 'Nam', xacNhanMatKhau: 'Fixture-123', vaiTroId: 1, trangThai: 'HoatDong', nguoiCaoTuoiId: 999, GoogleSubject: 'DO_NOT_SEND' });

test('registration has exactly three public roles and never Admin', () => {
  assert.deepEqual(PUBLIC_REGISTRATION_ROLES.map(role => role.value), ['NguoiCaoTuoi', 'NguoiChamSoc', 'NguoiThan']);
  for (const role of ['QuanTriVien', 'BacSi', '', undefined, 1]) assert.throws(() => buildPublicRegistration(values(role)));
});
test('NCT reuses original registration with own profile fields; hidden privilege fields never leave UI', () => {
  const request = buildPublicRegistration(values('NguoiCaoTuoi'));
  assert.equal(request.endpoint, '/auth/register');
  assert.deepEqual(request.body, { hoTen: 'Người dùng fixture', tenDangNhap: 'fixture.user', email: 'user@example.invalid', matKhau: 'Fixture-123', soDienThoai: '0000000001', loaiTaiKhoan: 'NguoiCaoTuoi', ngaySinh: '1950-05-28', gioiTinh: 'Nam' });
});
test('caregiver/relative use fixed endpoints and do not receive hidden elderly profile, confirmation or link data', () => {
  for (const [role, endpoint] of [['NguoiChamSoc', '/auth/register-caregiver'], ['NguoiThan', '/auth/register-relative']]) {
    const request = buildPublicRegistration(values(role)); assert.equal(request.endpoint, endpoint);
    assert.deepEqual(Object.keys(request.body).sort(), ['email', 'hoTen', 'matKhau', 'soDienThoai', 'tenDangNhap']);
  }
});
test('register needs actual backend acknowledgement; no automatic login or retried request', async () => {
  const calls = [];
  const api = createPublicRegistrationApi({ post: async (endpoint, body) => {
    calls.push({ endpoint, body }); return { data: { success: true, data: endpoint.endsWith('register-caregiver') ? null : { userId: 351, loaiTaiKhoan: body.loaiTaiKhoan || 'NguoiThan', nguoiCaoTuoiId: 801 } } };
  } });
  for (const role of PUBLIC_REGISTRATION_ROLES) assert.equal((await api(values(role.value))).value, role.value);
  assert.equal(calls.length, 3); assert.equal(calls.some(call => call.endpoint.includes('login') || call.endpoint.includes('google')), false);
  let attempts = 0;
  const offline = createPublicRegistrationApi({ post: async () => { attempts++; throw Error('offline'); } });
  await assert.rejects(offline(values('NguoiThan'))); assert.equal(attempts, 1);
});
test('malformed/wrong role or missing NCT profile response cannot show success', async () => {
  for (const data of [{ success: false }, { success: true, data: { userId: 351, loaiTaiKhoan: 'QuanTriVien' } }, { success: true, data: { userId: 351, loaiTaiKhoan: 'NguoiCaoTuoi' } }]) {
    const api = createPublicRegistrationApi({ post: async () => ({ data }) }); await assert.rejects(api(values('NguoiCaoTuoi')));
  }
});
