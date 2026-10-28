import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { App as AntApp, ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';
import MainLayout from '../../src/layouts/MainLayout';
import { AuthProvider } from '../../src/context/AuthContext';
import { webSession } from '../../src/utils/webSession';
import theme from '../../src/theme/themeConfig';
import 'antd/dist/reset.css';
import '../../src/index.css';
import '../../src/styles/tokens.css';

window.__audioPlays = 0;
window.Audio = class { play() { window.__audioPlays++; return Promise.resolve(); } pause() {} load() {} addEventListener() {} removeEventListener() {} };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(predicate) { for (let i = 0; i < 200; i++) { if (predicate()) return; await pause(25); } throw new Error('UI timeout: ' + document.body.textContent.slice(-250)); }
const expect = (actual, expected, label) => { if (actual !== expected) throw Error(`${label}: expected ${expected}, got ${actual}`); };
const bell = () => document.querySelector('.header-notification-button');
const dialog = () => [...document.querySelectorAll('[role=dialog]')].find(node => node.checkVisibility());
const state = async () => (await (await fetch('/__state')).json()).data;
const control = action => fetch('/__control', { method: 'POST', body: JSON.stringify({ action }) });
const button = (root, text) => [...root.querySelectorAll('button')].find(node => node.textContent.trim() === text);
const tab = key => dialog().querySelector(`[role=tab][id$="-tab-${key}"]`);
const row = id => dialog().querySelector(`[data-notification-id="${id}"]`);

export function FixtureContent() {
  const location = useLocation();
  return <div style={{ minHeight: 2000 }}><output id="fixture-location">{location.pathname + location.search}</output>
    <button id="fixture-switch" onClick={() => webSession.replace('notification-fixture-b', { userId: 71, tenVaiTro: 'QuanTriVien' })}>Switch fixture</button>
    <button id="fixture-clear" onClick={() => webSession.clear()}>Clear fixture session</button></div>;
}

window.prepareNotifications = async () => {
  const fixture = await state();
  if (fixture.role === 'NguoiThan' || fixture.role === 'NguoiCaoTuoi') {
    await pause(400); expect(Boolean(bell()), false, 'Separate workspace roles have no new staff bell');
    expect((await state()).reads, 0, 'No staff notifications read for another role'); return { separateRole: true };
  }
  if (fixture.mode === 'empty') {
    await wait(bell); bell().click(); await wait(dialog);
    await wait(() => dialog().textContent.includes('Chưa có thông báo nào'));
    expect((await state()).patches.length, 0, 'Empty list never writes');
    return { empty: true };
  }
  if (fixture.mode === 'error') {
    await wait(bell); bell().click(); await wait(dialog);
    await wait(() => dialog().textContent.includes('Không thể tải thông báo'));
    await control('recover'); button(dialog(), 'Thử lại').click();
    await wait(() => row(21)); dialog().querySelector('.ant-modal-close').click(); await wait(() => !dialog());
  }
  if (fixture.mode === 'loading') {
    await wait(bell); bell().click(); await wait(dialog);
    await wait(() => dialog().querySelector('[aria-label="Đang tải thông báo"]'));
    expect((await state()).patches.length, 0, 'Loading never writes');
    await control('release'); await wait(() => row(21));
    dialog().querySelector('.ant-modal-close').click(); await wait(() => !dialog());
  }
  await wait(() => bell()?.getAttribute('aria-label').includes('20 chưa đọc'));
  bell().click(); await wait(dialog); await wait(() => row(21)); await pause(100);
  expect((await state()).patches.length, 0, 'Opening never marks all read');
  expect(window.__audioPlays, 0, 'Loading historical SOS notifications never rings');
  expect(row(21).querySelector('time').textContent.includes('28/10/2026 13:05'), true, 'Vietnam wall-clock timestamp');
  expect(row(21).textContent.includes('<script>'), true, 'Notification HTML is rendered as text');
  expect(window.__noticeInjected, undefined, 'Notification text cannot execute');
  // After verifying escaping, render the same synthetic records without the attack string for design screenshots.
  await control('visual'); button(dialog(), 'Tải lại').click();
  await wait(() => !row(21).textContent.includes('<script>'));
  if (new URLSearchParams(location.search).has('large')) {
    const sizes = [...dialog().querySelectorAll('*')].filter(element => element instanceof HTMLElement)
      .map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
    // Capture all original sizes first; nested inheritance must not multiply 1.8 repeatedly.
    for (const [element, size] of sizes) element.style.fontSize = `${size * 1.8}px`;
    await pause(80);
  }
  const modal = dialog().getBoundingClientRect(), scroll = dialog().querySelector('.notification-center-scroll');
  if (modal.left < -1 || modal.right > innerWidth + 1 || modal.top < -1 || modal.bottom > innerHeight + 1) throw Error('Modal exceeds viewport ' + JSON.stringify({ modal: modal.toJSON(), width: innerWidth, height: innerHeight }));
  if (innerWidth >= 576 && modal.height > innerHeight * .85 + 2) throw Error('Desktop modal exceeds 85vh');
  expect(getComputedStyle(document.body).overflowY, 'hidden', 'Background scroll lock');
  expect(scroll.scrollHeight > scroll.clientHeight, true, 'Long list has internal scrolling');
  expect(scroll.scrollWidth <= scroll.clientWidth + 1, true, 'Notification list has no horizontal overflow');
  scroll.scrollTop = 200; expect(scroll.scrollTop > 0, true, 'List actually scrolls'); scroll.scrollTop = 0;
  expect(document.documentElement.scrollWidth <= innerWidth + 1, true, 'No horizontal page overflow');
  return { width: innerWidth, modal: modal.toJSON(), count: 21, scrollable: true };
};

window.checkClosedNotifications = async () => {
  await wait(() => !dialog()); await pause(30);
  expect(document.activeElement, bell(), 'Focus returns to the bell');
  expect(getComputedStyle(document.body).overflowY === 'hidden', false, 'Background scroll unlocks');
};

window.runNotificationActions = async () => {
  bell().click(); await wait(dialog); await wait(() => row(21));
  button(row(21), 'Đánh dấu đã đọc').click();
  await wait(() => bell().getAttribute('aria-label').includes('19 chưa đọc'));
  expect(row(21).textContent.includes('Đã đọc'), true, 'Read status updated');
  tab('read').click(); await wait(() => row(20) && row(21)); expect(dialog().querySelectorAll('[data-notification-id]').length, 2, 'Read filter');
  tab('unread').click(); await wait(() => row(19)); expect(Boolean(row(21)), false, 'Unread filter excludes acknowledged notice');
  tab('all').click(); await wait(() => row(21));
  const next = dialog().querySelector('.ant-pagination-next'); next.click(); await wait(() => !row(21));
  expect(dialog().querySelectorAll('[data-notification-id]').length, 8, 'Client pagination');
  dialog().querySelector('.ant-pagination-prev').click(); await wait(() => row(21));
  row(21).querySelector('.notification-center-title').click(); await wait(() => dialog().querySelector('.notification-center-detail'));
  button(dialog(), 'Mở chức năng liên quan').click(); await wait(() => !dialog());
  await wait(() => document.querySelector('#fixture-location').textContent === '/canh-bao?tab=sos');
  expect(document.querySelector('#fixture-location').textContent, '/canh-bao?tab=sos', 'Allowlisted existing SOS route');
  expect((await state()).patches.length, 1, 'Viewing already-read detail never repeats PATCH');
  bell().click(); await wait(dialog); await wait(() => row(21));
  const beforeForeign = (await state()).reads; await control('foreign'); await pause(250);
  expect((await state()).reads, beforeForeign, 'Foreign account event is ignored');
  await control('new'); await wait(() => row(22));
  expect(dialog().querySelectorAll('[data-notification-id="22"]').length, 1, 'Realtime duplicate events show one row');
  expect(bell().getAttribute('aria-label').includes('20 chưa đọc'), true, 'Realtime updates unread badge');
  expect(window.__audioPlays, 0, 'Ordinary notification does not play SOS audio');
  await control('read-error'); button(row(22), 'Đánh dấu đã đọc').click(); await wait(() => dialog().textContent.includes('Chưa đánh dấu đã đọc được'));
  expect(bell().getAttribute('aria-label').includes('20 chưa đọc'), true, 'Failed PATCH retains badge');
  dialog().querySelector('.ant-modal-close').click(); await wait(() => !dialog());
  const badgeBeforeSos = bell().getAttribute('aria-label'); await control('sos');
  await wait(() => document.querySelector('.ant-notification-notice'));
  expect(bell().getAttribute('aria-label'), badgeBeforeSos, 'SOS alert state is independent of notification read count');
  const silence = [...document.querySelectorAll('button')].find(node => node.textContent.trim() === 'Tắt chuông');
  expect(Boolean(silence), true, 'Existing SOS silence action remains available'); silence.click();
  expect((await state()).patches.length, 2, 'Silencing SOS sends no notification or SOS write');
  bell().click(); await wait(dialog); await wait(() => row(22));
  await control('hold'); await control('invalidate'); await pause(200);
  document.querySelector('#fixture-switch').click();
  await wait(() => bell()?.getAttribute('aria-label').includes('1 chưa đọc'));
  expect(Boolean(dialog()), false, 'Account switch closes old modal');
  bell().click(); await wait(dialog); await wait(() => row(501));
  await control('release'); await pause(150);
  expect(dialog().textContent.includes('Nội dung tài khoản A'), false, 'Late A response cannot restore old data');
  expect(dialog().textContent.includes('Thông báo tài khoản B'), true, 'New account sees its own notifications');
  document.querySelector('#fixture-clear').click(); await wait(() => !bell() && !dialog());
  expect(document.body.textContent.includes('Thông báo tài khoản B'), false, 'Logout clears notification content');
  expect(localStorage.getItem('token'), null, 'Session token cleared');
  expect((await state()).unexpected.length, 0, 'No unauthorized API or SOS write');
  return { pass: true, state: await state() };
};

createRoot(document.getElementById('root')).render(<StrictMode><ConfigProvider locale={viVN} theme={{ ...theme, token: { ...theme.token, motion: false } }}><AntApp>
  <AuthProvider><MemoryRouter initialEntries={['/dashboard']}><Routes><Route element={<MainLayout />}><Route path="*" element={<FixtureContent />} /></Route></Routes></MemoryRouter></AuthProvider>
</AntApp></ConfigProvider></StrictMode>);
window.notificationFixtureReady = true;
