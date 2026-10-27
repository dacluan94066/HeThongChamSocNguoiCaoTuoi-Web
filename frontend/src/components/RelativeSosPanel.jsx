import React from 'react';
import { Alert, Button, Descriptions, Modal, Skeleton, Space, Tag } from 'antd';
import { formatSosTime } from '../utils/sosAlarm';
import SosAudioControls from './SosAudioControls';

export default function RelativeSosPanel({ sos }) {
  const { state, sound, manager, allowed } = sos;
  if (!allowed) return null;
  return <section aria-label="SOS realtime của Người thân">
    <SosAudioControls readOnly state={sound} onEnable={manager.enable} onDisable={manager.disable} onSilence={manager.silence} />
    <div style={{ display: 'grid', gap: 12, marginBottom: state.alerts.length || state.error ? 20 : 0 }}>
      {state.error && <Alert type="warning" showIcon title={state.error} />}
      {state.alerts.map(alert => <Alert key={alert.id} type={['DaXuLy', 'DA_XU_LY'].includes(alert.status) ? 'info' : 'error'} showIcon
        title={`SOS khẩn cấp — ${alert.name}`} description={<Space wrap><span>{formatSosTime(alert.time)}</span><Tag>{alert.statusLabel}</Tag><span>Chỉ xem</span></Space>}
        action={<Space wrap><Button onClick={() => manager.openDetail(alert.id)}>Xem chi tiết SOS</Button><Button onClick={manager.silence}>Tắt chuông</Button></Space>} />)}
    </div>
    <Modal title="Chi tiết SOS được chia sẻ" open={Boolean(state.detailTarget)} onCancel={manager.closeDetail}
      footer={<Space wrap><Button onClick={manager.silence}>Tắt chuông</Button><Button onClick={manager.closeDetail}>Đóng</Button></Space>}>
      {state.checking ? <Skeleton active /> : state.detail && <Descriptions column={1} items={[
        { key: 'name', label: 'Người cao tuổi', children: state.detail.name },
        { key: 'time', label: 'Thời gian gửi', children: formatSosTime(state.detail.time) },
        { key: 'level', label: 'Mức độ', children: 'Khẩn cấp' },
        { key: 'status', label: 'Trạng thái', children: state.detail.statusLabel },
        { key: 'content', label: 'Nội dung', children: 'Người cao tuổi đã gửi SOS.' },
      ]} />}
    </Modal>
  </section>;
}
