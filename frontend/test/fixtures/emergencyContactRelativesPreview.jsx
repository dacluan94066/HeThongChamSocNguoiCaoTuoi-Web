import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from '../../src/context/AuthContext';
import EmergencyContactsPage from '../../src/pages/EmergencyContacts/EmergencyContactsPage';
import 'antd/dist/reset.css';
import '../../src/index.css';
import '../../src/styles/tokens.css';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(fn) { for (let i = 0; i < 180; i++) { if (await fn()) return; await pause(30); } throw Error('Contact UI timeout: ' + document.body.textContent.slice(-350)); }
const expect = (actual, expected, label) => { if (actual !== expected) throw Error(`${label}: expected ${expected}, got ${actual}`); };
const dialog = () => [...document.querySelectorAll('[role=dialog]')].find(node => node.checkVisibility());
const button = (text, scope = dialog() || document) => [...scope.querySelectorAll('button')].find(node => node.textContent.trim() === text);
const field = name => dialog().querySelector(`[id="${name}"]`);
const enter = (name, value) => { const input = field(name); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); };
const state = async () => (await (await fetch('/__state')).json()).data;
const control = mode => fetch('/__control', { method: 'POST', body: JSON.stringify({ mode }) });
async function open() { await wait(() => { const node = button('Thêm liên hệ', document); return node && !node.disabled; }); button('Thêm liên hệ', document).click(); await wait(dialog); }
async function cancel() { button('Hủy').click(); await wait(() => !dialog()); }
async function linked() { dialog().querySelector('input[type=radio][value=linked]').click(); await pause(60); }
async function select(id, title) {
  await wait(() => { const node = document.getElementById(id); return node && !node.disabled; });
  const input = document.getElementById(id);
  input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await wait(() => [...document.querySelectorAll('.ant-select-item-option')].some(el => el.checkVisibility() && el.title.startsWith(title)));
  [...document.querySelectorAll('.ant-select-item-option')].find(el => el.checkVisibility() && el.title.startsWith(title)).click(); await pause(60);
}
window.prepareContacts = async () => {
  await open(); await linked();
  await select('linked-relative-contact', 'Người thân fixture A');
  expect(field('hoTen').value, 'Người thân fixture A', 'Copy actual account name');
  expect(field('soDienThoai').value, '0000000001', 'Copy account phone');
  expect(field('email').value, 'a@example.invalid', 'Copy email');
  expect(field('moiQuanHe').value, 'Con gái', 'Copy link relationship');
  expect((await state()).writes.length, 0, 'Selecting never writes');
  expect(dialog().textContent.includes('Ưu tiên liên hệ: 1'), true, 'Priority is visible before saving');
  const box = dialog().getBoundingClientRect();
  if (box.left < -1 || box.right > innerWidth + 1 || document.documentElement.scrollWidth > innerWidth + 1) throw Error('Horizontal modal overflow');
};
window.runContacts = async () => {
  button('Thêm mới').click(); await wait(() => !dialog());
  await wait(() => document.querySelector('.contact-identity strong')?.textContent === 'Người thân fixture A');
  expect((await state()).writes.length, 1, 'One explicit save');
  button('Chỉnh sửa', document).click(); await wait(dialog);
  expect(Boolean(document.getElementById('linked-relative-contact')), false, 'Editing existing contacts stays manual');
  expect(field('soDienThoai').value, '0000000001', 'Existing contact unchanged'); await cancel();
  await open(); expect(field('hoTen').value, '', 'New form clears previous contact');
  await linked(); await select('linked-relative-contact', 'Người thân thiếu SĐT');
  expect(field('soDienThoai').value, '', 'Missing phone is not invented or copied from old contact');
  button('Thêm mới').click(); await wait(() => dialog().textContent.includes('Vui lòng nhập số điện thoại chính'));
  expect((await state()).writes.length, 1, 'Missing phone blocks API');
  enter('soDienThoai', '0000000003'); button('Thêm mới').click(); await wait(() => !dialog());
  await control('error'); await open(); await linked();
  await wait(() => dialog().textContent.includes('Người thân fixture chưa sẵn sàng'));
  dialog().querySelector('input[type=radio][value=manual]').click();
  enter('hoTen', 'Liên hệ thủ công fixture'); enter('moiQuanHe', 'Hàng xóm'); enter('soDienThoai', '0000000004');
  button('Thêm mới').click(); await wait(() => !dialog());
  expect((await state()).writes.length, 3, 'Manual fallback works without relatives API');
  await control('normal');
  await select('emergency-elder-select', 'NCT fixture B'); await open(); await linked();
  await wait(() => dialog().textContent.includes('Chưa có Người thân đủ điều kiện'));
  expect(field('hoTen').value, '', 'No stale data from elderly A'); await cancel();
  await select('emergency-elder-select', 'NCT fixture A'); await control('slow');
  await open(); await linked(); await cancel();
  await select('emergency-elder-select', 'NCT fixture B'); await open(); await linked();
  await wait(() => dialog().textContent.includes('Chưa có Người thân đủ điều kiện')); await pause(450);
  expect(dialog().textContent.includes('Người thân fixture A'), false, 'Late response cannot populate another elderly');
  expect(field('hoTen').value, '', 'Cancelled fetch never writes form');
  // Scale the actual picker text, including px-based Ant Design labels. Changing
  // the root rem size alone would leave those controls unchanged.
  const picker = dialog().querySelector('.linked-contact-picker');
  const textSizes = [picker, ...picker.querySelectorAll('*')].map(node => [node, parseFloat(getComputedStyle(node).fontSize)]);
  textSizes.forEach(([node, size]) => { if (Number.isFinite(size)) node.style.fontSize = `${size * 1.8}px`; });
  const box = dialog().getBoundingClientRect();
  expect(box.left >= -1 && box.right <= innerWidth + 1, true, 'Large text stays in viewport');
  expect(document.documentElement.scrollWidth <= innerWidth + 1, true, 'No horizontal overflow at large text');
  await cancel();
  expect((await state()).unexpected.length, 0, 'No grants, SOS, account writes or real API');
  return { pass: true };
};
export function Gate() { const { authLoading, permissionsLoading, user } = useAuth(); return authLoading || permissionsLoading || !user ? <p>Đang kiểm tra phiên fixture</p> : <EmergencyContactsPage key={user.userId} />; }
createRoot(document.getElementById('root')).render(<StrictMode><ConfigProvider theme={{ token: { motion: false } }}>
  <AuthProvider><MemoryRouter><Gate /></MemoryRouter></AuthProvider>
</ConfigProvider></StrictMode>);
window.contactsFixtureReady = true;
