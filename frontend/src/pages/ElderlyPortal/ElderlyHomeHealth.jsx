import React, { useCallback, useState } from 'react';
import { Button, DatePicker, Form, Input, InputNumber, Modal, Select, Tag } from 'antd';
import { Link, useOutletContext } from 'react-router-dom';
import { CalendarOutlined, HeartOutlined, SafetyOutlined, UserOutlined } from '@ant-design/icons';
import api from '../../services/elderlyCareService';
import { useAuth } from '../../context/AuthContext';
import { useElderlyMutation, useElderlyResource } from '../../hooks/useElderlyResource';
import { latestMetrics, newestFirst, ownDay } from '../../utils/elderlyCare';
import { formatAlertTime } from '../../utils/alertTime';
import { Caregivers, CareSection, DoseProgress, MetricCard, MetricTrend, MutationNotice, Refresh, ResourceState } from './ElderlyCareUi';

export function ElderlyHomePage() {
  const { profile } = useOutletContext(), day = ownDay();
  const metrics = useElderlyResource(useCallback(signal => api.metrics(profile.id, {}, signal), [profile.id]), `home-health:${profile.id}`);
  const meds = useElderlyResource(useCallback(signal => api.medications(profile.id, day, signal), [profile.id, day]), `home-meds:${profile.id}:${day}`);
  const visits = useElderlyResource(useCallback(signal => api.appointments(profile.id, true, signal), [profile.id]), `home-visits:${profile.id}`);
  const caregivers = useElderlyResource(useCallback(signal => api.caregivers(signal), []), `home-care:${profile.id}`);
  const refresh = () => [metrics, meds, visits, caregivers].forEach(resource => resource.refresh());
  const statuses = { DangTheoDoi: 'Đang theo dõi', CanChamSocDacBiet: 'Cần chăm sóc đặc biệt', NgungTheoDoi: 'Ngừng theo dõi' };
  return <>
    <section className="elderly-web-welcome"><div className="elderly-care-title"><span className="elderly-web-eyebrow">Sức khỏe của bạn, mỗi ngày</span><Refresh onClick={refresh} loading={[metrics, meds, visits, caregivers].some(row => row.loading)} /></div>
      <h1>Xin chào, {profile.hoTen}</h1><p>Hôm nay, {new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'full' }).format(new Date())}</p>
      <p>Hồ sơ: {statuses[profile.trangThai] || profile.trangThai || 'Chưa cập nhật trạng thái'}</p>
    </section>
    <div className="elderly-web-shortcuts elderly-care-shortcuts">{[
      ['/ca-nhan/suc-khoe', HeartOutlined, 'Sức khỏe', 'Xem và thêm số đo'], ['/ca-nhan/lich-trinh', CalendarOutlined, 'Lịch trình', 'Thuốc và lịch khám'],
      ['/ca-nhan/sos', SafetyOutlined, 'SOS', 'Nhấn giữ để yêu cầu hỗ trợ'], ['/ca-nhan/ho-so', UserOutlined, 'Hồ sơ', 'Thông tin của bạn'],
    ].map(([to, Icon, title, detail]) => <Link key={to} to={to}><Icon /><strong>{title}</strong><span>{detail}</span></Link>)}</div>
    <CareSection title="Chỉ số sức khỏe gần nhất" action={<Link to="/ca-nhan/suc-khoe">Xem lịch sử</Link>}>
      <ResourceState resource={metrics}><div className="elderly-care-grid">{latestMetrics(metrics.data || []).map(row => <MetricCard key={row.loaiChiSoId} row={row} />)}</div></ResourceState>
    </CareSection>
    <div className="elderly-care-columns">
      <CareSection title="Lịch uống thuốc hôm nay" action={<Link to="/ca-nhan/lich-trinh?tab=thuoc">Xem lịch thuốc</Link>}>
        <ResourceState resource={meds} empty="Hôm nay chưa có lịch uống thuốc"><DoseProgress rows={meds.data || []} />
          <div className="elderly-care-list">{meds.data?.map(row => <article key={row.id} className="elderly-care-row"><strong>{row.tenThuoc}</strong><span>{formatAlertTime(row.thoiGianDuKien)} · {row.lieuDung}</span><Tag color={row.trangThai === 'DaUong' ? 'green' : row.trangThai === 'BoLo' ? 'red' : 'default'}>{({ DaUong: 'Đã uống', BoLo: 'Bỏ lỡ', ChuaDenGio: 'Chưa xác nhận', TuChoi: 'Từ chối' })[row.trangThai] || row.trangThai}</Tag></article>)}</div>
        </ResourceState>
      </CareSection>
      <CareSection title="Lịch khám sắp tới" action={<Link to="/ca-nhan/lich-trinh?tab=kham">Xem lịch khám</Link>}>
        <ResourceState resource={visits} empty="Chưa có lịch khám sắp tới"><div className="elderly-care-list">{visits.data?.map(row => <article className="elderly-care-row" key={row.id}><strong>{row.tenBenhVien || 'Lịch khám'}</strong><time>{formatAlertTime(row.thoiGianKham)}</time><span>{[row.chuyenKhoa, row.bacSiPhuTrach].filter(Boolean).join(' · ')}</span></article>)}</div></ResourceState>
      </CareSection>
    </div>
    <Caregivers resource={caregivers} />
    <p className="elderly-care-muted">Web và Mobile dùng chung dữ liệu. Chọn Tải lại dữ liệu để xem các cập nhật từ thiết bị khác.</p>
  </>;
}

