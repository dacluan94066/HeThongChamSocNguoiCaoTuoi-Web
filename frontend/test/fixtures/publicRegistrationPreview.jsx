import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp, ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';
import { AuthProvider } from '../../src/context/AuthContext';
import LoginPage from '../../src/pages/Login/LoginPage';
import theme from '../../src/theme/themeConfig';
import 'antd/dist/reset.css';
import '../../src/index.css';
import '../../src/styles/tokens.css';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(predicate) { for (let i = 0; i < 200; i++) { if (await predicate()) return; await pause(25); } throw Error('Registration UI timeout: ' + document.body.textContent.slice(-250)); }
const expect = (actual, expected, label) => { if (actual !== expected) throw Error(`${label}: expected ${expected}, got ${actual}`); };
const dialog = () => [...document.querySelectorAll('[role=dialog]')].find(node => node.checkVisibility());
const button = text => [...(dialog() || document).querySelectorAll('button')].find(node => node.textContent.trim() === text);
const field = name => dialog().querySelector(`[id="${name}"]`);
const state = async () => (await (await fetch('/__state')).json()).data;
const control = action => fetch('/__control', { method: 'POST', body: JSON.stringify({ action }) });
const choose = async role => { dialog().querySelector(`input[type=radio][value="${role}"]`).click(); await pause(50); };
const enter = (name, value) => {
  const input = field(name);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
};
async function open() { await wait(() => button('Đăng ký CareSenior')); button('Đăng ký CareSenior').click(); await wait(dialog); }
async function birth() {
  enter('ngaySinh', '28/05/1950'); field('ngaySinh').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true })); field('ngaySinh').blur();
  field('gioiTinh').closest('.ant-select').querySelector('.ant-select-selector')?.click();
  if (!document.querySelector('.ant-select-item-option[title="Nam"]')) field('gioiTinh').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await wait(() => document.querySelector('.ant-select-item-option[title="Nam"]'));
  document.querySelector('.ant-select-item-option[title="Nam"]').click(); await pause(50);
}
const common = suffix => {
  enter('hoTen', 'Người dùng đăng ký fixture'); enter('tenDangNhap', `fixture.${suffix}`);
  enter('email', `${suffix}@example.invalid`); enter('matKhau', 'Fixture-123'); enter('xacNhanMatKhau', 'Fixture-123');
};
window.prepareRegistration = async () => {
  await open();
  expect(dialog().querySelectorAll('input[type=radio]').length, 3, 'Exactly three public account roles');
  expect(Boolean(dialog().querySelector('input[type=radio][value="QuanTriVien"]')), false, 'Admin never offered');
  await choose('NguoiCaoTuoi');
  const box = dialog().getBoundingClientRect(), body = dialog().querySelector('.ant-modal-body');
  expect(box.left >= -1 && box.right <= innerWidth + 1 && box.top >= -1 && box.bottom <= innerHeight + 1, true, 'Dialog fits viewport');
  expect(body.scrollWidth <= body.clientWidth + 1, true, 'Registration has no horizontal overflow');
  body.scrollTop = body.scrollHeight; await pause(30);
  const submit = button('Tạo tài khoản').getBoundingClientRect(); expect(submit.bottom <= box.bottom + 1 && submit.left >= box.left - 1, true, 'Submit remains reachable by scrolling');
  body.scrollTop = 0;
  return { width: innerWidth, modal: box.toJSON() };
};
window.runRegistrationFixture = async () => {
  // Profile-only drafts must not be reused after changing account type.
  await choose('NguoiCaoTuoi'); await birth(); await choose('NguoiThan'); expect(Boolean(field('ngaySinh')), false, 'Relative has no elderly date field');
  await choose('NguoiCaoTuoi'); expect(field('ngaySinh').value, '', 'DOB reset after role switch');
  expect(field('gioiTinh').closest('.ant-form-item').textContent.includes('Chọn giới tính'), true, 'Gender reset after role switch');
  for (const role of ['NguoiCaoTuoi', 'NguoiChamSoc', 'NguoiThan']) {
    if (!dialog()) await open(); await choose(role); common(role.toLowerCase());
    const before = (await state()).requests.length;
    if (role === 'NguoiCaoTuoi' || role === 'NguoiChamSoc') {
      button('Tạo tài khoản').click(); await pause(150); expect((await state()).requests.length, before, 'Required profile/phone validation before HTTP');
    }
    if (role === 'NguoiCaoTuoi') await birth();
    if (role === 'NguoiChamSoc') enter('soDienThoai', '0000000001');
    await control('hold'); button('Tạo tài khoản').click(); button('Tạo tài khoản').click();
    await wait(async () => (await state()).requests.length === before + 1);
    expect(Boolean(dialog().querySelector('.ant-btn-loading')), true, 'Submitting is visible');
    expect([...dialog().querySelectorAll('input[type=radio]')].every(input => input.disabled), true, 'Role cannot change during submission');
    await pause(100); expect((await state()).requests.length, before + 1, 'Double click sends exactly one registration');
    await control('release'); await wait(() => Boolean(button('Quay lại đăng nhập')));
    const content = dialog().textContent;
    expect(content.includes(role === 'NguoiChamSoc' ? 'đang chờ quản trị viên' : role === 'NguoiThan' ? 'cấp liên kết' : 'Web hoặc Mobile'), true, 'Role-specific success and permissions');
    expect(localStorage.getItem('token'), null, 'Registration never logs in implicitly');
    button('Quay lại đăng nhập').click(); await wait(() => !dialog()); await open();
    expect(field('hoTen').value, '', 'New form clears account draft'); expect(field('matKhau').value, '', 'New form clears password');
    expect(Boolean(dialog().querySelector('input[type=radio]:checked')), false, 'New form requires explicit role selection');
  }
  await choose('NguoiThan'); common('duplicate'); await control('duplicate');
  const before = (await state()).requests.length; button('Tạo tài khoản').click();
  await wait(() => dialog().textContent.includes('Email đã được sử dụng'));
  expect(field('email').value, 'duplicate@example.invalid', 'Failed registration keeps entered email');
  expect(field('matKhau').value, 'Fixture-123', 'Failed registration keeps draft password in memory');
  await pause(100); expect((await state()).requests.length, before + 1, 'No automatic retry');
  await control('normal'); enter('email', 'new-relative@example.invalid'); button('Tạo tài khoản').click();
  await wait(() => Boolean(button('Quay lại đăng nhập'))); button('Quay lại đăng nhập').click(); await wait(() => !dialog());
  await open(); await choose('NguoiThan'); common('network'); await control('network'); button('Tạo tài khoản').click();
  await wait(() => dialog().textContent.includes('Chưa xác định được kết quả đăng ký'));
  expect(Boolean(button('Quay lại đăng nhập')), false, 'Network error cannot pretend success');
  dialog().querySelector('.ant-modal-close').click(); await wait(() => !dialog());
  expect((await state()).unexpected.length, 0, 'No unapproved API');
  return { pass: true, state: await state() };
};

createRoot(document.getElementById('root')).render(<StrictMode><ConfigProvider locale={viVN} theme={{ ...theme, token: { ...theme.token, motion: false } }}><AntApp>
  <AuthProvider><MemoryRouter initialEntries={['/login']}><LoginPage /></MemoryRouter></AuthProvider>
</AntApp></ConfigProvider></StrictMode>);
window.registrationFixtureReady = true;
