import React, { useCallback, useState } from 'react';
import { Alert, Button, Checkbox, Form, Input, Modal, Select, Tabs, Tag } from 'antd';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { CheckOutlined, MedicineBoxOutlined } from '@ant-design/icons';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/elderlyCareService';
import { useElderlyMutation, useElderlyResource } from '../../hooks/useElderlyResource';
import { canRecordPastDose, dayOf, inDays, instant, ownDay } from '../../utils/elderlyCare';
import { formatAlertTime } from '../../utils/alertTime';
import { DoseProgress, MutationNotice, Refresh, ResourceState } from './ElderlyCareUi';

const doseLabels = { ChuaDenGio: 'Chưa xác nhận uống', DaUong: 'Đã uống', BoLo: 'Bỏ lỡ', TuChoi: 'Từ chối' };
const visitLabels = { ChuaDen: 'Chưa đến', DaKham: 'Đã khám', DaHuy: 'Đã hủy', KhongDen: 'Không đến' };
export function ElderlySchedulePage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'kham' ? 'kham' : 'thuoc';
  return <><div className="elderly-web-welcome"><h1>Lịch trình của tôi</h1><p>Lịch thuốc và lịch khám cùng dữ liệu với Mobile.</p></div>
    <section className="elderly-web-card"><Tabs activeKey={tab} onChange={key => setParams(previous => { previous.set('tab', key); return previous; })} items={[
      { key: 'thuoc', label: 'Lịch thuốc', children: <MedicationPage /> },
      { key: 'kham', label: 'Lịch khám', children: <AppointmentPage /> },
    ]} /></section></>;
}

