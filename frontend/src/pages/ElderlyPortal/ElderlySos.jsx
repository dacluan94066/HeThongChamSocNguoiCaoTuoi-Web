import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Alert, Button, Checkbox, Modal, Tag } from 'antd';
import { EnvironmentOutlined } from '@ant-design/icons';
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useElderlyResource } from '../../hooks/useElderlyResource';
import { formatAlertTime } from '../../utils/alertTime';
import { statusLabel } from '../../utils/elderlySafety';
import { CareSection, Refresh, ResourceState } from './ElderlyCareUi';

export function ElderlySosPage() {
  const { profile, safetyApi, sosController: controller } = useOutletContext(), { hasPermission } = useAuth();
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [acknowledged, setAcknowledged] = useState(false), [detailId, setDetailId] = useState(null);
  const canRead = hasPermission('QLCANHBAO', 'xem'), canSend = hasPermission('QLCANHBAO', 'them');
  const history = useElderlyResource(useCallback(signal => canRead ? safetyApi.sosHistory(signal) : Promise.resolve([]), [safetyApi, canRead]), `sos-history:${profile.id}`);
  const detail = history.data?.find(row => row.id === detailId);
  useEffect(() => {
    const cancel = () => controller.cancel();
    const visibility = () => { if (document.visibilityState === 'hidden') cancel(); };
    window.addEventListener('blur', cancel); window.addEventListener('pagehide', cancel);
    document.addEventListener('visibilitychange', visibility);
    return () => { cancel(); window.removeEventListener('blur', cancel); window.removeEventListener('pagehide', cancel); document.removeEventListener('visibilitychange', visibility); };
  }, [controller]);
  useEffect(() => {
    let permission, active = true;
    const changed = () => { if (permission?.state === 'denied') controller.clearLocation('Quyền vị trí đã bị từ chối hoặc thu hồi. SOS vẫn gửi được không kèm tọa độ.'); };
    navigator.permissions?.query({ name: 'geolocation' }).then(result => {
      if (!active) return;
      permission = result; changed(); permission.addEventListener('change', changed);
    }).catch(() => {});
    return () => { active = false; permission?.removeEventListener('change', changed); };
  }, [controller]);
  const blocked = !canSend || !['idle', 'holding'].includes(state.phase);
  const reset = () => { if (controller.reset()) setAcknowledged(false); };
  const count = state.result?.soNguoiChamSocDaThongBao ?? state.result?.soNguoiChamSocNhan;
  return <>
    <div className="elderly-web-welcome"><h1>Hỗ trợ khẩn cấp SOS</h1><p>Gửi yêu cầu hỗ trợ đến hệ thống CareSenior. Không tự gọi điện.</p></div>
    <section className="elderly-web-card elderly-sos-panel" aria-label="Gửi SOS">
      <h2>Khi cần trợ giúp, nhấn giữ SOS</h2>
      <p>Giữ liên tục đủ 3 giây. Nhả sớm, rời nút, mất focus hoặc rời màn sẽ hủy thao tác giữ.</p>
      {!canSend && <Alert type="warning" title="Tài khoản chưa có quyền gửi SOS. Vui lòng liên hệ quản trị viên." />}
      <div className="elderly-sos-ring" style={{ '--hold-progress': `${state.progress * 360}deg` }}>
        <button type="button" className="elderly-sos-button" aria-label="Nhấn giữ SOS 3 giây" disabled={blocked}
          onPointerDown={event => {
            if (event.button !== 0 || event.isPrimary === false) return;
            event.currentTarget.focus();
            if (controller.start(`pointer:${event.pointerId}`)) { try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Synthetic/unsupported capture; release/blur still cancel. */ } }
          }}
          onPointerUp={event => controller.release(`pointer:${event.pointerId}`)} onPointerCancel={() => controller.cancel()} onLostPointerCapture={() => controller.cancel()}
          onPointerLeave={() => controller.cancel()} onPointerMove={event => {
            const r = event.currentTarget.getBoundingClientRect();
            if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) controller.cancel();
          }}
          onBlur={() => controller.cancel()} onContextMenu={event => event.preventDefault()}
          onKeyDown={event => {
            if (event.key === 'Escape') controller.cancel();
            if ([' ', 'Enter'].includes(event.key)) { event.preventDefault(); if (!event.repeat) controller.start(`key:${event.key}`); }
          }} onKeyUp={event => { if ([' ', 'Enter'].includes(event.key)) { event.preventDefault(); controller.release(`key:${event.key}`); } }}
          onClick={event => event.preventDefault()}>
          <strong>SOS</strong><span>{state.phase === 'holding' ? `Giữ thêm ${(3 * (1 - state.progress)).toFixed(1)} giây` : state.phase === 'sending' ? 'Đang gửi…' : 'Nhấn giữ 3 giây'}</span>
        </button>
      </div>
      <div role="progressbar" aria-label="Thời gian giữ SOS" aria-valuemin={0} aria-valuemax={3} aria-valuenow={Number((state.progress * 3).toFixed(1))} />
      {state.phase === 'holding' && <Button onClick={() => controller.cancel()}>Hủy thao tác giữ</Button>}
      <div className="elderly-sos-result" aria-live="polite">
        {state.phase === 'sending' && <Alert type="info" showIcon title="Đang gửi SOS — chờ máy chủ xác nhận" description="Không gửi lại hoặc làm mới trang trong lúc chờ. Việc mất kết nối không có nghĩa máy chủ chưa nhận được yêu cầu." />}
        {state.phase === 'confirmed' && <Alert type="success" showIcon title="Máy chủ đã xác nhận ghi nhận SOS" description={<>
          <p>Mã SOS: {state.result.id} · {formatAlertTime(state.result.ngayGui)}</p>
          <p>{state.result.trungLap ? 'Máy chủ nhận diện yêu cầu trùng và trả lại SOS đã ghi nhận gần đây.' : 'Yêu cầu đã được lưu tại hệ thống.'}</p>
          <p>{count == null ? 'Chưa xác định số người chăm sóc đã được tạo thông báo.' : count === 0 ? 'Chưa có tài khoản người chăm sóc nhận thông báo. Hãy chủ động liên hệ người hỗ trợ nếu cần.' : `Đã tạo thông báo cho ${count} người chăm sóc. Điều này không đồng nghĩa người nhận đã xem hoặc đã đến hỗ trợ.`}</p>
        </>} />}
        {state.error && <Alert type={state.phase === 'uncertain' ? 'warning' : state.phase === 'error' ? 'error' : 'info'} showIcon title={state.phase === 'uncertain' ? 'Chưa xác định kết quả' : state.phase === 'error' ? 'Chưa gửi được SOS' : 'Đã dừng thao tác giữ'} description={state.error} />}
      </div>
      {state.phase === 'uncertain' && <div className="elderly-sos-review">
        <Button onClick={async () => { await controller.reviewHistory(); history.refresh(); }}>Kiểm tra lịch sử trước khi gửi lại</Button>
        {state.reviewed && <Checkbox checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)}>Tôi đã xem lịch sử và vẫn cần chuẩn bị một yêu cầu mới.</Checkbox>}
        <Button disabled={!state.reviewed || !acknowledged} onClick={reset}>Chuẩn bị thao tác SOS mới</Button>
      </div>}
      {['confirmed', 'error'].includes(state.phase) && <Button onClick={reset}>Chuẩn bị thao tác SOS mới</Button>}
    </section>
    <CareSection title="Vị trí khi gửi SOS">
      <p>Chỉ lấy vị trí khi bạn đồng ý bằng nút bên dưới. Không cấp quyền vẫn gửi SOS được.</p>
      <p role="status">{state.locationNote}</p>
      {state.location && <p>Vị trí đã được trình duyệt cấp: {state.location.latitude.toFixed(6)}, {state.location.longitude.toFixed(6)}</p>}
      <div className="elderly-care-actions"><Button icon={<EnvironmentOutlined />} disabled={['holding', 'sending'].includes(state.phase)} loading={state.locationPhase === 'loading'} onClick={() => controller.locate(navigator.geolocation)}>Lấy vị trí cho SOS</Button>
        <Button disabled={['holding', 'sending'].includes(state.phase)} onClick={() => controller.clearLocation()}>Không chia sẻ vị trí</Button></div>
    </CareSection>
    <CareSection title="Lịch sử SOS của tôi" action={<Refresh onClick={history.refresh} loading={history.loading} />}>
      {!canRead ? <Alert type="warning" title="Tài khoản chưa có quyền xem lịch sử SOS." /> : <ResourceState resource={history} empty="Chưa có SOS nào được ghi nhận">
        <div className="elderly-care-list">{history.data?.map(row => <article className="elderly-care-row elderly-sos-history" key={row.id}>
          <div className="elderly-care-title"><h3>SOS #{row.id}</h3><Tag color="red">{statusLabel(row.trangThai)}</Tag></div>
          <time>{formatAlertTime(row.ngayGui || row.thoiGianPhatHien)}</time><p>{row.noiDung || row.moTa || 'Yêu cầu hỗ trợ khẩn cấp'}</p>
          <Button onClick={() => setDetailId(row.id)}>Xem chi tiết SOS</Button>
        </article>)}</div>
      </ResourceState>}
    </CareSection>
    <Modal className="elderly-care-modal" title="Chi tiết SOS của tôi" open={Boolean(detail)} onCancel={() => setDetailId(null)} footer={<Button onClick={() => setDetailId(null)}>Đóng</Button>}>
      {detail && <dl className="elderly-care-details">{[['Mã SOS', detail.id], ['Thời gian gửi', formatAlertTime(detail.ngayGui || detail.thoiGianPhatHien)], ['Trạng thái', statusLabel(detail.trangThai)], ['Thời gian cập nhật xử lý', formatAlertTime(detail.ngayXuLy)], ['Nội dung', detail.noiDung || detail.moTa], ['Vị trí đã gửi', detail.viDo != null && detail.kinhDo != null ? `${detail.viDo}, ${detail.kinhDo}` : 'Không kèm vị trí']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Chưa có dữ liệu'}</dd></div>)}</dl>}
    </Modal>
  </>;
}
