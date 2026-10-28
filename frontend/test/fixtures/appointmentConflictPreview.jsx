import React from 'react';
import dayjs from 'dayjs';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { AuthProvider } from '../../src/context/AuthContext';
import AppointmentsPage from '../../src/pages/Appointments/AppointmentsPage';
import 'antd/dist/reset.css';
import '../../src/index.css';
import '../../src/styles/tokens.css';

const errors = [];
addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const visibleDialog = () => [...document.querySelectorAll('[role=dialog]')].find(el => el.checkVisibility());
const button = text => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === text);
async function wait(predicate) {
  for (let i = 0; i < 160; i++) { if (predicate()) return; await delay(40); }
  throw Error(`UI timeout: ${document.body.textContent.slice(-300)}`);
}
async function run() {
  await wait(() => button('Sửa')); button('Sửa').click();
  await wait(visibleDialog);
  const enterPicker = (name, value) => {
    const el = visibleDialog().querySelector(`input[id$="_${name}"]`) || visibleDialog().querySelector(`input[id="${name}"]`);
    if (!el) throw Error(`Missing picker ${name}`);
    el.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
    el.blur();
  };
  enterPicker('ngayKham', dayjs().format('DD/MM/YYYY')); await delay(100);
  enterPicker('gioKham', '00:00'); await delay(100);
  visibleDialog().querySelector('.modal-save-button').click();
  await wait(() => document.body.textContent.includes('Giờ khám mới phải ở tương lai'));
  const rejected = await (await fetch('/__state')).json();
  if (rejected.writes !== 0) throw Error('Past appointment escaped frontend validation');
  visibleDialog().querySelector('.ant-modal-close').click(); await wait(() => !visibleDialog());
  button('Sửa').click(); await wait(visibleDialog);
  visibleDialog().querySelector('.modal-save-button').click();
  await wait(() => document.querySelector('.ant-message')?.textContent.includes('phiên hoặc thiết bị khác'));
  await wait(() => !visibleDialog() && !button('Sửa'));
  await delay(200);
  const state = await (await fetch('/__state')).json();
  if (state.writes !== 1 || state.readsAfterConflict < 1 || errors.length) throw Error(JSON.stringify({ state, errors }));
  if (document.documentElement.scrollWidth > innerWidth + 1) throw Error('Page overflow');
  return { pass: true, state, errors };
}
createRoot(document.getElementById('root')).render(<ConfigProvider theme={{ token: { motion: false } }}>
  <AuthProvider><MemoryRouter><AppointmentsPage /></MemoryRouter></AuthProvider>
</ConfigProvider>);
run().then(report => fetch('/__result', { method: 'POST', body: JSON.stringify(report) }))
  .catch(error => fetch('/__result', { method: 'POST', body: JSON.stringify({ error: error.message }) }));