function MedicationPage() {
  const { profile } = useOutletContext(), { hasPermission } = useAuth();
  const [day, setDay] = useState(ownDay), [dialog, setDialog] = useState(null), [form] = Form.useForm();
  const mutation = useElderlyMutation();
  const doses = useElderlyResource(useCallback(signal => api.medications(profile.id, day, signal), [profile.id, day]), `doses:${profile.id}:${day}`);
  const rows = (doses.data || []).filter(row => dayOf(row.thoiGianDuKien) === day);
  const canWrite = hasPermission('QLLICHUONGTHUOC', 'sua');
  const showDialog = (row, kind) => { form.resetFields(); mutation.clearNotice(); setDialog({ row, kind }); };
  const close = () => { if (!mutation.busy) setDialog(null); };
  const submit = values => mutation.run(signal => dialog.kind === 'supplement'
    ? api.supplementDose(dialog.row.id, { thoiGianThucTe: `${values.takenAt}:00+07:00`, lyDo: values.lyDo?.trim() }, signal)
    : api.confirmDose(dialog.row.id, dialog.kind === 'missed' ? 'BoLo' : 'DaUong', signal), () => { setDialog(null); form.resetFields(); doses.refresh(); });
  return <>
    <div className="elderly-care-title"><h2>Lịch uống thuốc</h2><Refresh onClick={doses.refresh} loading={doses.loading} /></div>
    <div className="elderly-care-filters"><label>Ngày uống thuốc<Input type="date" aria-label="Ngày uống thuốc" value={day} onChange={event => { if (event.target.value) { setDay(event.target.value); mutation.clearNotice(); } }} /></label><Button onClick={() => setDay(ownDay())}>Hôm nay</Button></div>
    <MutationNotice mutation={mutation} />
    <ResourceState resource={doses} isEmpty={!rows.length} empty="Không có lịch uống thuốc trong ngày đã chọn">
      <DoseProgress rows={rows} />
      <div className="elderly-care-list">{rows.map(row => <article className={`elderly-care-dose dose-${row.trangThai}`} key={row.id}>
        <div className="elderly-care-title"><MedicineBoxOutlined aria-hidden="true" /><h3>{row.tenThuoc}</h3><Tag color={row.trangThai === 'DaUong' ? 'green' : row.trangThai === 'BoLo' || row.trangThai === 'TuChoi' ? 'red' : 'orange'}>{doseLabels[row.trangThai] || row.trangThai}</Tag></div>
        <p><strong>Liều dùng:</strong> {row.lieuDung || 'Chưa có dữ liệu'}</p><p><strong>Giờ uống:</strong> {formatAlertTime(row.thoiGianDuKien)}</p>
        {row.cachDung && <p><strong>Hướng dẫn:</strong> {row.cachDung}</p>}{row.ghiChu && <p>{row.ghiChu}</p>}
        {row.thoiGianThucTe && <p>Đã ghi nhận uống: {formatAlertTime(row.thoiGianThucTe)}</p>}
        {row.ghiNhanBoSung && <Tag>Đã ghi nhận bổ sung</Tag>}
        {canWrite && <div className="elderly-care-actions">
          {day === ownDay() && ['ChuaDenGio', 'BoLo'].includes(row.trangThai) && <Button type="primary" icon={<CheckOutlined />} disabled={mutation.busy} onClick={() => showDialog(row, 'confirm')}>{row.trangThai === 'BoLo' ? 'Xác nhận đã uống muộn' : 'Xác nhận đã uống'}</Button>}
          {day === ownDay() && row.trangThai === 'ChuaDenGio' && <Button danger disabled={mutation.busy} onClick={() => showDialog(row, 'missed')}>Bỏ lỡ</Button>}
          {canRecordPastDose(row) && <Button disabled={mutation.busy} onClick={() => showDialog(row, 'supplement')}>Ghi nhận đã uống ngày cũ</Button>}
        </div>}
      </article>)}</div>
    </ResourceState>
    <p className="elderly-care-muted">Chỉ xác nhận trực tiếp liều hôm nay. Liều ngày cũ đủ điều kiện có thể ghi nhận bổ sung trong 48 giờ kể từ giờ dự kiến. Máy chủ kiểm tra lại quyền và thời hạn.</p>
    <Modal className="elderly-care-modal" open={Boolean(dialog)} title={dialog?.kind === 'supplement' ? 'Ghi nhận bổ sung liều đã uống' : dialog?.kind === 'missed' ? 'Ghi nhận bỏ lỡ' : 'Xác nhận đã uống'} onCancel={close} footer={null} closable={!mutation.busy} maskClosable={!mutation.busy}>
      <p><strong>{dialog?.row.tenThuoc}</strong> · {formatAlertTime(dialog?.row.thoiGianDuKien)}</p>
      <Alert type="warning" showIcon title="Chỉ ghi nhận việc đã xảy ra" description="Đây không phải hướng dẫn uống bù. Không tự uống thêm hoặc gấp đôi liều; hỏi bác sĩ/dược sĩ nếu chưa rõ cách xử trí." />
      <MutationNotice mutation={mutation} />
      <Form form={form} name="elderly-dose" layout="vertical" onFinish={submit} disabled={mutation.busy}>
        {dialog?.kind === 'supplement' && <>
          <Form.Item name="takenAt" label="Thời điểm đã uống (giờ Việt Nam)" rules={[{ required: true, message: 'Chọn thời điểm thực tế đã uống' }]}><Input type="datetime-local" min={`${dayOf(dialog.row.thoiGianDuKien)}T00:00`} max={new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).slice(0, 16).replace(' ', 'T')} /></Form.Item>
          <Form.Item name="lyDo" label="Lý do ghi nhận bổ sung" rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập lý do' }, { min: 5, max: 300, message: 'Lý do cần từ 5 đến 300 ký tự' }]}><Input.TextArea maxLength={300} autoSize={{ minRows: 2, maxRows: 5 }} /></Form.Item>
        </>}
        <Form.Item name="acknowledged" valuePropName="checked" rules={[{ validator: (_, value) => value ? Promise.resolve() : Promise.reject(Error('Vui lòng xác nhận thông tin')) }]}><Checkbox>Tôi xác nhận thông tin trên đúng với thực tế.</Checkbox></Form.Item>
        <div className="elderly-care-actions"><Button onClick={close}>Hủy</Button><Button type="primary" htmlType="submit" loading={mutation.busy}>Gửi xác nhận</Button></div>
        {mutation.notice?.type === 'error' && <Button onClick={() => { setDialog(null); doses.refresh(); }}>Tải lại trạng thái liều</Button>}
      </Form>
    </Modal>
  </>;
}

