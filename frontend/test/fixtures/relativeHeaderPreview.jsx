/* oxlint-disable react/only-export-components -- Isolated browser test entry. */
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider } from 'antd';
import RelativePortalHeader from '../../src/pages/Relatives/RelativePortalHeader';
import AccountMenuModals from '../../src/components/AccountMenuModals';
import 'antd/dist/reset.css';

const params = new URLSearchParams(location.search);
const user = { hoTen: 'Nguyễn Thị Minh Lan — tài khoản có tên rất dài để kiểm tra Header', tenDangNhap: 'header.fixture', tenVaiTro: 'NguoiThan' };
const trace = { home: 0, password: 0, logout: 0 };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const frames = async () => { for (let i = 0; i < 5; i++) await new Promise(requestAnimationFrame); };
let stage = 'mount';
const waitFor = async predicate => {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await delay(40); }
  throw new Error(`Timed out waiting for browser UI: ${stage}`);
};
function Preview() {
  const [modal, setModal] = useState(null);
  useEffect(() => {
    if (!params.has('run')) return;
    const run = async () => {
      const checks = [];
      const check = (name, result) => { checks.push({ name, pass: Boolean(result) }); };
      const trigger = document.querySelector('.relative-family-account-trigger');
      const nav = document.querySelector('nav button');
      const menuItems = () => [...document.querySelectorAll('[role="menuitem"]')];
      const keyboard = (target, key, keyCode) => target.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, which: keyCode, bubbles: true }));
      const openMenu = async () => { trigger.focus(); trigger.click(); await waitFor(() => trigger.getAttribute('aria-expanded') === 'true' && menuItems().length === 2); await frames(); await delay(50); };
      const within = el => { const r = el.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1 && r.width > 0; };
      check('exact viewport', innerWidth === Number(params.get('width')));
      check('real account name and initials', trigger.getAttribute('aria-label').includes(user.hoTen) && trigger.querySelector('.ant-avatar').textContent === 'NH');
      check('active navigation and touch targets', nav.getAttribute('aria-current') === 'page' && [trigger, nav].every(el => el.getBoundingClientRect().height >= 44));
      check('header does not overflow', document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('header button')].every(within));
      nav.click(); document.querySelector('.relative-family-brand').click();
      check('navigation callbacks', trace.home === 2);
      await openMenu();
      check('dropdown fits viewport and shows full name', within(document.querySelector('.relative-family-account-menu')) && document.querySelector('.relative-family-menu-identity').textContent.includes(user.hoTen));
      check('focus enters menu', document.querySelector('[role="menu"]').contains(document.activeElement));
      keyboard(document.activeElement, 'ArrowDown', 40); await delay(50);
      check('arrow key selects item', document.activeElement.getAttribute('role') === 'menuitem');
      keyboard(document.activeElement, 'Escape', 27); await delay(250);
      check('escape closes and returns focus', trigger.getAttribute('aria-expanded') === 'false' && document.activeElement === trigger);
      keyboard(trigger, 'ArrowDown', 40); await waitFor(() => menuItems().length === 2); await delay(250);
      check('keyboard opens menu', trigger.getAttribute('aria-expanded') === 'true');
      keyboard(document.activeElement, 'Tab', 9); await delay(250);
      check('tab dismisses menu without trapping focus', trigger.getAttribute('aria-expanded') === 'false');
      await openMenu();
      stage = 'password modal';
      keyboard(menuItems()[0], 'Enter', 13); await waitFor(() => document.querySelectorAll('[role="dialog"] input[type="password"]').length === 3);
      check('existing password modal opens', trace.password === 1 && document.querySelectorAll('[role="dialog"] input[type="password"]').length === 3);
      stage = 'cancel password';
      [...document.querySelectorAll('[role="dialog"] button')].find(el => el.textContent.trim() === 'Hủy').click();
      await waitFor(() => ![...document.querySelectorAll('[role="dialog"]')].some(el => el.checkVisibility()));
      check('password modal cancels without request', ![...document.querySelectorAll('[role="dialog"]')].some(el => el.checkVisibility()));
      stage = 'outside click';
      await openMenu();
      document.querySelector('main').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      document.querySelector('main').click(); await delay(250);
      check('outside click closes', trigger.getAttribute('aria-expanded') === 'false');
      await openMenu(); menuItems()[1].click(); await delay(250);
      check('logout invokes existing callback once', trace.logout === 1 && trigger.getAttribute('aria-expanded') === 'false');
      await openMenu();
      check('SOS controls remain reachable', within(document.querySelector('#fixture-sos-stop')) && document.querySelector('main').getBoundingClientRect().top >= document.querySelector('header').getBoundingClientRect().bottom);
      return { checks, trace, width: innerWidth };
    };
    void run().then(result => fetch('/__header_result', { method: 'POST', body: JSON.stringify(result) }))
      .catch(error => fetch('/__header_result', { method: 'POST', body: JSON.stringify({ error: error.message, trace }) }));
  }, []);
  return <>
    <RelativePortalHeader user={user} onHome={() => trace.home++} onChangePassword={() => { trace.password++; setModal('change-password'); }} onLogout={() => trace.logout++} />
    <main style={{ padding: 24, background: '#f3f8f7', minHeight: '80vh' }}>
      <p style={{ marginBottom: 20 }}>FIXTURE UI — dữ liệu trong bộ nhớ, không kết nối database.</p>
      <button id="fixture-sos-stop" style={{ minHeight: 44 }}>Tắt chuông (fixture)</button>
    </main>
    <AccountMenuModals user={user} activeModal={modal} onClose={() => setModal(null)} />
  </>;
}
// Disable Ant Design motion only in this fixture so virtual-time Chrome can
// deterministically observe modal visibility; production keeps its animations.
createRoot(document.getElementById('root')).render(<ConfigProvider theme={{ token: { motion: false } }}><Preview /></ConfigProvider>);
