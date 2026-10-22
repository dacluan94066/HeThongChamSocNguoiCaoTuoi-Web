/* oxlint-disable react/only-export-components -- Standalone manual fixture entry, not a reusable component module. */
// Manual UI acceptance fixture. Run only via ../run-sos-preview.mjs (isolated port).
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { App, ConfigProvider, Button, Space, Alert } from 'antd';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import AuthContext from '../../src/context/AuthContext';
import MainLayout from '../../src/layouts/MainLayout';
import AlertsPage from '../../src/pages/Alerts/AlertsPage';
import { disconnectSocket, getSocket } from '../../src/services/socketClient';
import axiosClient from '../../src/services/axiosClient';
import { getSosAlarmController } from '../../src/utils/sosAlarm';
import 'antd/dist/reset.css';
import '../../src/index.css';
import '../../src/styles/tokens.css';

// Observe real HTMLAudioElement playing/pause/error, never fake a success event.
const NativeAudio = window.Audio;
const fixtureId = Number(new URLSearchParams(window.location.search).get('user')) || 501;
axiosClient.interceptors.request.use((config) => {
  config.headers['X-Fixture-User'] = String(fixtureId);
  return config;
});
const connectFixture = () => {
  const socket = getSocket(); socket.auth = { token: `fixture-${fixtureId}` }; socket.connect();
};
const mediaEvents = [];
let audioSequence = 0;
let simulateBlock = false;
window.Audio = function AudioWithDiagnostics(src) {
  const audio = new NativeAudio(src);
  const audioId = ++audioSequence;
  const nativePlay = audio.play.bind(audio);
  audio.play = () => simulateBlock
    ? Promise.reject(new DOMException('Autoplay bị chặn bởi fixture test', 'NotAllowedError'))
    : nativePlay();
  for (const event of ['playing', 'pause', 'error']) audio.addEventListener(event, () => {
    mediaEvents.push({ audioId, event, loop: audio.loop, time: Date.now(), code: audio.error?.code ?? null });
    if (mediaEvents.length > 35) mediaEvents.shift();
    window.dispatchEvent(new Event('fixture-media'));
  });
  return audio;
};

const alarm = getSosAlarmController();
function Panel({ togglePermission }) {
  const location = useLocation();
  const state = useSyncExternalStore(alarm.subscribe, alarm.getSnapshot, alarm.getSnapshot);
  const [media, setMedia] = useState([]);
  const [result, setResult] = useState('Chưa phát fixture.');
  useEffect(() => {
    const update = () => setMedia([...mediaEvents]);
    window.addEventListener('fixture-media', update);
    return () => window.removeEventListener('fixture-media', update);
  }, []);
  const trigger = async (action) => {
    const response = await fetch(`/__fixture/${action}`, { method: 'POST' });
    setResult(JSON.stringify(await response.json()));
  };
  return <section style={{ background: '#fff', borderRadius: 16, padding: 20, overflowWrap: 'anywhere' }}>
    <Alert type="info" title="KIỂM THỬ CÁCH LY — KHÔNG SOS / DỮ LIỆU THẬT"
      description="Các nút dưới đây chỉ gọi backend fixture lưu trong RAM. Không có kết nối SQL, gọi điện hay tài khoản thật." />
    <h2>SOS realtime acceptance fixture</h2>
    <Space wrap>
      <Button onClick={() => trigger('sos')}>Phát SOS fixture mới</Button>
      <Button onClick={() => trigger('replay')}>Phát lại cùng SOS</Button>
      <Button onClick={() => trigger('ordinary')}>Cảnh báo thường fixture</Button>
      <Button onClick={() => { getSocket().disconnect(); connectFixture(); }}>Reconnect socket</Button>
      <Button onClick={togglePermission}>Đổi quyền xem fixture</Button>
      <Button onClick={() => { simulateBlock = !simulateBlock; setResult(`Giả lập NotAllowedError: ${simulateBlock}`); }}>Đổi giả lập chặn autoplay</Button>
    </Space>
    <p>Trang thử khác: <a href="/__sos-preview?user=501">Admin</a> · <a href="/__sos-preview?user=502">Người chăm sóc</a> · <a href="/__sos-preview?user=503">Không có quyền</a></p>
    <p>Route đang mở: {location.pathname}{location.search}</p>
    <p>Trạng thái chuông: <code>{JSON.stringify(state)}</code></p>
    <p>Media thực: <code>{JSON.stringify(media)}</code></p>
    <p>Kết quả backend fixture: <code>{result}</code></p>
  </section>;
}
function Fixture() {
  const [id] = useState(fixtureId);
  const [allowed, setAllowed] = useState(id !== 503);
  const user = { userId: id, hoTen: `Tài khoản fixture ${id}`, tenVaiTro: id === 501 ? 'QuanTriVien' : 'NguoiChamSoc' };
  useEffect(() => {
    connectFixture();
    return () => disconnectSocket();
  }, [id]);
  const context = { user, permissions: [], permissionsLoading: false, authLoading: false,
    hasPermission: (feature) => allowed && feature === 'QLCANHBAO', logout() {}, setUserData() {} };
  const content = <Panel togglePermission={() => setAllowed((value) => !value)} />;
  return <AuthContext.Provider value={context}>
    <Routes><Route element={<MainLayout />}>
      <Route path="/canh-bao" element={<>{content}<AlertsPage /></>} />
      <Route path="*" element={content} />
    </Route></Routes>
  </AuthContext.Provider>;
}
createRoot(document.getElementById('root')).render(
  <ConfigProvider><App><BrowserRouter><Fixture /></BrowserRouter></App></ConfigProvider>,
);
