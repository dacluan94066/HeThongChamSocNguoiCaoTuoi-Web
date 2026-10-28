import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../src/App';
import 'antd/dist/reset.css';
import '../../src/index.css';
import '../../src/styles/tokens.css';
import { getSocket } from '../../src/services/socketClient';

const { scenario, width } = window.__ELDERLY_FIXTURE__;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
// Measure stable colors and hit targets, not an intermediate navigation/modal
// transition. Infinite decorative animations must not block the fixture.
const settleMotion = async () => {
  // Chrome virtual-time timers and compositor timelines need not advance in
  // lockstep. Complete finite transitions in this fixture only, then measure
  // their final styles. Leave infinite decorative animations unchanged.
  for (let i = 0; i < 3; i++) {
    for (const animation of document.getAnimations()) {
      if (animation.playState === 'running' && Number.isFinite(animation.effect?.getComputedTiming().endTime)) animation.finish();
    }
    await delay(40);
  }
};
const wait = async predicate => { for (let i = 0; i < 150; i++) { if (predicate()) return; await delay(40); } throw new Error(`UI timeout: ${scenario}, ${document.body.textContent.slice(0, 200)}`); };
const text = () => document.body.textContent;
const clickButton = label => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === label)?.click();
const input = (id, value) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing input ${id}`);
  Object.getOwnPropertyDescriptor(el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
};
const route = path => { history.pushState({}, '', path); dispatchEvent(new PopStateEvent('popstate')); };
const safetyControl = async action => (await fetch('/__safety_control', { method: 'POST', body: JSON.stringify({ action }) })).json();
const sosButton = () => document.querySelector('.elderly-sos-button');
const pointer = type => { const button = sosButton(); button.focus(); button.dispatchEvent(new PointerEvent(type, { pointerId: 1, isPrimary: true, button: 0, bubbles: true })); };
const keyboard = type => { const button = sosButton(); button.focus(); button.dispatchEvent(new KeyboardEvent(type, { key: ' ', code: 'Space', bubbles: true })); };
const observeUntil = predicate => new Promise(resolve => {
  if (predicate()) return resolve();
  const observer = new MutationObserver(() => { if (predicate()) { observer.disconnect(); resolve(); } });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
});
async function run() {
  const checks = [];
  const check = (name, pass) => { checks.push({ name, pass: Boolean(pass) }); };
  const ready = () => document.querySelector('.elderly-web.is-ready');
  if (scenario.startsWith('google-')) {
    await wait(() => document.getElementById('tenDangNhap'));
    const choose = async (label = 'Tiếp tục với Google') => {
      await wait(() => [...document.querySelectorAll('button')].some(el => el.textContent === label && !el.disabled));
      clickButton(label); await wait(() => document.querySelector('.fixture-google-choice') && text().includes('Chọn tài khoản Google bằng nút bên dưới'));
    };
    const finish = async () => {
      await wait(ready); check('Google restores NCT workspace and own real API profile', text().includes('NCT fixture 70') && localStorage.getItem('token') === 'fixture-elder');
      route('/ca-nhan/ho-so'); await wait(() => text().includes('Đã liên kết Google'));
      check('linked state survives logout/new login via backend status', text().includes('Đã liên kết Google'));
      check('Google retains five primary destinations', document.querySelectorAll('.elderly-web-nav > a').length === 5);
      check('Google UI fits viewport', document.documentElement.scrollWidth <= innerWidth + 1);
      const nodes = [...document.querySelectorAll('.elderly-web *')].filter(el => !['svg', 'path'].includes(el.tagName.toLowerCase()));
      const sizes = nodes.map(el => parseFloat(getComputedStyle(el).fontSize)); nodes.forEach((el, i) => { el.style.fontSize = `${sizes[i] * 1.8}px`; });
      dispatchEvent(new Event('resize')); await fetch('/__elderly_progress', { method: 'POST', body: 'Google text180' });
      check('Google account panel and navigation fit 180% text', document.documentElement.scrollWidth <= innerWidth + 1);
      check('tokens/passwords never go into application browser storage', [...Array(localStorage.length)].every((_, i) => ['token', 'user'].includes(localStorage.key(i)))
        && !JSON.stringify({ ...localStorage }).includes('synthetic:') && !JSON.stringify({ ...localStorage }).includes('fixture-password'));
      document.querySelector('.google-web-auth').scrollIntoView({ block: 'center' }); await delay(80);
      return { checks };
    };
    if (scenario === 'google-onboarding' && sessionStorage.getItem('google-fixture-linked')) {
      checks.push(...JSON.parse(sessionStorage.getItem('google-fixture-checks')));
      check('logout removed old CareSenior session', !localStorage.getItem('token') && !localStorage.getItem('user'));
      await choose(); document.querySelector('.fixture-google-choice').click(); return await finish();
    }
    await choose(); check('browser binding cookie is HttpOnly', !document.cookie.includes('caresenior_google_browser'));
    if (scenario === 'google-cancel') {
      clickButton('Hủy chờ Google'); window.fixtureGoogleSdk.fire(); await delay(120);
      check('cancelled popup callback cannot log in', !localStorage.getItem('token') && !ready()); return { checks };
    }
    if (scenario === 'google-stale') {
      await wait(() => parent.document.getElementById('companion')?.contentWindow.fixtureCompanionReady);
      parent.document.getElementById('companion').contentWindow.localStorage.setItem('token', 'fixture-switched');
      await wait(() => text().includes('NCT fixture 71')); window.fixtureGoogleSdk.fire(); await delay(120);
      check('late Google callback cannot replace another account', localStorage.getItem('token') === 'fixture-switched' && !text().includes('NCT fixture 70')); return { checks };
    }
    document.querySelector('.fixture-google-choice').click();
    if (scenario === 'google-invalid') {
      await wait(() => text().includes('Google proof invalid')); check('invalid Google token does not create a Web session', !localStorage.getItem('token') && !ready()); return { checks };
    }
    await wait(() => text().includes('Google chưa liên kết với CareSenior'));
    check('unlinked email stays logged out and offers a completion path', !localStorage.getItem('token') && text().includes('Hồ sơ → Liên kết Google'));
    input('tenDangNhap', 'fixture.elder'); input('matKhau', 'fixture-password'); document.querySelector('.login-form button[type="submit"]').click();
    await wait(ready); route('/ca-nhan/ho-so'); await wait(() => document.getElementById('google-current-password'));
    input('google-current-password', 'wrong-password'); await choose('Chọn Google để liên kết'); document.querySelector('.fixture-google-choice').click();
    await wait(() => text().includes('Mật khẩu CareSenior hiện tại không chính xác'));
    check('failed reauthentication keeps JWT and clears password input', localStorage.getItem('token') === 'fixture-elder' && document.getElementById('google-current-password').value === '');
    input('google-current-password', 'fixture-password'); await choose('Chọn Google để liên kết'); document.querySelector('.fixture-google-choice').click();
    await wait(() => text().includes('Đã liên kết Google'));
    check('link confirms without replacing JWT/profile', localStorage.getItem('token') === 'fixture-elder' && text().includes('NCT fixture 70'));
    sessionStorage.setItem('google-fixture-linked', '1'); sessionStorage.setItem('google-fixture-checks', JSON.stringify(checks));
    document.querySelector('[aria-label="Menu tài khoản"]').scrollIntoView({ block: 'center' });
    document.querySelector('[aria-label="Menu tài khoản"]').click(); await wait(() => document.querySelector('[role="menuitem"][data-menu-id$="logout"]'));
    document.querySelector('[role="menuitem"][data-menu-id$="logout"]').click(); return null;
  }
  if (['login', 'locked'].includes(scenario)) {
    await wait(() => document.getElementById('tenDangNhap'));
    input('tenDangNhap', 'fixture.elder'); input('matKhau', scenario === 'login' ? 'wrong-password' : 'fixture-password');
    document.querySelector('.login-form button[type="submit"]').click();
    await wait(() => text().includes(scenario === 'locked' ? 'Tài khoản đã bị khóa' : 'mật khẩu không chính xác'));
    check('failed login never opens workspace', !ready());
    if (scenario === 'locked') return { checks };
    input('matKhau', 'fixture-password'); document.querySelector('.login-form button[type="submit"]').click();
  }
  if (['admin', 'caregiver', 'relative'].includes(scenario)) {
    await wait(() => text().includes('Bạn không có quyền truy cập giao diện này'));
    check('other role cannot enter elderly workspace', !document.querySelector('.elderly-web'));
    clickButton('Về trang của tôi');
    await wait(() => scenario === 'relative' ? text().includes('Người thân của tôi') : text().includes('Trung tâm Giám sát'));
    check('old role retains its own workspace', location.pathname === (scenario === 'relative' ? '/nguoi-than-cua-toi' : '/dashboard'));
    const styleEvidence = [...document.querySelectorAll('header,aside,nav,main,.app-header,.app-sidebar')].map(el => {
      const s = getComputedStyle(el), r = el.getBoundingClientRect();
      return { tag: el.tagName, class: String(el.className), color: s.color, background: s.backgroundColor, font: s.fontFamily, fontSize: s.fontSize, width: r.width };
    });
    return { checks, styleEvidence };
  }
  if (scenario === 'expired') {
    await wait(() => document.querySelector('.login-page'));
    check('expired token returns to login and clears Web session', !localStorage.getItem('token') && !localStorage.getItem('user'));
    return { checks };
  }
  if (['offline', 'server', 'forbidden', 'generic404'].includes(scenario)) {
    await wait(() => text().includes('Chưa thể mở hồ sơ'));
    check('API failure is not onboarding', !document.getElementById('complete-profile-title') && !ready());
    check('retry is available', [...document.querySelectorAll('button')].some(button => button.textContent === 'Thử lại'));
    return { checks };
  }
  if (scenario === 'missing') {
    await wait(() => document.getElementById('complete-profile-title'));
    check('missing profile opens completion form', !ready());
    clickButton('Lưu hồ sơ và tiếp tục');
    await wait(() => text().includes('Vui lòng chọn ngày sinh'));
    check('required validation stays active', text().includes('Vui lòng chọn giới tính'));
    // Interact with the actual shared DatePicker/Select, not an injected form state.
    await fetch('/__elderly_progress', { method: 'POST', body: 'date-input' });
    input('ngaySinh', '01/01/1950');
    document.getElementById('ngaySinh').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
    document.getElementById('ngaySinh').dispatchEvent(new Event('blur', { bubbles: true }));
    await fetch('/__elderly_progress', { method: 'POST', body: 'gender-input' });
    const gender = document.getElementById('gioiTinh');
    gender.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    gender.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));
    await wait(() => document.querySelector('.ant-select-item-option[title="Nữ"]'));
    document.querySelector('.ant-select-item-option[title="Nữ"]').click();
    await fetch('/__elderly_progress', { method: 'POST', body: 'submit-profile' });
    await delay(100); clickButton('Lưu hồ sơ và tiếp tục');
  }
  await wait(ready);
  check('exact responsive viewport', innerWidth === width);
  check('own account/profile is shown', text().includes('NCT fixture 70'));
  check('five primary navigation destinations', document.querySelectorAll('.elderly-web-nav > a').length === 5);
  check('no horizontal overflow', document.documentElement.scrollWidth <= innerWidth + 1);
  check('header and visible navigation targets fit', [...document.querySelectorAll('.elderly-web-header button,.elderly-web-nav a')].filter(el => el.checkVisibility()).every(el => {
    const rect = el.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth + 1 && rect.height >= 44;
  }));
  check('personal profile is not persisted', ![...Array(localStorage.length)].map((_, i) => localStorage.key(i)).some(key => !['token', 'user'].includes(key)));
  if (scenario === 'nav-shortcuts') {
    const group = () => document.querySelector('.elderly-web-secondary-nav');
    const health = () => group().querySelector('a[href="/ca-nhan/suc-khoe"]');
    const family = () => group().querySelector('a[href="/ca-nhan/nguoi-than"]');
    check('two secondary links open independent health and family pages', group().querySelectorAll('a').length === 2 && health() && family());
    check('mobile bottom bar remains exactly five visible destinations', [...document.querySelectorAll('.elderly-web-nav > a')].filter(node => node.checkVisibility()).length === 5);
    check('desktop shortcuts do not add mobile bottom destinations', group().checkVisibility() === (width > 768));
    if (width > 768) health().click(); else document.querySelector('.elderly-home-measure-link').click();
    await wait(() => document.getElementById('elderly-web-content').textContent.includes('Theo dõi sức khỏe') && [...document.querySelectorAll('button')].some(node => node.textContent.trim() === 'Thêm số đo'));
    check('health link opens the real owner health screen', location.pathname === '/ca-nhan/suc-khoe');
    clickButton('Thêm số đo'); await wait(() => document.querySelector('.ant-modal:not([style*="display: none"]) input[aria-label="Giá trị đo"]'));
    check('existing measurement form is reused', document.body.textContent.includes('Huyết áp tâm thu') && document.body.textContent.includes('Huyết áp tâm trương'));
    clickButton('Hủy'); await delay(100);
    if (width > 768) family().click(); else {
      const account = document.querySelector('[aria-label="Menu tài khoản"]');
      account.scrollIntoView({ block: 'center' }); account.click();
      await wait(() => document.querySelector('[role="menuitem"][data-menu-id$="relatives"]'));
      const item = document.querySelector('[role="menuitem"][data-menu-id$="relatives"]');
      item.focus(); check('mobile family destination is keyboard focusable', document.activeElement === item);
      item.click();
      await wait(() => account.getAttribute('aria-expanded') === 'false');
    }
    await wait(() => document.activeElement?.id === 'elderly-web-content' && document.querySelector('h1')?.textContent === 'Người thân của tôi');
    const section = document.querySelector('[aria-label="Người thân được phép theo dõi"]');
    check('family opens its own URL and page heading', location.pathname === '/ca-nhan/nguoi-than' && location.hash === '' && section);
    check('family page cannot grant access or create an account', section.querySelectorAll('button').length === 1);
    check('profile is not selected on the independent family page', !document.querySelector('.elderly-web-nav > a[href="/ca-nhan/ho-so"]').hasAttribute('aria-current'));
    if (width > 768) {
      check('family shortcut shows current page', family().getAttribute('aria-current') === 'page');
      scrollTo(0, 0); family().click(); await delay(80);
      check('reselecting the page remains operable', document.activeElement?.id === 'elderly-web-content');
    }
    const nodes = [...document.querySelectorAll('.elderly-web *')].filter(node => !['svg', 'path'].includes(node.tagName.toLowerCase()));
    const sizes = nodes.map(node => parseFloat(getComputedStyle(node).fontSize)); nodes.forEach((node, index) => { node.style.fontSize = `${sizes[index] * 1.8}px`; });
    await delay(100); check('navigation supports 180% text without horizontal overflow', document.documentElement.scrollWidth <= innerWidth + 1);
    document.querySelectorAll('.elderly-web *').forEach(node => node.style.removeProperty('font-size'));
    route('/ca-nhan'); await delay(100); scrollTo(0, 0);
    return { checks };
  }
  if (scenario === 'own-relatives') {
    const section = () => document.querySelector('[aria-label="Người thân được phép theo dõi"]');
    await wait(() => section()?.textContent.includes('Người thân fixture 70'));
    check('direct family URL opens the protected dedicated page', location.pathname === '/ca-nhan/nguoi-than' && document.querySelector('h1').textContent === 'Người thân của tôi');
    route('/ca-nhan/ho-so'); await wait(() => document.querySelector('h1')?.textContent === 'Hồ sơ của tôi');
    check('profile no longer embeds the family list', !section() && !text().includes('Người thân fixture 70'));
    route('/ca-nhan/ho-so#nguoi-than'); await wait(() => section()?.textContent.includes('Người thân fixture 70'));
    check('old profile anchor redirects to the dedicated page', location.pathname === '/ca-nhan/nguoi-than' && location.hash === '');
    history.back(); await wait(() => document.querySelector('h1')?.textContent === 'Hồ sơ của tôi');
    check('back navigation does not loop through the old anchor', location.pathname === '/ca-nhan/ho-so' && !section());
    history.forward(); await wait(() => section()?.textContent.includes('Người thân fixture 70'));
    check('forward navigation restores the family page', location.pathname === '/ca-nhan/nguoi-than');
    check('actual linked family, relation, phone and missing phone render', section().textContent.includes('Con gái') && section().textContent.includes('0000000001') && section().textContent.includes('Chưa cập nhật'));
    check('sharing scope is explicit and read only', section().textContent.includes('Không chia sẻ: Dị ứng, Kết quả khám') && section().querySelectorAll('button').length === 1);
    const control = mode => fetch('/__ownRelativesControl', { method: 'POST', body: JSON.stringify({ mode }) });
    const refresh = () => section().querySelector('button').click();
    await control('empty'); refresh(); await wait(() => section().textContent.includes('Chưa có Người thân được liên kết'));
    check('revocation refresh erases previous family', !section().textContent.includes('Người thân fixture 70'));
    await control('error'); refresh(); await wait(() => section().textContent.includes('Không tải được Người thân fixture'));
    await control('denied'); refresh(); await wait(() => section().textContent.includes('Đã mất quyền xem fixture'));
    check('API failure/denial never preserves family details', !section().textContent.includes('0000000001'));
    await control('foreign'); refresh(); await wait(() => section().textContent.includes('không khớp'));
    check('foreign family payload is rejected', !section().textContent.includes('Người thân fixture 70'));
    await control('normal'); refresh(); await wait(() => section().textContent.includes('Người thân fixture 70'));
    localStorage.setItem('token', 'fixture-switched'); dispatchEvent(new StorageEvent('storage', { key: 'token' }));
    await wait(() => section()?.textContent.includes('Người thân fixture 71'));
    check('account switch clears old family', !section().textContent.includes('Người thân fixture 70'));
    const nodes = [section(), ...section().querySelectorAll('*')].filter(node => !['svg', 'path'].includes(node.tagName.toLowerCase()));
    const sizes = nodes.map(node => parseFloat(getComputedStyle(node).fontSize)); nodes.forEach((node, index) => { node.style.fontSize = `${sizes[index] * 1.8}px`; });
    await delay(100); check('family list supports 180% text without horizontal overflow', document.documentElement.scrollWidth <= innerWidth + 1);
    [section(), ...section().querySelectorAll('*')].forEach(node => node.style.removeProperty('font-size'));
    section().scrollIntoView({ block: 'start' }); window.scrollBy(0, -120); await delay(100);
    return { checks };
  }
  if (scenario === 'phase2') {
    await wait(() => text().includes('Chưa có ngưỡng đánh giá'));
    check('unknown thresholds do not display a normal green tag', !document.querySelector('.elderly-care-metric .ant-tag-green'));
    route('/ca-nhan/ho-so'); await wait(() => text().includes('Số điện thoại tài khoản'));
    check('profile name and account name are distinct', text().includes('Họ tên hồ sơ NCT') && text().includes('Tên tài khoản:') && text().includes('Tài khoản fixture 70'));
    check('profile contact phone and account phone both use real API fields', text().includes('Số điện thoại liên hệ') && text().includes('0000000012') && text().includes('0000000015'));
    clickButton('Chỉnh sửa hồ sơ'); await wait(() => document.getElementById('elderly-profile-edit_soDienThoai'));
    check('profile edit label explains phone meaning', document.querySelector('label[for="elderly-profile-edit_soDienThoai"]').textContent === 'Số điện thoại liên hệ');
    check('only contact phone is edited', document.getElementById('elderly-profile-edit_soDienThoai').value === '0000000012');
    const nodes = [...document.querySelectorAll('.elderly-web *')].filter(el => !['svg', 'path'].includes(el.tagName.toLowerCase()));
    const sizes = nodes.map(el => parseFloat(getComputedStyle(el).fontSize)); nodes.forEach((el, i) => { el.style.fontSize = `${sizes[i] * 1.8}px`; });
    dispatchEvent(new Event('resize')); await delay(100);
    check('profile remains inside viewport at 180% text', document.documentElement.scrollWidth <= innerWidth + 1);
    return { checks };
  }
  if (scenario.startsWith('design-')) {
    const ratio = (fg, bg) => {
      const light = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => v / 255)
        .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
        .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
      const a = light(fg), b = light(bg); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    };
    const screens = {
      home: ['/ca-nhan', () => text().includes('Lịch uống thuốc hôm nay') && document.querySelector('.elderly-care-metric')],
      health: ['/ca-nhan/suc-khoe', () => document.querySelector('.elderly-care-chart svg')],
      schedule: ['/ca-nhan/lich-trinh', () => document.querySelector('.elderly-care-dose')],
      visits: ['/ca-nhan/lich-trinh?tab=kham', () => text().includes('Xem chi tiết lịch khám')],
      sos: ['/ca-nhan/sos', () => sosButton()],
      alerts: ['/ca-nhan/canh-bao', () => text().includes('Cảnh báo sức khỏe fixture của tôi')],
      notifications: ['/ca-nhan/canh-bao?tab=notifications', () => text().includes('Thông báo fixture của tôi')],
      profile: ['/ca-nhan/ho-so', () => document.getElementById('google-current-password')],
      ai: ['/ca-nhan/tro-ly', () => document.getElementById('assistant-question')],
    };
    const large = scenario === 'design-large-text', homeSix = scenario.startsWith('design-home-six');
    const formKind = scenario.includes('metric-form') ? 'metric' : scenario.includes('profile-form') ? 'profile' : scenario.includes('dose-form') ? 'dose' : null;
    const largeForm = scenario.endsWith('form-large');
    const names = large ? Object.keys(screens) : [scenario.startsWith('design-home') || scenario.startsWith('design-header') ? 'home' : formKind === 'metric' ? 'health' : formKind === 'profile' ? 'profile' : formKind === 'dose' ? 'schedule' : scenario === 'design-reduced-motion' ? 'home' : scenario.slice(7)];
    let scaled = [];
    for (const name of names) {
      scaled.forEach(([el, value]) => { el.style.fontSize = value; });
      const [path, loaded] = screens[name]; route(path); await wait(loaded); await delay(100);
      if (formKind) {
        clickButton(formKind === 'metric' ? 'Thêm số đo' : formKind === 'profile' ? 'Chỉnh sửa hồ sơ' : 'Xác nhận đã uống');
        await wait(() => document.querySelector('[role="dialog"] input'));
        check('owned modal retains the accessible NCT action palette', getComputedStyle(document.querySelector('[role="dialog"] button[type="submit"]')).backgroundColor === 'rgb(21, 94, 75)');
      }
      if (large || largeForm || scenario === 'design-home-six-large' || scenario === 'design-header-long-large') {
        const nodes = [...document.querySelectorAll('.elderly-web *,.elderly-care-modal *')].filter(el => !['svg', 'path', 'circle', 'line', 'polyline'].includes(el.tagName.toLowerCase()));
        const sizes = nodes.map(el => parseFloat(getComputedStyle(el).fontSize));
        scaled = nodes.map(el => [el, el.style.fontSize]); nodes.forEach((el, i) => { el.style.fontSize = `${sizes[i] * 1.8}px`; });
        dispatchEvent(new Event('resize')); await delay(80);
      }
      await settleMotion();
      if (largeForm) {
        const submit = document.querySelector('[role="dialog"] button[type="submit"]');
        submit.scrollIntoView({ block: 'center', behavior: 'instant' }); await settleMotion();
        const rect = submit.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        check('180% modal submit fits width and is reachable without a write', rect.left >= 0 && rect.right <= width + 1 && hit?.closest('button') === submit);
        if (!checks.at(-1).pass) checks.at(-1).details = { rect: rect.toJSON(), hit: hit?.outerHTML.slice(0, 900), viewport: [innerWidth, innerHeight] };
      }
      check(`${name} ${large ? '180% ' : ''}fits viewport`, document.documentElement.scrollWidth <= width + 1);
      check(`${name} retains exactly five primary destinations`, document.querySelectorAll('.elderly-web-nav > a').length === 5);
      if (homeSix) {
        const grid = document.querySelector('.elderly-home-metrics'), cards = [...grid.children];
        const expectedColumns = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
        check('all six actual metric types are retained', cards.length === 6);
        check('six metrics form balanced rows with at most three readable columns', [1, 2, 3].includes(expectedColumns) && cards.length % expectedColumns === 0);
        const boxes = cards.slice(0, expectedColumns).map(el => el.getBoundingClientRect());
        check('metric cards align with consistent width and height', boxes.every(box => Math.abs(box.width - boxes[0].width) < 1 && Math.abs(box.height - boxes[0].height) < 1));
        const main = document.querySelector('.elderly-web-main').getBoundingClientRect(), nav = document.querySelector('.elderly-web-nav').getBoundingClientRect();
        if (width > 768) check('content starts next to navigation without an oversized empty gutter', main.left - nav.right <= 26);
        check('daily concept puts medication ahead of health and retains appointments/AI', Boolean(document.querySelector('.elderly-home-spotlight + .elderly-home-dose-details + .elderly-home-health') && document.querySelector('.elderly-home-lower [aria-label="Lịch khám sắp tới"]') && document.querySelector('.elderly-home-assistant a[href="/ca-nhan/tro-ly"]')));
        check('spotlight uses actual per-dose counts rather than mockup numbers', document.querySelector('.elderly-home-dose-progress').textContent.includes('Đã uống 0/2 liều'));
        const details = document.querySelector('.elderly-home-dose-details'); details.querySelector('summary').click();
        check('all actual home medication rows remain reachable', details.open && details.querySelectorAll('.elderly-home-dose').length === 2 && [...details.querySelectorAll('.elderly-home-dose')].every(el => el.getBoundingClientRect().height > 0));
        details.querySelector('summary').click();
        const bp = cards.find(el => el.textContent.includes('Huyết áp')).querySelector('.elderly-care-value strong');
        const range = document.createRange(); range.selectNodeContents(bp);
        check('blood pressure value stays on one line at the selected text scale', range.getClientRects().length === 1);
      }
      if (scenario === 'design-home-complete') {
        check('completed day keeps the actual full dose progress', document.querySelector('.elderly-home-dose-progress').textContent.includes('Đã uống 2/2 liều'));
        check('completed doses are not invented as another pending dose', !document.querySelector('.elderly-home-featured-summary') && document.querySelectorAll('.elderly-home-dose').length === 2);
      }
      if (scenario === 'design-home-empty') check('empty schedule is explicit without a fabricated dose or progress', document.querySelector('.elderly-home-spotlight').textContent.includes('Hôm nay chưa có lịch uống thuốc') && !document.querySelector('.elderly-home-featured-summary,.elderly-home-dose-progress,.elderly-home-dose-details'));
      if (scenario === 'design-home-med-error') check('schedule error is distinct from an empty day and offers retry', document.querySelector('.elderly-home-spotlight [role="alert"]') && document.querySelector('.elderly-home-spotlight').textContent.includes('Thử lại') && !document.querySelector('.elderly-home-featured-summary'));
      if (scenario.startsWith('design-header')) {
        const header = document.querySelector('.elderly-web-header'), account = header.querySelector('[aria-label="Menu tài khoản"]');
        check('topbar groups fit without clipping at the current text scale', [...header.children].filter(el => getComputedStyle(el).display !== 'none').every(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= width + 1; }));
        check('long account name is the real loaded fixture identity', header.querySelector('.elderly-web-account-name').textContent.includes('Nguyễn Thị Minh An'));
        check('account button describes the full identity accessibly', account.getAttribute('aria-describedby') === 'elderly-current-account');
        if (width > 1180) check('desktop topbar names the active screen', header.querySelector('.elderly-web-header-context strong').textContent === 'Trang chủ' && getComputedStyle(header.querySelector('.elderly-web-header-context')).display !== 'none');
        account.scrollIntoView({ block: 'center' }); account.click();
        await wait(() => document.querySelector('.elderly-web-account-dropdown [role="menu"]')); await delay(180);
        const menu = document.querySelector('.elderly-web-account-dropdown [role="menu"]');
        if (scenario.endsWith('-large')) {
          const nodes = [menu, ...menu.querySelectorAll('*')].filter(el => !['svg','path'].includes(el.tagName.toLowerCase()));
          const sizes = nodes.map(el => parseFloat(getComputedStyle(el).fontSize));
          nodes.forEach((el, i) => { el.style.fontSize = `${sizes[i] * 1.8}px`; }); dispatchEvent(new Event('resize')); await delay(120);
        }
        const bounds = menu.getBoundingClientRect();
        check('account popup remains within the viewport', bounds.left >= 0 && bounds.right <= width + 1 && menu.scrollWidth <= menu.clientWidth + 1);
        check('opening the menu exposes the full name for pointer/keyboard/touch', document.querySelector('.elderly-web-account-identity strong').textContent === header.querySelector('.elderly-web-account-name strong').textContent);
        check('existing profile/password/logout actions remain present', ['profile','password','logout'].every(key => menu.querySelector(`[data-menu-id$="${key}"]`)));
        check('account menu receives keyboard focus', Boolean(document.activeElement.closest('[role="menu"]')));
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', keyCode:27, bubbles:true }));
        await wait(() => account.getAttribute('aria-expanded') === 'false');
        check('Escape closes the account popup', true);
      }
      if (width > 768) {
        const nav = document.querySelector('.elderly-web-nav'), link = nav.querySelector('a:not(.is-active):not(.is-sos)');
        check('dark sidebar navigation text remains readable', ratio(getComputedStyle(link).color, getComputedStyle(nav).backgroundColor) >= 4.5);
      }
      for (const tag of document.querySelectorAll('.elderly-web .ant-tag-green,.elderly-web .ant-tag-red,.elderly-web .ant-tag-orange')) {
        const s = getComputedStyle(tag); check(`${name} rendered status contrast >=4.5`, ratio(s.color, s.backgroundColor) >= 4.5);
      }
      if (name === 'sos') {
        check('emergency screen has no AI overlay', !document.querySelector('.elderly-web-assistant'));
        sosButton().scrollIntoView({ block: 'center', behavior: 'instant' }); await delay(50);
        const box = sosButton().getBoundingClientRect();
        check('SOS center is unobstructed', document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('button') === sosButton());
      } else if (width <= 768) {
        const ai = document.querySelector('.elderly-web-assistant')?.getBoundingClientRect();
        const nav = document.querySelector('.elderly-web-nav').getBoundingClientRect();
        check('AI shortcut stays above bottom navigation', ai && ai.bottom <= nav.top - 8);
      }
      const focusTarget = formKind ? document.querySelector('[role="dialog"] .ant-modal-close')
        : name === 'sos' ? sosButton() : document.querySelector('.elderly-web-nav a');
      if (formKind) focusTarget.scrollIntoView({ block: 'center', behavior: 'instant' });
      focusTarget.focus({ preventScroll: true });
      check(`${name} has a visible keyboard focus indicator`, document.activeElement === focusTarget && getComputedStyle(focusTarget).outlineStyle !== 'none');
      focusTarget.blur();
    }
    if (scenario === 'design-reduced-motion') {
      check('Chrome prefers reduced motion is active', matchMedia('(prefers-reduced-motion: reduce)').matches);
      const style = getComputedStyle(document.querySelector('.elderly-web-nav a'));
      check('navigation respects reduced motion', style.transitionDuration.split(',').every(value => parseFloat(value) <= 0.01));
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    return { checks, visualEvidence: { font: getComputedStyle(document.querySelector('.elderly-web')).fontFamily,
      tags: [...document.querySelectorAll('.elderly-web .ant-tag')].slice(0, 8).map(el => ({ class: el.className, color: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor })) } };
  }
  if (scenario === 'refresh' && !sessionStorage.getItem('did-refresh')) { sessionStorage.setItem('did-refresh', '1'); location.reload(); return null; }
  if (scenario === 'tabs') {
    // A second same-origin browsing context writes storage; Chrome generates
    // the real storage event (no manually dispatched event in this test).
    parent.postMessage('fixture-switch-account', location.origin);
    await wait(() => !text().includes('NCT fixture 70'));
    await wait(() => text().includes('NCT fixture 71'));
    check('account switch removes old profile', !text().includes('NCT fixture 70'));
  } else if (scenario === 'logout') {
    route('/ca-nhan/tro-ly'); await wait(() => document.getElementById('assistant-question'));
    await wait(() => !text().includes('Đang kiểm tra kết nối trợ lý'));
    input('assistant-question', 'Thông tin sức khỏe chỉ trong phiên'); clickButton('Gửi câu hỏi');
    await wait(() => document.querySelector('.elderly-assistant-message.is-assistant'));
    document.querySelector('.elderly-web-header button[aria-label="Menu tài khoản"]').click();
    await wait(() => document.querySelector('[role="menuitem"][data-menu-id$="logout"]'));
    document.querySelector('[role="menuitem"][data-menu-id$="logout"]').click();
    // Full-page logout is tested after reload using the fixture's boot marker.
    return null;
  } else if (scenario === 'ready' || scenario === 'login' || scenario === 'refresh') {
    for (const [suffix, heading] of [['lich-trinh', 'Lịch trình của tôi'], ['suc-khoe', 'Theo dõi sức khỏe'],
      ['sos', 'Hỗ trợ khẩn cấp SOS'], ['canh-bao', 'Cảnh báo và thông báo'], ['ho-so', 'Hồ sơ của tôi'], ['tro-ly', 'Trợ lý CareSenior']]) {
      route(`/ca-nhan/${suffix}`); await wait(() => [...document.querySelectorAll('h1')].some(el => el.textContent === heading));
      if (suffix === 'lich-trinh') {
        [...document.querySelectorAll('[role="tab"]')].find(el => el.textContent === 'Lịch khám').click();
        await wait(() => location.search.includes('tab=kham'));
        await wait(() => text().includes('Lịch khám bệnh'));
        check('schedule tabs navigate', text().includes('Lịch khám bệnh'));
      }
      check(`${suffix} is implemented`, !text().includes('Chức năng chưa được triển khai'));
      await delay(100);
      check(`${suffix} has no overflow`, document.documentElement.scrollWidth <= innerWidth + 1);
      if (suffix === 'suc-khoe') {
        await wait(() => document.querySelector('.elderly-care-chart svg'));
        check('chart shows real fixture instants', text().includes('13:05') && text().includes('23:55') && !text().includes('28/10/2026'));
        const select = document.querySelector('.elderly-care-filters .ant-select input');
        select.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        select.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));
        await wait(() => document.querySelector('.ant-select-item-option[title="Nhiệt độ cơ thể"]'));
        document.querySelector('.ant-select-item-option[title="Nhiệt độ cơ thể"]').click();
        await wait(() => document.querySelector('.elderly-care-value strong')?.textContent === '37.2');
        check('metric type filter uses the selected catalog unit and data', document.querySelector('.elderly-care-value').textContent.includes('°C'));
        const add = [...document.querySelectorAll('button')].find(el => el.textContent === 'Thêm số đo');
        add.focus(); check('metric action can receive keyboard focus', document.activeElement === add);
      }
    }
    for (const path of ['/dashboard', '/nguoi-cham-soc', '/nguoi-dung', '/nguoi-than', '/nguoi-than-cua-toi']) {
      route(path); await wait(() => text().includes('Bạn không có quyền truy cập giao diện này'));
      check(`denied ${path}`, !document.querySelector('.elderly-web'));
    }
    route('/ca-nhan?nguoiCaoTuoiId=999'); await wait(ready);
    check('query cannot select another profile', text().includes('NCT fixture 70'));
  } else if (['empty', 'dataerror', 'foreign'].includes(scenario)) {
    await wait(() => text().includes(scenario === 'empty' ? 'Chưa có dữ liệu' : 'Không thể tải dữ liệu'));
    check('empty or failed data is explicit', !text().includes('KHÔNG ĐƯỢC HIỂN THỊ'));
    check('no writes on empty/error/foreign response', !document.querySelector('input[type="number"]'));
    if (scenario === 'foreign') check('foreign ownership response is rejected', text().includes('không khớp hồ sơ'));
    route('/ca-nhan/suc-khoe'); await wait(() => text().includes('Theo dõi sức khỏe'));
    await wait(() => text().includes(scenario === 'empty' ? 'Chưa có dữ liệu' : 'Không thể tải dữ liệu'));
  } else if (scenario === 'readonly') {
    route('/ca-nhan/suc-khoe'); await wait(() => document.querySelector('.elderly-care-chart svg'));
    check('no metric write without permission', !text().includes('Thêm số đo'));
    route('/ca-nhan/lich-trinh'); await wait(() => text().includes('Thuốc fixture tên dài'));
    check('no confirmation without permission', !text().includes('Xác nhận đã uống'));
    route('/ca-nhan/ho-so'); await wait(() => text().includes('Hồ sơ của tôi'));
    check('no profile edit without permission', !text().includes('Chỉnh sửa hồ sơ'));
  } else if (scenario === 'large-text') {
    let scaled = [];
    for (const suffix of ['', '/suc-khoe', '/lich-trinh', '/ho-so', '/sos', '/canh-bao', '/tro-ly']) {
      // Restore persistent shell nodes before measuring the next route: 1.8x,
      // not 1.8 raised to the number of visited routes.
      scaled.forEach(([el, previous]) => { el.style.fontSize = previous; });
      route(`/ca-nhan${suffix}`); await delay(250);
      const nodes = [...document.querySelectorAll('.elderly-web *')].filter(el => !['svg', 'path'].includes(el.tagName.toLowerCase()));
      const sizes = nodes.map(el => parseFloat(getComputedStyle(el).fontSize));
      scaled = nodes.map(el => [el, el.style.fontSize]);
      nodes.forEach((el, index) => { el.style.fontSize = `${sizes[index] * 1.8}px`; });
      // Browser zoom/viewport changes also emit resize. Trigger it explicitly
      // after this DOM-only font scaling so virtual rendering needn't guess a frame.
      window.dispatchEvent(new Event('resize'));
      await fetch('/__elderly_progress', { method: 'POST', body: `text-scale:${suffix}` });
      await delay(80);
      const over = document.documentElement.scrollWidth > innerWidth + 1;
      const offenders = over ? [...document.querySelectorAll('.elderly-web *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 4).map(el => `${el.tagName}.${el.className}`) : [];
      check(`180% text has no horizontal overflow ${suffix} ${offenders.join(', ')}`, !over);
      if (width <= 768 && suffix !== '/sos') {
        await wait(() => document.querySelector('.elderly-web-assistant').getBoundingClientRect().bottom <= document.querySelector('.elderly-web-nav').getBoundingClientRect().top - 8);
        check(`AI does not overlap bottom navigation ${suffix}`, true);
      }
      if (suffix === '/sos') check('AI is kept off the emergency control', !document.querySelector('.elderly-web-assistant'));
    }
  } else if (scenario.startsWith('ai')) {
    route('/ca-nhan/tro-ly'); await wait(() => document.getElementById('assistant-question'));
    check('AI primary action uses accessible CareSenior deep green', getComputedStyle(document.querySelector('.elderly-assistant-conversations .ant-btn-primary')).backgroundColor === 'rgb(21, 94, 75)');
    if (scenario === 'ai-context') {
      await wait(() => text().includes('Chưa mở được trợ lý'));
      check('foreign profile context fails closed', [...document.querySelectorAll('button')].find(button => button.textContent === 'Gửi câu hỏi').disabled);
      return { checks };
    }
    await wait(() => !text().includes('Đang kiểm tra kết nối trợ lý'));
    if (scenario === 'ai-session') await wait(() => parent.document.getElementById('companion')?.contentWindow.fixtureCompanionReady);
    if (scenario === 'ai-expired') sessionStorage.setItem('ai-expired-pending', '1');
    input('assistant-question', 'Tôi bị đau đầu thì nên làm gì'); clickButton('Gửi câu hỏi');
    if (scenario === 'ai-expired') return null;
    if (['ai-error', 'ai-offline', 'ai-owner'].includes(scenario)) {
      await wait(() => document.querySelector('.elderly-assistant-error'));
      check('API error/foreign reply is explicit, no fake AI', !document.querySelector('.elderly-assistant-message.is-assistant'));
      check('question retained for explicit retry', document.getElementById('assistant-question').value.includes('đau đầu'));
      return { checks };
    }
    if (['ai-pending', 'ai-session'].includes(scenario)) {
      await observeUntil(() => text().includes('Trợ lý đang xử lý câu hỏi'));
      if (scenario === 'ai-session') {
        // Use the second context's Storage object: Chrome emits the real
        // storage event in this frame, even while HTTP freezes virtual timers.
        parent.document.getElementById('companion').contentWindow.localStorage.setItem('token', 'fixture-switched');
      } else {
        clickButton('Trò chuyện mới');
        await observeUntil(() => document.querySelector('.elderly-assistant-empty'));
      }
      await safetyControl('release-chat');
      if (scenario === 'ai-session') await wait(() => text().includes('NCT fixture 71') && document.getElementById('assistant-question'));
      await delay(100);
      check('late response cannot enter a new conversation/account', !document.querySelector('.elderly-assistant-message')
        && document.getElementById('assistant-question').value === ''
        && !document.querySelector('#assistant-conversation option:checked').textContent.includes('Tôi bị đau đầu'));
      if (scenario === 'ai-session') check('old account conversations cleared', ![...document.querySelectorAll('#assistant-conversation option')].some(el => el.textContent.includes('Tôi bị đau đầu')));
      return { checks };
    }
    await wait(() => document.querySelector('.elderly-assistant-message.is-assistant'));
    if (scenario === 'ai-idle-expiry') {
      route('/ca-nhan'); await wait(() => !document.getElementById('assistant-question'));
      await delay(13000); route('/ca-nhan/tro-ly'); await wait(() => text().includes('Phiên trò chuyện đã hết hạn'));
      check('idle token expiry erases RAM chat even while its page is closed', !document.querySelector('.elderly-assistant-message') && document.getElementById('assistant-question').value === '');
      check('expired chat cannot submit and does not silently reauthenticate', [...document.querySelectorAll('button')].find(el => el.textContent === 'Gửi câu hỏi').disabled);
      return { checks };
    }
    if (scenario === 'ai-unavailable') {
      check('AI unavailability is honest and functional fallback works', text().includes('AI hiện chưa khả dụng') && text().includes('AI hiện không khả dụng') && text().includes('Tra cứu theo chức năng'));
      return { checks };
    }
    check('safe Markdown rendered with real emphasis/list', document.querySelector('.assistant-markdown strong') && document.querySelector('.assistant-markdown li'));
    check('HTML/links never execute or fetch remote content', !document.querySelector('.assistant-markdown img,.assistant-markdown script,.assistant-markdown a') && !window.fixtureInjected);
    check('only known navigation actions are rendered', document.querySelectorAll('.elderly-assistant-actions a').length === 1 && document.querySelector('.elderly-assistant-actions a').getAttribute('href') === '/ca-nhan/sos');
    const first = document.getElementById('assistant-conversation').value;
    clickButton('Trò chuyện mới'); await delay(60);
    check('new conversation starts empty', !document.querySelector('.elderly-assistant-message'));
    input('assistant-question', 'thuốc hôm nay của tôi'); clickButton('Gửi câu hỏi');
    await wait(() => text().includes('Chưa có lịch thuốc fixture hôm nay'));
    check('APP reply uses functional mode', text().includes('Tra cứu theo chức năng'));
    input('assistant-question', 'ban biet code ko');
    document.getElementById('assistant-question').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await wait(() => text().includes('Xin lỗi, tôi chỉ hỗ trợ'));
    check('OOS refusal rendered without app fallback', text().includes('Xin lỗi, tôi chỉ hỗ trợ'));
    const select = document.getElementById('assistant-conversation'); select.value = first; select.dispatchEvent(new Event('change', { bubbles: true })); await delay(60);
    check('switch restores only selected conversation', text().includes('Câu trả lời AI fixture') && !text().includes('Chưa có lịch thuốc fixture hôm nay'));
    clickButton('Đóng'); await wait(() => !document.getElementById('assistant-question'));
    document.getElementById('elderly-assistant-entry').click(); await wait(() => text().includes('Câu trả lời AI fixture'));
    check('close/reopen retains RAM conversation', text().includes('Câu trả lời AI fixture'));
    check('chat content never persisted in storage', [...Array(localStorage.length)].every((_, index) => ['token', 'user'].includes(localStorage.key(index))) && !JSON.stringify({ ...sessionStorage }).includes('đau đầu'));
    document.querySelector('.elderly-assistant-actions a').click(); await wait(sosButton);
    check('AI SOS action only opens idle screen', sosButton().textContent.includes('Nhấn giữ 3 giây') && !document.querySelector('.elderly-web-assistant'));
    route('/ca-nhan/tro-ly'); await wait(() => document.querySelector('.assistant-markdown'));
    const nodes = [...document.querySelectorAll('.elderly-web *')].filter(el => !['svg', 'path'].includes(el.tagName.toLowerCase()));
    const sizes = nodes.map(el => parseFloat(getComputedStyle(el).fontSize)), previousSizes = nodes.map(el => el.style.fontSize);
    nodes.forEach((el, index) => { el.style.fontSize = `${sizes[index] * 1.8}px`; });
    dispatchEvent(new Event('resize')); await fetch('/__elderly_progress', { method: 'POST', body: 'AI text180' });
    check('chat text 180% has no horizontal overflow', document.documentElement.scrollWidth <= innerWidth + 1);
    check('chat has accessible input and live log', document.querySelector('label[for="assistant-question"]') && document.querySelector('[role="log"][aria-live="polite"]'));
    input('assistant-question', 'Đang nhập chưa gửi'); document.getElementById('assistant-question').focus();
    check('keyboard can focus composer', document.activeElement.id === 'assistant-question');
    document.querySelector('[aria-label="Menu tài khoản"]').scrollIntoView({ block: 'center' });
    await fetch('/__elderly_progress', { method: 'POST', body: 'menu-position' });
    document.querySelector('[aria-label="Menu tài khoản"]').click(); await wait(() => document.querySelector('[role="menu"]'));
    await delay(180);
    check('account menu is inside viewport', [...document.querySelectorAll('[role="menu"]')].every(el => el.getBoundingClientRect().right <= innerWidth + 1 && el.getBoundingClientRect().left >= 0));
    check('account menu can receive keyboard focus', document.activeElement.closest('[role="menu"]'));
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    await wait(() => document.querySelector('[aria-label="Menu tài khoản"]').getAttribute('aria-expanded') === 'false');
    check('Escape closes account menu', true);
    nodes.forEach((el, index) => { el.style.fontSize = previousSizes[index]; }); dispatchEvent(new Event('resize'));
    clickButton('Xóa cuộc trò chuyện này'); await wait(() => text().includes('Xóa nội dung hội thoại này khỏi phiên?'));
    clickButton('Hủy'); await delay(80); check('cancel delete preserves conversation', document.querySelector('.assistant-markdown'));
    document.querySelector('.elderly-assistant-heading').scrollIntoView({ block: 'start' }); await delay(100);
  } else if (scenario.startsWith('sos-')) {
    route('/ca-nhan/sos'); await wait(sosButton);
    check('SOS control is keyboard focusable and initially enabled', !sosButton().disabled && sosButton().tagName === 'BUTTON');
    check('no receive/resolve actions for NCT', ![...document.querySelectorAll('button')].some(el => /^(Tiếp nhận|Xử lý|Kết thúc SOS)$/.test(el.textContent)));
    if (scenario === 'sos-cancel') {
      pointer('pointerdown'); await delay(900); pointer('pointerup'); await delay(2300);
      check('early release never confirms SOS', !text().includes('Máy chủ đã xác nhận ghi nhận SOS'));
      pointer('pointerdown'); await delay(900); window.dispatchEvent(new Event('blur')); await delay(2300);
      keyboard('keydown'); await delay(900); route('/ca-nhan'); await delay(2400); route('/ca-nhan/sos'); await wait(sosButton);
      check('route change cancels the hold', sosButton().textContent.includes('Nhấn giữ 3 giây'));
      pointer('pointerdown'); await delay(500); clickButton('Hủy thao tác giữ'); await delay(2800);
    } else if (scenario === 'sos-account') {
      pointer('pointerdown'); await delay(700); parent.postMessage('fixture-switch-account', location.origin);
      await wait(() => text().includes('NCT fixture 71')); await wait(sosButton); await delay(3000);
      check('account switch clears hold, GPS, result and previous profile', !text().includes('NCT fixture 70') && sosButton().textContent.includes('Nhấn giữ 3 giây'));
    } else {
      if (['sos-gps', 'sos-denied'].includes(scenario)) {
        Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (resolve, reject) => scenario === 'sos-gps'
          ? resolve({ coords: { latitude: 10.75, longitude: 106.67 } }) : reject({ code: 1 }) } });
        clickButton('Lấy vị trí cho SOS'); await wait(() => text().includes(scenario === 'sos-gps' ? 'Vị trí đã sẵn sàng' : 'Bạn chưa cho phép vị trí'));
      }
      // Browser virtual time advances actual production timers; no forced state or POST.
      if (scenario === 'sos-send') keyboard('keydown'); else pointer('pointerdown');
      if (scenario === 'sos-pending') {
        // Chrome pauses virtual timers for an intentionally pending HTTP fetch.
        // Observe DOM/network progress instead of waiting on that paused clock.
        await observeUntil(() => text().includes('Đang gửi SOS — chờ máy chủ xác nhận'));
      } else {
        await delay(2990); check('not acknowledged before 3s', !text().includes('Máy chủ đã xác nhận ghi nhận SOS'));
        await delay(150);
      }
      if (scenario === 'sos-uncertain') {
        await wait(() => text().includes('Chưa xác định kết quả'));
        check('uncertain result cannot immediately send again', sosButton().disabled);
        await safetyControl('reconnect');
        for (let i = 0; i < 30 && !getSocket().connected; i++) { await safetyControl('stats'); await delay(200); }
        await wait(() => text().includes('Đã kết nối realtime'));
        check('reconnect never changes uncertainty into success', text().includes('Chưa xác định kết quả') && !text().includes('Máy chủ đã xác nhận ghi nhận SOS'));
        clickButton('Kiểm tra lịch sử trước khi gửi lại'); await wait(() => text().includes('Tôi đã xem lịch sử'));
        check('manual review still requires acknowledgement', [...document.querySelectorAll('button')].find(el => el.textContent === 'Chuẩn bị thao tác SOS mới').disabled);
      } else {
        if (scenario === 'sos-pending') {
          route('/ca-nhan'); await fetch('/__elderly_progress', { method: 'POST', body: 'pending-home' });
          await observeUntil(() => text().includes('Xin chào, NCT fixture 70'));
          route('/ca-nhan/sos'); await fetch('/__elderly_progress', { method: 'POST', body: 'pending-return' });
          // Finish the held HTTP response before waiting on React Router's
          // transition: Chrome pauses virtual rendering while the fetch is open.
          await safetyControl('release');
        }
        await wait(() => text().includes('Máy chủ đã xác nhận ghi nhận SOS'));
        check('server confirmed SOS appears in own history', text().includes('Mã SOS: 80'));
        check('zero caregivers is disclosed honestly', text().includes('Chưa có tài khoản người chăm sóc nhận thông báo'));
        check('successful request remains locked against repeated presses', sosButton().disabled);
        if (scenario === 'sos-pending') check('returning to SOS receives the original request acknowledgement without a second hold', text().includes('Mã SOS: 80'));
      }
    }
    const counts = (await safetyControl('stats')).data;
    check('only an intentional completed hold creates a request', counts.posts === (['sos-cancel', 'sos-account'].includes(scenario) ? 0 : 1));
    check('SOS has no horizontal overflow', document.documentElement.scrollWidth <= innerWidth + 1);
  } else if (scenario === 'safety-live') {
    route('/ca-nhan/canh-bao?tab=notifications'); await wait(() => text().includes('Thông báo fixture của tôi'));
    await wait(() => text().includes('Đã kết nối realtime'));
    const before = (await safetyControl('stats')).data.calls.length;
    await safetyControl('foreign'); await delay(400);
    const after = (await safetyControl('stats')).data.calls;
    // Connect/foreground may independently reconcile the own API concurrently;
    // the pure bridge test checks zero invalidations for the foreign event itself.
    check('foreign payload never renders and cannot request a foreign profile', !text().includes('FOREIGN SECRET')
      && after.slice(before).every(call => call.endpoint === '/notifications/me' || call.endpoint.startsWith('/elderly/me/') || call.endpoint === '/health-metric-types' || call.endpoint === '/emergency-alerts'));
    await safetyControl('notice'); await wait(() => text().includes('Thông báo realtime fixture mới'));
    check('duplicate socket events and API rows produce one notification', [...document.querySelectorAll('h3')].filter(el => el.textContent === 'Thông báo realtime fixture mới').length === 1);
    clickButton('Đánh dấu đã đọc'); await wait(() => text().includes('1 thông báo chưa đọc'));
    route('/ca-nhan/canh-bao?tab=alerts'); await wait(() => text().includes('Cảnh báo sức khỏe fixture của tôi'));
    check('internal handling note is excluded', !text().includes('INTERNAL SECRET'));
    await safetyControl('own-alert'); await wait(() => text().includes('Cảnh báo realtime fixture đúng tài khoản'));
    check('own alerts refresh through the existing socket', text().includes('Cảnh báo realtime fixture đúng tài khoản'));
    route('/ca-nhan/canh-bao?tab=notifications'); await wait(() => text().includes('Thông báo fixture của tôi'));
    [...document.querySelectorAll('a')].find(el => el.textContent === 'Mở mục liên quan').click();
    await wait(() => location.pathname === '/ca-nhan/lich-trinh');
    check('notice links stay inside the NCT workspace', location.search === '?tab=thuoc');
  } else if (scenario === 'actions') {
    route('/ca-nhan/suc-khoe'); await wait(() => document.querySelector('.elderly-care-chart svg'));
    clickButton('Thêm số đo'); await wait(() => document.getElementById('elderly-metric_giaTri'));
    input('elderly-metric_giaTri', '-1'); input('elderly-metric_giaTriPhu', '80');
    await fetch('/__elderly_progress', { method: 'POST', body: 'invalid-metric' });
    clickButton('Lưu số đo'); await wait(() => text().includes('Huyết áp phải từ'));
    check('real backend value validator message is rendered', Boolean(document.querySelector('.ant-modal')));
    await safetyControl('hold-types');
    await observeUntil(() => document.querySelector('section[aria-label="Loại chỉ số"] [role="status"]'));
    check('catalog reload retains the open form unit and secondary field', text().includes('Thêm số đo Huyết áp') && Boolean(document.getElementById('elderly-metric_giaTriPhu')));
    input('elderly-metric_giaTri', '128');
    await fetch('/__elderly_progress', { method: 'POST', body: 'save-metric' });
    clickButton('Lưu số đo'); clickButton('Lưu số đo');
    await fetch('/__elderly_progress', { method: 'POST', body: 'save-during-catalog-refresh' });
    await safetyControl('release-types');
    await wait(() => text().includes('128/80'));
    check('metric save refreshes actual data', text().includes('128/80'));
    route('/ca-nhan/lich-trinh'); await wait(() => text().includes('Thuốc fixture tên dài'));
    const before = text(); check('unconfirmed progress is shown', before.includes('Đã uống 0/2 liều'));
    clickButton('Xác nhận đã uống'); await wait(() => document.querySelector('.ant-modal input[type="checkbox"]'));
    document.querySelector('.ant-modal input[type="checkbox"]').click();
    await fetch('/__elderly_progress', { method: 'POST', body: 'confirm-dose' });
    clickButton('Gửi xác nhận'); clickButton('Gửi xác nhận');
    await wait(() => text().includes('Đã uống 1/2 liều'));
    check('one confirmed dose changes progress', text().includes('Đã uống 1/2 liều'));
    const previous = new Date(Date.now() + 7 * 3600000 - 86400000).toISOString().slice(0, 10);
    const dateInput = document.querySelector('input[aria-label="Ngày uống thuốc"]');
    input(dateInput.id || (dateInput.id = 'fixture-day'), previous);
    await wait(() => text().includes('Thuốc fixture ngày trước'));
    check('day selection replaces the schedule', ![...document.querySelectorAll('.elderly-care-dose')].some(el => el.textContent.includes('Thuốc fixture tên dài')));
    clickButton('Ghi nhận đã uống ngày cũ'); await wait(() => document.getElementById('elderly-dose_takenAt'));
    input('elderly-dose_takenAt', `${previous}T23:10`); input('elderly-dose_lyDo', 'Fixture đã uống nhưng chưa ghi nhận');
    document.querySelector('.ant-modal input[type="checkbox"]').click();
    await fetch('/__elderly_progress', { method: 'POST', body: 'supplement-dose' });
    clickButton('Gửi xác nhận'); await wait(() => text().includes('Đã ghi nhận bổ sung'));
    check('past-dose supplement uses explicit actual time', text().includes('Đã ghi nhận bổ sung'));
    route('/ca-nhan/lich-trinh?tab=kham'); await wait(() => text().includes('Lịch khám lịch sử fixture'));
    [...document.querySelectorAll('button')].find(el => el.textContent === 'Xem chi tiết lịch khám' && el.closest('article').textContent.includes('lịch sử')).click();
    await wait(() => text().includes('Kết quả khám fixture chỉ đọc'));
    check('appointment result is read only', !text().includes('Hủy lịch') && !text().includes('Sửa lịch'));
    clickButton('Đóng');
    route('/ca-nhan/ho-so'); await wait(() => text().includes('Hồ sơ của tôi'));
    clickButton('Chỉnh sửa hồ sơ'); await wait(() => document.getElementById('elderly-profile-edit_hoTen'));
    check('CCCD is not editable', !document.getElementById('elderly-profile-edit_cccd'));
    input('elderly-profile-edit_diaChi', 'Unsaved fixture address');
    const editForm = document.getElementById('elderly-profile-edit_hoTen').closest('form');
    [...editForm.querySelectorAll('button')].find(el => el.textContent === 'Hủy').click();
    await delay(100); clickButton('Chỉnh sửa hồ sơ'); await delay(100);
    check('cancelled optional profile fields do not leak into the next edit', !document.getElementById('elderly-profile-edit_diaChi').value);
    input('elderly-profile-edit_hoTen', 'NCT fixture 70 đã cập nhật');
    await fetch('/__elderly_progress', { method: 'POST', body: 'profile-save' });
    clickButton('Lưu thay đổi'); await wait(() => document.querySelector('.elderly-web-account-name')?.textContent.includes('đã cập nhật'));
    check('profile save reloads owner verified header', text().includes('NCT fixture 70 đã cập nhật'));
    clickButton('Đổi mật khẩu'); await wait(() => document.getElementById('matKhauHienTai'));
    input('matKhauHienTai', 'fixture-password'); input('matKhauMoi', 'fixture-password-new'); input('xacNhanMatKhau', 'fixture-password-new');
    await fetch('/__elderly_progress', { method: 'POST', body: 'password-save' });
    [...document.querySelectorAll('.ant-modal button[type="submit"]')].find(el => el.textContent.includes('Đổi mật khẩu')).click();
    await wait(() => text().includes('Đổi mật khẩu thành công'));
    check('existing password modal works against RAM API', text().includes('Đổi mật khẩu thành công'));
    document.querySelector('[aria-label="Menu tài khoản"]').click(); await wait(() => document.querySelector('[role="menuitem"][data-menu-id$="password"]'));
    document.querySelector('[role="menuitem"][data-menu-id$="password"]').click();
    await wait(() => document.querySelector('.ant-modal:not([style*="display: none"]) #matKhauHienTai'));
    check('header and profile share one password dialog', document.querySelectorAll('#matKhauHienTai').length === 1);
  }
  return { checks };
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
void (async () => {
  try {
    let result;
    if ((scenario === 'logout' && sessionStorage.getItem('logout-pending')) || (scenario === 'ai-expired' && sessionStorage.getItem('ai-expired-pending'))) {
      await wait(() => document.querySelector('.login-page'));
      result = { checks: [{ name: 'logout/expired AI clears tokens, old profile and conversation UI', pass: !localStorage.getItem('token') && !localStorage.getItem('user') && !text().includes('NCT fixture 70') && !document.querySelector('.elderly-assistant-message') }] };
    } else {
      if (scenario === 'logout') sessionStorage.setItem('logout-pending', '1');
      result = await run();
    }
    if (result) await fetch('/__elderly_result', { method: 'POST', body: JSON.stringify(result) });
  } catch (error) { await fetch('/__elderly_result', { method: 'POST', body: JSON.stringify({ error: error.message, socket: { connected: getSocket().connected, active: getSocket().active, state: getSocket().io._readyState, transport: getSocket().io.engine?.transport?.name } }) }); }
})();
