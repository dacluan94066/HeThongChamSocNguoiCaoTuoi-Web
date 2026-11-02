import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Alert, Button, Checkbox, Modal, Table, Tag } from 'antd';
import { ClockCircleOutlined, EnvironmentOutlined, EyeOutlined, SafetyOutlined } from '@ant-design/icons';
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useElderlyResource } from '../../hooks/useElderlyResource';
import { formatAlertTime } from '../../utils/alertTime';
import { statusLabel } from '../../utils/elderlySafety';
import { CareSection, PageIntro, Refresh, ResourceState } from './ElderlyCareUi';

function renderSosStatusTag(status) {
  const label = statusLabel(status);
  if (['CHUA_XU_LY', 'ChuaXuLy', 'DangGui'].includes(status)) {
    return <Tag color="error">{label}</Tag>;
  }
  if (['DaTiepNhan', 'DA_XEM', 'DaXem'].includes(status)) {
    return <Tag color="warning">{label}</Tag>;
  }
  if (['DA_XU_LY', 'DaXuLy'].includes(status)) {
    return <Tag color="success">{label}</Tag>;
  }
  return <Tag>{label}</Tag>;
}

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

  const totalCount = history.data?.length || 0;
  const pendingCount = history.data?.filter(row => ['CHUA_XU_LY', 'ChuaXuLy', 'DangGui'].includes(row.trangThai)).length || 0;
  const processingCount = history.data?.filter(row => ['DaTiepNhan', 'DA_XEM', 'DaXem'].includes(row.trangThai)).length || 0;
  const resolvedCount = history.data?.filter(row => ['DA_XU_LY', 'DaXuLy'].includes(row.trangThai)).length || 0;

  const columns = useMemo(() => [
    {
      title: 'Mã SOS',
      dataIndex: 'id',
      key: 'id',
      width: 100,
      render: id => (
        <Tag color="#B4233F" style={{ fontWeight: 700, borderRadius: 6, margin: 0 }}>
          #{id}
        </Tag>
      ),
    },
    {
      title: 'Thời gian gửi',
      key: 'thoiGian',
      width: 170,
      render: (_, row) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--cs-ink)' }}>
          <ClockCircleOutlined style={{ color: 'var(--cs-muted)' }} />
          {formatAlertTime(row.ngayGui || row.thoiGianPhatHien)}
        </span>
      ),
    },
    {
      title: 'Nội dung',
      key: 'noiDung',
      render: (_, row) => (
        <span style={{ fontWeight: 500, color: 'var(--cs-ink)' }}>
          {row.noiDung || row.moTa || 'Cảnh báo SOS khẩn cấp'}
        </span>
      ),
    },
    {
      title: 'Vị trí GPS',
      key: 'viTri',
      width: 170,
      render: (_, row) => {
        if (row.viDo != null && row.kinhDo != null) {
          return (
            <a
              href={`https://www.google.com/maps?q=${row.viDo},${row.kinhDo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="elderly-sos-location-link"
              title="Mở tọa độ trên Google Maps"
            >
              <EnvironmentOutlined /> {Number(row.viDo).toFixed(4)}, {Number(row.kinhDo).toFixed(4)}
            </a>
          );
        }
        return <span className="elderly-sos-no-location">Không kèm vị trí</span>;
      },
    },
    {
      title: 'Trạng thái',
      dataIndex: 'trangThai',
      key: 'trangThai',
      width: 130,
      render: renderSosStatusTag,
    },
    {
      title: 'Thao tác',
      key: 'thaoTac',
      width: 110,
      align: 'center',
      render: (_, row) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => setDetailId(row.id)}
          style={{ borderRadius: 6 }}
        >
          Chi tiết
        </Button>
      ),
    },
  ], []);

  return <>
    <PageIntro title="Hỗ trợ khẩn cấp SOS" icon={<SafetyOutlined />} eyebrow="KHI BẠN CẦN ĐƯỢC TRỢ GIÚP" description="Gửi yêu cầu hỗ trợ đến hệ thống CareSenior. Không tự gọi điện." className="elderly-sos-intro" />
    <div className="elderly-sos-workspace">
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
      <div className="elderly-location-icon" aria-hidden="true"><EnvironmentOutlined /></div>
      <p>Chỉ lấy vị trí khi bạn đồng ý bằng nút bên dưới. Không cấp quyền vẫn gửi SOS được.</p>
      <p role="status">{state.locationNote}</p>
      {state.location && <p>Vị trí đã được trình duyệt cấp: {state.location.latitude.toFixed(6)}, {state.location.longitude.toFixed(6)}</p>}
      <div className="elderly-care-actions"><Button icon={<EnvironmentOutlined />} disabled={['holding', 'sending'].includes(state.phase)} loading={state.locationPhase === 'loading'} onClick={() => controller.locate(navigator.geolocation)}>Lấy vị trí cho SOS</Button>
        <Button disabled={['holding', 'sending'].includes(state.phase)} onClick={() => controller.clearLocation()}>Không chia sẻ vị trí</Button></div>
    </CareSection>
    </div>
    <CareSection title="Lịch sử SOS của tôi" action={<Refresh onClick={history.refresh} loading={history.loading} />}>
      {!canRead ? <Alert type="warning" title="Tài khoản chưa có quyền xem lịch sử SOS." /> : <ResourceState resource={history} empty="Chưa có SOS nào được ghi nhận">
        {totalCount > 0 && <>
          <div className="elderly-sos-stats-bar">
            <div className="elderly-sos-stat-pill">
              <span className="elderly-sos-stat-label">Tổng số SOS</span>
              <strong className="elderly-sos-stat-val">{totalCount}</strong>
            </div>
            <div className="elderly-sos-stat-pill is-pending">
              <span className="elderly-sos-stat-label">Chưa xử lý</span>
              <strong className="elderly-sos-stat-val">{pendingCount}</strong>
            </div>
            <div className="elderly-sos-stat-pill is-processing">
              <span className="elderly-sos-stat-label">Đang tiếp nhận</span>
              <strong className="elderly-sos-stat-val">{processingCount}</strong>
            </div>
            <div className="elderly-sos-stat-pill is-resolved">
              <span className="elderly-sos-stat-label">Đã xử lý xong</span>
              <strong className="elderly-sos-stat-val">{resolvedCount}</strong>
            </div>
          </div>
          <div className="elderly-sos-table-wrapper">
            <Table
              rowKey="id"
              dataSource={history.data}
              columns={columns}
              size="middle"
              scroll={{ x: 750 }}
              pagination={{
                pageSize: 5,
                showSizeChanger: true,
                pageSizeOptions: ['5', '10', '20'],
                size: 'small',
                showTotal: (total, range) => `${range[0]}-${range[1]} của ${total} SOS`,
              }}
            />
          </div>
        </>}
      </ResourceState>}
    </CareSection>
    <Modal
      className="elderly-care-modal"
      title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><SafetyOutlined style={{ color: 'var(--cs-danger)' }} /> Chi tiết yêu cầu SOS</span>}
      open={Boolean(detail)}
      onCancel={() => setDetailId(null)}
      footer={[
        detail?.viDo != null && detail?.kinhDo != null && (
          <Button
            key="maps"
            type="primary"
            icon={<EnvironmentOutlined />}
            href={`https://www.google.com/maps?q=${detail.viDo},${detail.kinhDo}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Mở trên Google Maps
          </Button>
        ),
        <Button key="close" onClick={() => setDetailId(null)}>Đóng</Button>,
      ]}
    >
      {detail && <dl className="elderly-care-details">{[
        ['Mã SOS', <Tag color="#B4233F" style={{ fontWeight: 700, margin: 0 }}>#{detail.id}</Tag>],
        ['Thời gian gửi', formatAlertTime(detail.ngayGui || detail.thoiGianPhatHien)],
        ['Trạng thái', renderSosStatusTag(detail.trangThai)],
        ['Thời gian cập nhật xử lý', formatAlertTime(detail.ngayXuLy) || 'Chưa cập nhật'],
        ['Nội dung', detail.noiDung || detail.moTa || 'Yêu cầu hỗ trợ khẩn cấp'],
        ['Vị trí đã gửi', detail.viDo != null && detail.kinhDo != null ? (
          <a
            href={`https://www.google.com/maps?q=${detail.viDo},${detail.kinhDo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="elderly-sos-location-link"
          >
            <EnvironmentOutlined /> {detail.viDo}, {detail.kinhDo}
          </a>
        ) : 'Không kèm vị trí'],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Chưa có dữ liệu'}</dd></div>)}</dl>}
    </Modal>
  </>;
}
