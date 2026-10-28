import React, { useCallback, useState } from 'react';
import { Button, DatePicker, Form, Input, InputNumber, Modal, Select, Tag } from 'antd';
import { Link, useOutletContext } from 'react-router-dom';
import { ArrowRightOutlined, CalendarOutlined, ClockCircleOutlined, HeartOutlined, MessageOutlined, PlusOutlined, SafetyOutlined, UserOutlined } from '@ant-design/icons';
import api from '../../services/elderlyCareService';
import { useAuth } from '../../context/AuthContext';
import { useElderlyMutation, useElderlyResource } from '../../hooks/useElderlyResource';
import { latestMetrics, newestFirst, ownDay } from '../../utils/elderlyCare';
import { formatAlertTime, vietnamAlertParts } from '../../utils/alertTime';
import { Caregivers, CareSection, DoseProgress, MetricCard, MetricTrend, MutationNotice, PageIntro, Refresh, ResourceState } from './ElderlyCareUi';

export function ElderlyHomePage() {
  const { profile } = useOutletContext(), day = ownDay();
  const metrics = useElderlyResource(useCallback(signal => api.metrics(profile.id, {}, signal), [profile.id]), `home-health:${profile.id}`);
  const meds = useElderlyResource(useCallback(signal => api.medications(profile.id, day, signal), [profile.id, day]), `home-meds:${profile.id}:${day}`);
  const visits = useElderlyResource(useCallback(signal => api.appointments(profile.id, true, signal), [profile.id]), `home-visits:${profile.id}`);
  const caregivers = useElderlyResource(useCallback(signal => api.caregivers(signal), []), `home-care:${profile.id}`);
  const refresh = () => [metrics, meds, visits, caregivers].forEach(resource => resource.refresh());
  const statuses = { DangTheoDoi: 'Đang theo dõi', CanChamSocDacBiet: 'Cần chăm sóc đặc biệt', NgungTheoDoi: 'Ngừng theo dõi' };
  // Presentation only: keep the server's status and ordering; no new due/missed rule.
  const featuredDose = meds.data?.find(row => row.trangThai === 'ChuaDenGio');
  const featuredTime = vietnamAlertParts(featuredDose?.thoiGianDuKien);
  return <div className="elderly-home-dashboard">
    <PageIntro className="elderly-home-intro" title={<>Xin chào, <span>{profile.hoTen}</span></>}
      eyebrow="KHÔNG GIAN SỨC KHỎE CỦA BẠN"
      description={<>Hôm nay, {new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'full' }).format(new Date())}</>}
      action={<><Link className="elderly-home-measure-link" to="/ca-nhan/suc-khoe"><PlusOutlined aria-hidden="true" /> Thêm số đo</Link><Refresh onClick={refresh} loading={[metrics, meds, visits, caregivers].some(row => row.loading)} /></>}>
      <div className="elderly-home-profile-status"><SafetyOutlined aria-hidden="true" /><span>Hồ sơ: {statuses[profile.trangThai] || profile.trangThai || 'Chưa cập nhật trạng thái'}</span></div>
    </PageIntro>
    <section className="elderly-home-spotlight" aria-label="Lịch uống thuốc hôm nay">
      <div className="elderly-home-spotlight-heading"><h2>Lịch uống thuốc hôm nay</h2><Link to="/ca-nhan/lich-trinh?tab=thuoc">Xem lịch thuốc <ArrowRightOutlined aria-hidden="true" /></Link></div>
      <ResourceState resource={meds} empty="Hôm nay chưa có lịch uống thuốc">
        <div className="elderly-home-spotlight-body">
          <div className="elderly-home-featured-dose">
            {featuredDose ? <><span className="elderly-home-spotlight-caption">Liều chưa xác nhận</span><div className="elderly-home-featured-summary">
              {featuredTime && <time>{featuredTime.time}</time>}<div><h3>{featuredDose.tenThuoc}</h3><p>{featuredDose.lieuDung}</p><span>{formatAlertTime(featuredDose.thoiGianDuKien)}</span></div>
            </div></> : <><h3>Lịch thuốc trong ngày của bạn</h3><p>Xem trạng thái từng liều trong phần chi tiết hoặc mở lịch thuốc.</p></>}
            <Link className="elderly-home-dose-link" to="/ca-nhan/lich-trinh?tab=thuoc">Mở lịch thuốc <ArrowRightOutlined aria-hidden="true" /></Link>
          </div>
          <DoseProgress rows={meds.data || []} variant="spotlight" />
        </div>
      </ResourceState>
    </section>
    {!meds.loading && !meds.error && Boolean(meds.data?.length) && <details className="elderly-home-dose-details">
      <summary>Chi tiết các liều trong ngày <span>{meds.data.length} liều</span></summary>
      <div className="elderly-care-list">{meds.data.map(row => <article key={row.id} className="elderly-care-row elderly-home-dose"><strong>{row.tenThuoc}</strong><span><ClockCircleOutlined aria-hidden="true" /> {formatAlertTime(row.thoiGianDuKien)} · {row.lieuDung}</span><Tag color={row.trangThai === 'DaUong' ? 'green' : row.trangThai === 'BoLo' ? 'red' : 'default'}>{({ DaUong: 'Đã uống', BoLo: 'Bỏ lỡ', ChuaDenGio: 'Chưa xác nhận', TuChoi: 'Từ chối' })[row.trangThai] || row.trangThai}</Tag></article>)}</div>
    </details>}
    <div className="elderly-home-health">
      <CareSection title="Chỉ số sức khỏe gần nhất" action={<Link to="/ca-nhan/suc-khoe">Xem lịch sử</Link>}>
        <p className="elderly-home-section-note">Số đo gần nhất của từng chỉ số. Mở lịch sử để xem các lần đo trước.</p>
        <ResourceState resource={metrics}><div className="elderly-care-grid elderly-home-metrics">{latestMetrics(metrics.data || []).map(row => <MetricCard key={row.loaiChiSoId} row={row} />)}</div></ResourceState>
      </CareSection>
    </div>
    <div className="elderly-home-lower">
      <div className="elderly-home-visits"><CareSection title="Lịch khám sắp tới" action={<Link to="/ca-nhan/lich-trinh?tab=kham">Xem lịch khám</Link>}>
        <ResourceState resource={visits} empty="Chưa có lịch khám sắp tới"><div className="elderly-care-list">{visits.data?.map(row => <article className="elderly-care-row elderly-home-visit" key={row.id}><span className="elderly-ui-icon" aria-hidden="true"><CalendarOutlined /></span><strong>{row.tenBenhVien || 'Lịch khám'}</strong><time>{formatAlertTime(row.thoiGianKham)}</time><span>{[row.chuyenKhoa, row.bacSiPhuTrach].filter(Boolean).join(' · ')}</span></article>)}</div></ResourceState>
      </CareSection></div>
      <section className="elderly-home-assistant" aria-label="Trợ lý CareSenior"><MessageOutlined aria-hidden="true" /><h2>Có điều muốn hỏi?</h2><p>Trợ lý CareSenior hỗ trợ về sức khỏe và cách sử dụng ứng dụng.</p><Link to="/ca-nhan/tro-ly">Trò chuyện với AI <ArrowRightOutlined aria-hidden="true" /></Link></section>
    </div>
    <section className="elderly-home-sos" aria-label="Hỗ trợ khẩn cấp"><SafetyOutlined aria-hidden="true" /><div><h2>Cần hỗ trợ khẩn cấp?</h2><p>Mở SOS, sau đó nhấn giữ 3 giây.</p></div><Link to="/ca-nhan/sos">Mở SOS <ArrowRightOutlined aria-hidden="true" /></Link></section>
    <Caregivers resource={caregivers} />
    <section className="elderly-home-quicklinks" aria-label="Truy cập nhanh"><h2>Truy cập nhanh</h2><div className="elderly-web-shortcuts elderly-care-shortcuts">{[
      ['/ca-nhan/suc-khoe', HeartOutlined, 'Sức khỏe', 'Xem và thêm số đo'], ['/ca-nhan/lich-trinh', CalendarOutlined, 'Lịch trình', 'Thuốc và lịch khám'],
      ['/ca-nhan/sos', SafetyOutlined, 'SOS', 'Nhấn giữ để yêu cầu hỗ trợ'], ['/ca-nhan/ho-so', UserOutlined, 'Hồ sơ', 'Thông tin của bạn'],
    ].map(([to, Icon, title, detail]) => <Link key={to} to={to}><span className="elderly-shortcut-icon"><Icon aria-hidden="true" /></span><span className="elderly-shortcut-copy"><strong>{title}</strong><span>{detail}</span></span><ArrowRightOutlined aria-hidden="true" /></Link>)}</div></section>
    <p className="elderly-care-muted elderly-data-note"><SafetyOutlined aria-hidden="true" /> Web và Mobile dùng chung dữ liệu. Chọn Tải lại dữ liệu để xem các cập nhật từ thiết bị khác.</p>
  </div>;
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
    <PageIntro title="Theo dõi sức khỏe" description="Hiểu rõ hơn sức khỏe của bạn, qua từng lần đo. Thời gian hiển thị theo giờ Việt Nam." action={<Refresh onClick={() => { types.refresh(); measurements.refresh(); }} loading={types.loading || measurements.loading} />} />
    <MutationNotice mutation={mutation} />
    <CareSection title="Loại chỉ số">
      <ResourceState resource={types} empty="Chưa có danh mục chỉ số"><div className="elderly-care-filters">
        <label>Chọn chỉ số<Select aria-label="Chọn chỉ số sức khỏe" value={selectedId} onChange={value => { setTypeId(value); mutation.clearNotice(); }} options={types.data?.map(row => ({ value: row.id, label: row.tenChiSo }))} /></label>
        <label>Khoảng ngày đo<DatePicker.RangePicker aria-label="Khoảng ngày đo" placeholder={['Từ ngày', 'Đến ngày']} value={range} onChange={setRange} format="DD/MM/YYYY" /></label>
        {hasPermission('QLCHISOSK', 'them') && selected && <Button type="primary" icon={<PlusOutlined />} onClick={() => { mutation.clearNotice(); setAdding(selected); }}>Thêm số đo</Button>}
      </div></ResourceState>
    </CareSection>
    {!types.loading && !types.error && selected && <>
      <div className="elderly-health-overview"><CareSection title="Số đo gần nhất trong khoảng đã chọn"><ResourceState resource={measurements} isEmpty={!rows.length}><MetricCard row={rows[0]} title={selected.tenChiSo} unit={selected.donVi} /></ResourceState></CareSection>
      <CareSection title="Xu hướng sức khỏe"><ResourceState resource={measurements} isEmpty={!rows.length}><MetricTrend rows={rows} unit={selected.donVi} /></ResourceState></CareSection>
      </div><CareSection title="Lịch sử đo"><ResourceState resource={measurements} isEmpty={!rows.length}><div className="elderly-care-list elderly-measurement-history">{rows.map(row => <article key={row.id} className="elderly-care-row"><MetricCard row={row} compact />{row.ghiChu && <p>{row.ghiChu}</p>}</article>)}</div></ResourceState></CareSection>
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