function AppointmentPage() {
  const { profile } = useOutletContext();
  const [status, setStatus] = useState('all'), [period, setPeriod] = useState('all'), [from, setFrom] = useState(''), [to, setTo] = useState(''), [detailId, setDetailId] = useState(null);
  const visits = useElderlyResource(useCallback(signal => api.appointments(profile.id, false, signal), [profile.id]), `visits:${profile.id}`);
  const now = new Date().getTime();
  const invalidRange = Boolean(from && to && from > to);
  const rows = (visits.data || []).filter(row => !invalidRange && (status === 'all' || row.trangThai === status) && inDays(row.thoiGianKham, from, to)
    && (period === 'all' || (period === 'upcoming' ? instant(row.thoiGianKham) >= now && row.trangThai === 'ChuaDen' : instant(row.thoiGianKham) < now || row.trangThai === 'DaKham')));
  const detail = visits.data?.find(row => row.id === detailId);
  return <>
    <div className="elderly-care-title"><h2>Lịch khám bệnh</h2><Refresh onClick={visits.refresh} loading={visits.loading} /></div>
    <div className="elderly-care-filters">
      <label>Khoảng thời gian<Select aria-label="Khoảng thời gian khám" value={period} onChange={setPeriod} options={[{ value: 'all', label: 'Tất cả lịch khám' }, { value: 'upcoming', label: 'Sắp tới' }, { value: 'history', label: 'Lịch sử khám' }]} /></label>
      <label>Trạng thái<Select aria-label="Trạng thái khám" value={status} onChange={setStatus} options={[{ value: 'all', label: 'Tất cả trạng thái' }, ...[...new Set((visits.data || []).map(row => row.trangThai))].map(value => ({ value, label: visitLabels[value] || value }))]} /></label>
      <label>Từ ngày<Input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label><label>Đến ngày<Input type="date" value={to} onChange={event => setTo(event.target.value)} /></label>
    </div>
    {invalidRange && <Alert type="warning" title="Ngày bắt đầu không được sau ngày kết thúc" />}
    <ResourceState resource={visits} isEmpty={!rows.length} empty="Không có lịch khám phù hợp">
      <div className="elderly-care-list">{rows.map(row => <article className="elderly-care-row" key={row.id}>
        <div className="elderly-care-title"><h3>{row.tenBenhVien || 'Lịch khám'}</h3><Tag>{visitLabels[row.trangThai] || row.trangThai}</Tag></div>
        <time>{formatAlertTime(row.thoiGianKham)}</time><span>{[row.chuyenKhoa, row.bacSiPhuTrach].filter(Boolean).join(' · ')}</span>
        <Button onClick={() => setDetailId(row.id)}>Xem chi tiết lịch khám</Button>
      </article>)}</div>
    </ResourceState>
    <Modal className="elderly-care-modal" title="Chi tiết lịch khám" open={Boolean(detail)} onCancel={() => setDetailId(null)} footer={<Button onClick={() => setDetailId(null)}>Đóng</Button>}>
      {detail && <dl className="elderly-care-details">{[['Nơi khám', detail.tenBenhVien], ['Thời gian', formatAlertTime(detail.thoiGianKham)], ['Bác sĩ', detail.bacSiPhuTrach], ['Chuyên khoa', detail.chuyenKhoa], ['Trạng thái', visitLabels[detail.trangThai] || detail.trangThai], ['Lý do khám', detail.lyDoKham], ['Kết quả khám', detail.ketQuaKham]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Chưa có dữ liệu'}</dd></div>)}</dl>}
    </Modal>
  </>;
}
