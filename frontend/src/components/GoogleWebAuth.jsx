import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Input } from 'antd';
import { GoogleOutlined, ReloadOutlined } from '@ant-design/icons';
import { googleWebApi as api, mountGoogleWebButton, completeGoogleLogin } from '../services/googleWebService';
import { webSession } from '../utils/webSession';
import './GoogleWebAuth.css';

export default function GoogleWebAuth({ mode = 'login', onAuthenticated, disabled = false, onBusyChange }) {
  const [state, setState] = useState({ phase: 'loading' }), [password, setPassword] = useState('');
  const alive = useRef(false), attempt = useRef(null), button = useRef(null), generation = useRef(0);
  const busy = state.phase === 'preparing' || state.phase === 'verifying';
  const stop = () => {
    generation.current++;
    if (attempt.current) attempt.current.password = '';
    attempt.current?.controller.abort(); attempt.current?.cleanup?.(); clearTimeout(attempt.current?.timer); attempt.current = null;
  };
  useEffect(() => {
    alive.current = true; const controller = new AbortController(), stamp = webSession.capture();
    Promise.all([api.config(controller.signal), mode === 'link' ? api.status(controller.signal) : Promise.resolve({ linked: false })])
      .then(([, result]) => { if (alive.current && webSession.isCurrent(stamp)) setState({ phase: result.linked ? 'linked' : 'idle' }); })
      .catch(error => { if (alive.current && !controller.signal.aborted && webSession.isCurrent(stamp)) setState({ phase: 'unavailable', message: error.response?.data?.message || error.message }); });
    const off = webSession.subscribe(() => { stop(); if (alive.current) { setPassword(''); setState({ phase: 'expired', message: 'Phiên tài khoản đã thay đổi. Vui lòng tải lại hoặc đăng nhập lại.' }); } });
    return () => { alive.current = false; controller.abort(); off(); stop(); };
  }, [mode]);
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  const prepare = async () => {
    if (disabled || busy || attempt.current || (mode === 'link' && !password)) return;
    const stamp = webSession.capture(), controller = new AbortController(), sequence = ++generation.current;
    const valid = () => alive.current && sequence === generation.current && webSession.isCurrent(stamp) && !controller.signal.aborted;
    const pending = { controller, stamp, password: mode === 'link' ? password : '' }; attempt.current = pending;
    setPassword(''); setState({ phase: 'preparing' });
    try {
      const challenge = await api.challenge(mode, controller.signal, stamp);
      if (!valid()) return;
      pending.timer = setTimeout(() => { if (valid()) {
        const message = mode === 'link' && pending.submitted ? 'Chưa xác định kết quả liên kết. Hãy kiểm tra trạng thái trước khi thử lại.' : 'Phiên chọn Google đã hết hạn. Hãy bắt đầu lại.';
        stop(); setPassword(''); setState({ phase: 'idle', message });
      } }, Math.max(0, Date.parse(challenge.expiresAt) - Date.now()));
      pending.cleanup = await mountGoogleWebButton(button.current, challenge, async credential => {
        if (!valid() || pending.submitted) return; pending.submitted = true;
        setState({ phase: 'verifying' });
        try {
          const request = mode === 'login' ? api.login(challenge, credential, controller.signal, stamp)
            : api.link(challenge, credential, pending.password, controller.signal, stamp);
          pending.password = '';
          const result = await request;
          if (!valid()) return;
          if (mode === 'login') { completeGoogleLogin(result, stamp); await onAuthenticated?.(result.user); }
          else { stop(); setPassword(''); setState({ phase: 'linked' }); }
        } catch (error) {
          if (!valid()) return;
          stop(); setPassword('');
          setState({ phase: 'idle', error: true, message: mode === 'link' && (!error.response || error.response.status >= 500)
            ? 'Chưa xác định kết quả liên kết. Web không tự gửi lại. Hãy kiểm tra trạng thái liên kết trước khi thử lại.'
            : error.response?.data?.message || error.message || 'Chưa xác thực được Google. Bạn có thể dùng mật khẩu.' });
        }
      }, valid, controller.signal);
      if (valid()) setState({ phase: 'ready' }); else pending.cleanup?.();
    } catch (error) {
      if (valid()) { stop(); setPassword(''); setState({ phase: 'idle', error: true, message: error.response?.data?.message || error.message }); }
    }
  };
  const refresh = async () => {
    stop(); setPassword(''); const stamp = webSession.capture(), controller = new AbortController(); attempt.current = { controller };
    setState({ phase: 'preparing' });
    try {
      const result = await api.status(controller.signal);
      if (alive.current && !controller.signal.aborted && webSession.isCurrent(stamp)) { stop(); setState({ phase: result.linked ? 'linked' : 'idle', message: result.linked ? '' : 'Tài khoản chưa liên kết Google.' }); }
    } catch (error) {
      if (alive.current && !controller.signal.aborted && webSession.isCurrent(stamp)) { stop(); setState({ phase: 'idle', error: true, message: error.response?.data?.message || 'Chưa tải được trạng thái liên kết.' }); }
    }
  };
  return <section className="google-web-auth" aria-label={mode === 'link' ? 'Liên kết Google' : 'Đăng nhập Google cho Người cao tuổi'}>
    <h3><GoogleOutlined aria-hidden="true" /> {mode === 'link' ? 'Liên kết Google' : 'Google dành cho Người cao tuổi'}</h3>
    {state.phase === 'loading' ? <p role="status">Đang kiểm tra Google Web…</p> : state.phase === 'linked' ? <Alert type="success" showIcon title="Đã liên kết Google" description="Bạn có thể dùng cùng tài khoản CareSenior trên Web và Mobile. Không cần tạo tài khoản mới." /> : <>
      {mode === 'link' && <><p>Nhập mật khẩu CareSenior hiện tại và chọn Google bạn sở hữu. Máy chủ xác minh cả hai trước khi liên kết; không tự ghép email hoặc thay thế liên kết đã có.</p>
        <label htmlFor="google-current-password">Mật khẩu CareSenior hiện tại</label><Input.Password id="google-current-password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" disabled={busy || state.phase === 'ready'} /></>}
      {state.message && <Alert type={state.error ? 'error' : 'info'} showIcon title={state.message} role={state.error ? 'alert' : 'status'} />}
      {['preparing', 'verifying'].includes(state.phase) && <p role="status">{state.phase === 'preparing' ? 'Đang chuẩn bị phiên Google…' : 'Đang xác minh với máy chủ…'}</p>}
      {state.phase === 'ready' && <p>Chọn tài khoản Google bằng nút bên dưới để tiếp tục.</p>}
      <div ref={button} className="google-web-provider-button" hidden={!['ready', 'verifying'].includes(state.phase)} />
      {!['unavailable', 'expired', 'ready', 'verifying'].includes(state.phase) && <Button icon={<GoogleOutlined />} onClick={prepare} disabled={disabled || busy || (mode === 'link' && !password)} loading={busy}>{mode === 'link' ? 'Chọn Google để liên kết' : 'Tiếp tục với Google'}</Button>}
      {['ready', 'preparing', 'verifying'].includes(state.phase) && <Button onClick={() => { stop(); setPassword(''); setState({ phase: 'idle', message: 'Đã dừng chờ. Nếu yêu cầu đã được gửi, hãy kiểm tra trạng thái trước khi thử lại.' }); }}>Hủy chờ Google</Button>}
      {mode === 'link' && <Button icon={<ReloadOutlined />} onClick={refresh} disabled={busy}>Kiểm tra trạng thái liên kết</Button>}
      {mode === 'login' && <p className="google-web-note">Google chưa liên kết? Đăng nhập bằng mật khẩu, mở Hồ sơ → Liên kết Google để hoàn tất xác minh.</p>}
    </>}
  </section>;
}
