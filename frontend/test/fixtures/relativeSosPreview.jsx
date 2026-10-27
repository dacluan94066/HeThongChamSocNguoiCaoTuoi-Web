/* oxlint-disable react/only-export-components -- Isolated fixture entry, never used by production. */
import React, { StrictMode, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../src/App';
import 'antd/dist/reset.css';
import '../../src/index.css';
import '../../src/styles/tokens.css';
localStorage.setItem('token', window.__RELATIVE_SOS_FIXTURE_TOKEN__);
const media = [], log = [];
let block = false;
const NativeAudio = window.Audio;
window.Audio = function Audio(src) {
  const audio = new NativeAudio(src); media.push(audio);
  const play = audio.play.bind(audio), pause = audio.pause.bind(audio);
  audio.play = () => {
    if (block) { log.push('simulated NotAllowedError'); return Promise.reject(new DOMException('Fixture autoplay block', 'NotAllowedError')); }
    return play().then(() => { log.push(audio.loop ? 'native loop play resolved' : 'native preview play resolved'); });
  };
  audio.pause = () => { log.push('native pause'); pause(); };
  return audio;
};
window.Audio.prototype = NativeAudio.prototype;
function Diagnostics() {
  const [status, setStatus] = useState(''), [stats, setStats] = useState('');
  useEffect(() => {
    const update = () => setStats(JSON.stringify({ created: media.length, activeLoops: media.filter(audio => audio.loop && !audio.paused).length,
      nativeLoopPlays: log.filter(item => item === 'native loop play resolved').length,
      blocked: log.filter(item => item === 'simulated NotAllowedError').length, last: log.at(-1) || '', blockSimulation: block }));
    const timer = setInterval(update, 250); update(); return () => clearInterval(timer);
  }, []);
  return <details open style={{ padding: 12, background: '#fff4d3', fontSize: 12, borderBottom: '1px solid #e7d6a5' }}>
    <summary>FIXTURE SOS — Socket.IO thật, SQL RAM · Không gửi SOS thật/không ghi database</summary>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '10px 0' }}>{['send7', 'send8', 'replay7', 'replay8', 'ordinary', 'revoke7', 'revoke8', 'resolve7', 'disconnect'].map(action => <button key={action} onClick={async () => {
      const response = await fetch('/__relative_sos/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      setStatus(response.ok ? `Mock backend đã hoàn tất: ${action}` : 'Fixture action failed');
    }}>{action}</button>)}
      <button onClick={() => { block = !block; setStatus(`Mô phỏng chặn autoplay: ${block}`); }}>Đổi mô phỏng chặn autoplay</button>
    </div><p>{status}</p><output aria-label="Trạng thái media native">{stats}</output>
  </details>;
}
createRoot(document.getElementById('root')).render(<StrictMode><Diagnostics /><App /></StrictMode>);