export function ElderlyHealthPage() {
  const { profile } = useOutletContext(), { hasPermission } = useAuth();
  const [typeId, setTypeId] = useState(null), [range, setRange] = useState(null), [adding, setAdding] = useState(null);
  const [form] = Form.useForm(), mutation = useElderlyMutation();
  const types = useElderlyResource(useCallback(signal => api.types(signal), []), `types:${profile.id}`);
  const from = range?.[0]?.format('YYYY-MM-DD'), to = range?.[1]?.format('YYYY-MM-DD');
  const selected = types.data?.find(row => Number(row.id) === Number(typeId)) || types.data?.[0];
  const selectedId = selected?.id;
  const measurements = useElderlyResource(useCallback(signal => selectedId ? api.metrics(profile.id, { loaiChiSoId: selectedId, tuNgay: from, denNgay: to }, signal) : Promise.resolve([]), [profile.id, selectedId, from, to]), `health:${profile.id}:${selectedId}:${from}:${to}`);
  const rows = newestFirst((measurements.data || []).filter(row => Number(row.loaiChiSoId) === Number(selectedId)), 'thoiGianDo');
  // An open form keeps its catalog selection while reconnect/foreground reloads
  // the list. The server still validates the submitted type and values.
  const formType = adding || selected;
  const secondary = formType?.giaTriMin2 != null || formType?.giaTriMax2 != null || formType?.tenChiSo === 'Huyết áp';
  const close = () => { if (!mutation.busy) { setAdding(null); form.resetFields(); } };
  return <>
    <div className="elderly-web-welcome"><div className="elderly-care-title"><h1>Theo dõi sức khỏe</h1><Refresh onClick={() => { types.refresh(); measurements.refresh(); }} loading={types.loading || measurements.loading} /></div><p>Số đo và lịch sử của chính bạn · Giờ Việt Nam</p></div>
    <MutationNotice mutation={mutation} />
    <CareSection title="Loại chỉ số">
      <ResourceState resource={types} empty="Chưa có danh mục chỉ số"><div className="elderly-care-filters">
        <label>Chọn chỉ số<Select aria-label="Chọn chỉ số sức khỏe" value={selectedId} onChange={value => { setTypeId(value); mutation.clearNotice(); }} options={types.data?.map(row => ({ value: row.id, label: row.tenChiSo }))} /></label>
        <label>Khoảng ngày đo<DatePicker.RangePicker aria-label="Khoảng ngày đo" placeholder={['Từ ngày', 'Đến ngày']} value={range} onChange={setRange} format="DD/MM/YYYY" /></label>
        {hasPermission('QLCHISOSK', 'them') && selected && <Button type="primary" onClick={() => { mutation.clearNotice(); setAdding(selected); }}>Thêm số đo</Button>}
      </div></ResourceState>
    </CareSection>
    {!types.loading && !types.error && selected && <>
      <CareSection title="Số đo gần nhất trong khoảng đã chọn"><ResourceState resource={measurements} isEmpty={!rows.length}><MetricCard row={rows[0]} title={selected.tenChiSo} unit={selected.donVi} /></ResourceState></CareSection>
      <CareSection title="Xu hướng sức khỏe"><ResourceState resource={measurements} isEmpty={!rows.length}><MetricTrend rows={rows} unit={selected.donVi} /></ResourceState></CareSection>
      <CareSection title="Lịch sử đo"><ResourceState resource={measurements} isEmpty={!rows.length}><div className="elderly-care-list">{rows.map(row => <article key={row.id} className="elderly-care-row"><MetricCard row={row} />{row.ghiChu && <p>{row.ghiChu}</p>}</article>)}</div></ResourceState></CareSection>
    </>}
    <Modal className="elderly-care-modal" title={`Thêm số đo ${formType?.tenChiSo || ''}`} open={Boolean(adding)} onCancel={close} footer={null} maskClosable={!mutation.busy} closable={!mutation.busy}>
      <p>Số đo được ghi nhận tại thời điểm hiện tại theo máy chủ. Đơn vị: {formType?.donVi}. Không tự thay đổi thuốc theo số đo.</p>
      <MutationNotice mutation={mutation} />
      <Form form={form} name="elderly-metric" layout="vertical" disabled={mutation.busy} onFinish={values => adding && mutation.run(signal => api.addMetric({ ...values, loaiChiSoId: adding.id }, signal), () => { setAdding(null); form.resetFields(); measurements.refresh(); })}>
        <Form.Item name="giaTri" label={secondary ? 'Huyết áp tâm thu' : `Giá trị (${formType?.donVi || ''})`} rules={[{ required: true, message: 'Vui lòng nhập giá trị đo' }, { type: 'number', message: 'Giá trị phải là số hợp lệ' }]}><InputNumber aria-label="Giá trị đo" style={{ width: '100%' }} /></Form.Item>
        {secondary && <Form.Item name="giaTriPhu" label="Huyết áp tâm trương" rules={[{ required: true, message: 'Vui lòng nhập tâm trương' }, { type: 'number', message: 'Giá trị phải là số hợp lệ' }]}><InputNumber aria-label="Huyết áp tâm trương" style={{ width: '100%' }} /></Form.Item>}
        <Form.Item name="ghiChu" label="Ghi chú" rules={[{ max: 300, message: 'Ghi chú tối đa 300 ký tự' }]}><Input.TextArea maxLength={300} autoSize={{ minRows: 2, maxRows: 5 }} /></Form.Item>
        <div className="elderly-care-actions"><Button onClick={close}>Hủy</Button><Button type="primary" htmlType="submit" loading={mutation.busy}>Lưu số đo</Button></div>
      </Form>
    </Modal>
  </>;
}
