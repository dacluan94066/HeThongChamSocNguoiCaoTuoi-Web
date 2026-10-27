/* oxlint-disable react/only-export-components -- Standalone manual fixture entry, not a reusable component module. */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../src/App';
import 'antd/dist/reset.css';
import '../../src/index.css';
import '../../src/styles/tokens.css';
const params = new URLSearchParams(window.location.search);
const role = params.get('fixtureRole') || localStorage.getItem('relative-fixture-role') || 'QuanTriVien';
localStorage.setItem('relative-fixture-role', role);
localStorage.setItem('token', `fixture-${role}`);
function Diagnostics() {
  const [result, setResult] = useState('');
  const control = async action => {
    await fetch('/__relative_fixture/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
    if (action === 'conflict') setResult('Đã mô phỏng xung đột ở lần cập nhật/thu hồi kế tiếp.');
    else window.location.assign('/nguoi-than');
  };
  return <details style={{ padding: '8px 18px', background: '#fff5d9', borderBottom: '1px solid #ead7a5', fontSize: 13 }}>
    <summary>FIXTURE RAM — Không database thật · Không SOS · Vai trò: {role}</summary>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: 12 }}>
      {['QuanTriVien', 'NguoiChamSoc', 'NguoiCaoTuoi', 'nopermission'].map(value => <a key={value} href={`/nguoi-than?fixtureRole=${value}`}>{value}</a>)}
      {['reset', 'unready', 'ready', 'empty', 'error', 'slow', 'conflict'].map(action => <button key={action} onClick={() => control(action)}>{action}</button>)}
      <button onClick={async () => setResult(JSON.stringify((await (await fetch('/__relative_fixture/state')).json()).data, null, 2))}>Xem trạng thái mock</button>
    </div><pre style={{ whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto' }}>{result}</pre>
  </details>;
}
createRoot(document.getElementById('root')).render(<><Diagnostics /><App /></>);
