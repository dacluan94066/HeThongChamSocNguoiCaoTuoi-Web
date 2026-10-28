import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { AuthProvider } from '../../src/context/AuthContext';
import MedicationSchedulePage from '../../src/pages/MedicationSchedule/MedicationSchedulePage';
import 'antd/dist/reset.css';
import '../../src/index.css';
import '../../src/styles/tokens.css';

const { scenario, width } = window.__MEDICATION_FIXTURE__;
const errors = [];
window.addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const wait = async predicate => {
  for (let i = 0; i < 180; i++) { if (predicate()) return; await delay(40); }
  throw Error(`Timeout ${scenario}: ${document.body.textContent.slice(-500)}`);
};
const row = id => document.querySelector(`tr[data-row-key="${id}"]`);
const button = (id, text) => [...(row(id)?.querySelectorAll('button') || [])].find(b => b.textContent.trim() === text);
const control = async action => (await fetch('/__control', { method: 'POST', body: JSON.stringify({ action }) })).json();
const dialog = () => [...document.querySelectorAll('[role="dialog"]')].find(el => el.checkVisibility());
const inputValue = (element, value) => {
  element.focus();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
};
const enter = element => element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, which: 13, bubbles: true }));
async function run() {
  const checks = [];
  const check = (name, pass) => { checks.push({ name, pass: Boolean(pass) }); if (!pass) throw Error(name); };
  await wait(() => row(1)?.textContent.includes('Đã uống lúc 13:05') && (scenario === 'readonly' || button(2, 'Bỏ lỡ')));
  check('taken dose has neither missed nor confirm action', !button(1, 'Bỏ lỡ') && !button(1, 'Xác nhận đã uống'));
  check('taken time shown even without confirmer name', row(1).textContent.includes('Đã uống lúc 13:05'));
  check('missing confirmation time is explicit, never invented', row(6).textContent.includes('Chưa có thời gian xác nhận'));
  if (scenario === 'readonly') {
    check('read-only account cannot mutate any dose', !button(2, 'Bỏ lỡ') && !button(2, 'Xác nhận đã uống') && !button(5, 'Đã uống nhưng quên xác nhận'));
  } else {
    check('pending dose retains both valid actions', button(2, 'Bỏ lỡ') && button(2, 'Xác nhận đã uống'));
    check('missed/refused retain late confirmation, not missed again', button(3, 'Xác nhận đã uống') && button(4, 'Xác nhận đã uống') && !button(3, 'Bỏ lỡ') && !button(4, 'Bỏ lỡ'));
    check('past-day supplement retained', button(5, 'Đã uống nhưng quên xác nhận') && !button(5, 'Bỏ lỡ') && !button(5, 'Xác nhận đã uống'));
  }
  button(1, 'Xem').focus();
  check('detail button keyboard focusable', document.activeElement === button(1, 'Xem'));
  button(1, 'Xem').click();
  await wait(() => dialog()?.textContent.includes('Thời gian đã uống'));
  check('detail shows actual time without confirmer name', dialog().textContent.includes('13:05'));
  [...dialog().querySelectorAll('button')].find(b => b.textContent === 'Đóng').click();
  await wait(() => !dialog());

  if (scenario.startsWith('conflict')) {
    button(2, scenario === 'conflict-missed' ? 'Bỏ lỡ' : 'Xác nhận đã uống').click();
    await wait(() => document.querySelector('.ant-message')?.textContent.includes('phiên hoặc thiết bị khác'));
    check('one clear conflict toast and no success toast', document.querySelectorAll('.ant-message-notice').length === 1 && !document.querySelector('.ant-message').textContent.includes('Đã cập nhật:'));
    await wait(() => row(2)?.textContent.includes('Đã uống lúc 23:55'));
    button(2, 'Xem').click(); await wait(dialog);
    await wait(() => row(2)?.textContent.includes('Đã uống lúc 23:55') && dialog()?.textContent.includes('23:55'));
    check('conflict refreshes table, details and actions', !button(2, 'Bỏ lỡ') && !button(2, 'Xác nhận đã uống') && dialog().textContent.includes('Đã uống'));
    await delay(180);
    const state = await control('snapshot');
    check('409 performs one write only and reads latest state', state.patches === 1 && state.readsAfterWrite === 1);
    [...dialog().querySelectorAll('button')].find(b => b.textContent === 'Đóng').click(); await wait(() => !dialog());
  } else if (scenario === 'realtime-detail') {
    button(2, 'Xem').click(); await wait(dialog);
    check('detail starts pending', !dialog().textContent.includes('23:55'));
    await control('external-update');
    await wait(() => dialog()?.textContent.includes('23:55') && row(2)?.textContent.includes('Đã uống lúc 23:55'));
    check('existing socket refresh updates an open detail without a write', (await control('snapshot')).patches === 0);
    [...dialog().querySelectorAll('button')].find(b => b.textContent === 'Đóng').click(); await wait(() => !dialog());
  } else if (scenario === 'success') {
    button(2, 'Bỏ lỡ').click();
    await wait(() => !button(2, 'Bỏ lỡ') && row(2)?.textContent.includes('Bỏ lỡ'));
    check('successful missed update retains late confirmation', button(2, 'Xác nhận đã uống'));
    const state = await control('snapshot'); check('one successful write followed by refresh', state.patches === 1 && state.readsAfterWrite === 1);
  } else if (scenario.startsWith('prescription-')) {
    [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Tạo đơn thuốc').click();
    await wait(() => dialog()?.querySelector('#nguoiCaoTuoiId'));
    const selectOption = async (id, text) => {
      const select = document.getElementById(id);
      select.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      select.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));
      await wait(() => [...document.querySelectorAll('.ant-select-item-option')].some(el => el.checkVisibility() && el.textContent.includes(text)));
      [...document.querySelectorAll('.ant-select-item-option')].find(el => el.checkVisibility() && el.textContent.includes(text)).click();
      await delay(80);
    };
    await selectOption('nguoiCaoTuoiId', 'NCT fixture');
    await selectOption('danhSachThuoc_0_thuocId', 'Thuốc kiểm thử thời gian');
    inputValue(document.getElementById('danhSachThuoc_0_lieuDung'), 'LIỀU GIẢ KIỂM THỬ');
    const end = document.getElementById('ngayKetThuc');
    // Copy the displayed start date; do not depend on the browser locale format.
    inputValue(end, document.getElementById('ngayBatDau').value);
    await delay(80); enter(end); await delay(80); end.blur();
    const time = document.getElementById('danhSachThuoc_0_gioUong_0');
    inputValue(time, '00:00'); await delay(80); enter(time); await delay(80); time.blur();
    await wait(() => dialog()?.textContent.includes('Không còn giờ uống hợp lệ'));
    check('past-only range has clear inline first-dose warning', dialog().textContent.includes('Đơn thuốc chưa được lưu.'));
    dialog().querySelector('.modal-save-button').click();
    await wait(() => dialog()?.textContent.includes('Thuốc dòng 1: không còn giờ uống hợp lệ'));
    check('invalid range is blocked before POST and preserves form', (await control('snapshot')).prescriptions.length === 0 && dialog());
    if (scenario === 'prescription-recurrence') {
      // Clear the optional end date: existing policy is a 30-day recurrence.
      const clear = end.closest('.ant-picker').querySelector('.ant-picker-clear');
      clear.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); clear.click();
      await wait(() => dialog()?.textContent.includes('Liều đầu tiên: 00:00') && dialog()?.textContent.includes('Bỏ qua 1 cữ'));
      check('recurrence previews tomorrow instead of rejecting early clock time', dialog().textContent.includes('giờ Việt Nam'));
      dialog().querySelector('.modal-save-button').click();
      await wait(() => !dialog());
      const state = await control('snapshot');
      check('valid recurrence sends one existing API request without replay', state.prescriptions.length === 1 && state.prescriptions[0].ngayKetThuc === null && state.prescriptions[0].danhSachThuoc[0].gioUong[0] === '00:00');
    } else {
      dialog().querySelector('.modal-cancel-button').click(); await wait(() => !dialog());
    }
  } else if (scenario === 'server-error' || scenario === 'other-conflict') {
    button(2, 'Xác nhận đã uống').click();
    await wait(() => document.querySelector('.ant-message')?.textContent.includes('Fixture API error'));
    await delay(160);
    const state = await control('snapshot');
    check('unrelated failure not retried or mistaken for a dose conflict', state.patches === 1 && state.readsAfterWrite === 0);
    check('failed write never displays success', !document.querySelector('.ant-message').textContent.includes('Đã cập nhật:'));
  }
  check('page fits viewport with table scrolling internally', document.documentElement.scrollWidth <= width + 1);
  if (scenario === 'large-text') {
    const nodes = [...document.querySelectorAll('.medication-management-page *')].filter(el => !['svg', 'path'].includes(el.tagName.toLowerCase()));
    const sizes = nodes.map(el => parseFloat(getComputedStyle(el).fontSize));
    nodes.forEach((el, i) => { el.style.fontSize = `${sizes[i] * 1.8}px`; });
    dispatchEvent(new Event('resize')); await delay(120);
    check('180% text fits page; table still exposes medication actions', document.documentElement.scrollWidth <= width + 1 && button(2, 'Bỏ lỡ'));
  }
  check('no unhandled rejected write promise', errors.length === 0);
  return { checks };
}

// Disable only fixture motion so Chrome virtual time can observe closed modals.
createRoot(document.getElementById('root')).render(<StrictMode><ConfigProvider theme={{ token: { motion: false } }}><AuthProvider><MemoryRouter initialEntries={['/lich-uong-thuoc']}><MedicationSchedulePage /></MemoryRouter></AuthProvider></ConfigProvider></StrictMode>);
run().then(report => fetch('/__result', { method: 'POST', body: JSON.stringify(report) }))
  .catch(error => fetch('/__result', { method: 'POST', body: JSON.stringify({ error: error.message, errors }) }));
