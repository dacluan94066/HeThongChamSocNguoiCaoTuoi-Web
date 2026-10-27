/* oxlint-disable react/only-export-components -- Standalone test entry, not production code. */
import React, { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../src/App';
import 'antd/dist/reset.css';
import '../../src/index.css';
import '../../src/styles/tokens.css';
const params = new URLSearchParams(window.location.search);
const role = params.get('fixtureRole');
if (['QuanTriVien', 'NguoiChamSoc', 'NguoiCaoTuoi', 'NguoiThan'].includes(role)) localStorage.setItem('token', `portal-fixture-${role}`);
function Diagnostics() {
  const [result, setResult] = useState('');
  useEffect(() => {
    const report = () => {
      if (window.parent === window) return;
      const root = document.querySelector('.relative-portal');
      window.parent.postMessage({ fixtureLayout: { viewport: window.innerWidth,
        document: document.documentElement.scrollWidth, portal: root ? Math.round(root.getBoundingClientRect().width) : null,
        cardOverflow: [...document.querySelectorAll('.relative-portal-card,.relative-portal-person-list button')]
          .filter(el => el.scrollWidth > el.clientWidth + 2).length } }, window.location.origin);
    };
    const timer = window.setInterval(report, 600); report(); return () => window.clearInterval(timer);
  }, []);
  return <details style={{ background: '#fff5d8', padding: '8px 16px', borderBottom: '1px solid #e8d8ac', fontSize: 12 }}>
    <summary>FIXTURE RAM — Không SQL, không SOS thật · Kiểm thử Web Người thân</summary>
    <p>Đăng nhập mô phỏng: fixture.NguoiThan · mật khẩu fixture-only-123. Không nhập thông tin thật.</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      {['NguoiThan', 'QuanTriVien', 'NguoiChamSoc', 'NguoiCaoTuoi'].map(value => <a key={value} href={`${value === 'NguoiThan' ? '/nguoi-than-cua-toi' : '/dashboard'}?fixtureRole=${value}`}>{value}</a>)}
      <button onClick={() => { localStorage.removeItem('token'); localStorage.removeItem('user'); window.location.assign('/login'); }}>Phiên chưa đăng nhập</button>
      {['reset', 'ready', 'unready', 'empty', 'error', 'slow', 'denied', 'expired', 'health-error', 'revoke', 'scope-off'].map(action => <button key={action} onClick={async () => {
        await fetch('/__portal_fixture/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) }); setResult(`Đã đặt fixture: ${action}`);
      }}>{action}</button>)}
      <button onClick={async () => setResult(JSON.stringify((await (await fetch('/__portal_fixture/state')).json()).data, null, 2))}>Xem trace mock</button>
    </div><pre style={{ whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>{result}</pre>
  </details>;
}
createRoot(document.getElementById('root')).render(<StrictMode><Diagnostics /><App /></StrictMode>);
