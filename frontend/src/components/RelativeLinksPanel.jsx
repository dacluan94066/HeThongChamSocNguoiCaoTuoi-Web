import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, App, Button, Checkbox, Col, DatePicker, Descriptions, Empty, Form, Input, Modal, Row, Select, Space, Spin, Tag } from 'antd';
import { EyeOutlined, HistoryOutlined, LinkOutlined, PlusOutlined, ReloadOutlined, StopOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useAuth } from '../context/AuthContext';
import { getUsers } from '../services/userService';
import { getElders } from '../services/elderlyService';
import { getRelativeLinks, grantRelativeLink, updateRelativeLink, revokeRelativeLink, getRelativeLinkHistory } from '../services/relativeService';
import { buildRelativeGrant, buildRelativeUpdate, buildRelativeRevoke, canViewRelativeAdmin, formatRelativeTimeVN,
  hasActiveRelativeLink, isActiveAccount, isFamilyAccount, relativeErrorInfo, relativeHistoryChanges, vietnamWallTime } from '../utils/relativeAdmin';
import ModalForm, { FormSection } from './ModalForm';
import '../pages/Relatives/RelativeAdmin.css';

const PAGE_SIZE = 100;
const SCOPE_LABELS = { benhNen: 'Bệnh nền', diUng: 'Dị ứng', ketQuaKham: 'Kết quả khám' };
const ACTIONS = { CAP: 'Cấp quyền theo dõi', CAP_NHAT: 'Cập nhật liên kết', THU_HOI: 'Thu hồi quyền' };
export const RelativeUnavailable = ({ error, onRetry }) => {
  const info = relativeErrorInfo(error);
  return <Alert type={info.notReady ? 'info' : 'error'} showIcon title={info.notReady ? 'Chức năng Người thân chưa sẵn sàng' : 'Không thể tải dữ liệu Người thân'}
    description={info.notReady ? 'Cơ sở dữ liệu chưa được cài đặt chức năng này. Các chức năng quản lý hiện có vẫn sử dụng bình thường.' : info.message}
    action={onRetry && <Button icon={<ReloadOutlined />} onClick={onRetry}>Thử lại</Button>} />;
};
const ScopeTags = ({ scope }) => <Space wrap>{Object.entries(SCOPE_LABELS).map(([key, label]) => (
  <Tag key={key} color={scope?.[key] ? 'green' : 'default'}>{label}: {scope?.[key] ? 'Cho phép' : 'Không chia sẻ'}</Tag>
))}</Space>;

// The same panel serves an elderly profile and a relative account. No second linking workflow.
const RelativeLinksPanel = ({ elderly, relative }) => {
  const { user, hasPermission } = useAuth();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const allowed = canViewRelativeAdmin(user, hasPermission);
  const canCreate = allowed && hasPermission('QLNGUOIDUNG', 'them');
  const canEdit = allowed && hasPermission('QLNGUOIDUNG', 'sua');
  const [links, setLinks] = useState([]), [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(null);
  const [hasMore, setHasMore] = useState(false), [search, setSearch] = useState(''), [status, setStatus] = useState('active');
  const [accounts, setAccounts] = useState([]), [elders, setElders] = useState([]), [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(null), [catalogRevision, setCatalogRevision] = useState(0);
  const [editor, setEditor] = useState(null), [revokeTarget, setRevokeTarget] = useState(null), [detail, setDetail] = useState(null);
  const [saving, setSaving] = useState(false), [formError, setFormError] = useState(null), [conflict, setConflict] = useState(false);
  const [historyTarget, setHistoryTarget] = useState(null), [history, setHistory] = useState([]), [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null), [historyMore, setHistoryMore] = useState(false), [actors, setActors] = useState({});
  const [form] = Form.useForm(), [revokeForm] = Form.useForm();
  const loadSequence = useRef(0), historySequence = useRef(0);
  const elderlyId = elderly?.id, relativeId = relative?.id;
  const load = useCallback(async (offset = 0) => {
    if (!allowed || (!elderlyId && !relativeId)) return;
    const sequence = ++loadSequence.current;
    setLoading(true); setLoadError(null);
    try {
      const rows = await getRelativeLinks({ nguoiCaoTuoiId: elderlyId, nguoiThanUserId: relativeId,
        includeRevoked: true, limit: PAGE_SIZE, offset });
      if (sequence !== loadSequence.current) return;
      setLinks(previous => offset ? [...previous, ...rows] : rows); setHasMore(rows.length === PAGE_SIZE);
    } catch (error) {
      if (sequence === loadSequence.current) { setLinks([]); setLoadError(error); setHasMore(false); }
    } finally { if (sequence === loadSequence.current) setLoading(false); }
  }, [allowed, elderlyId, relativeId]);
  const cancelPending = useCallback(() => { loadSequence.current++; historySequence.current++; }, []);
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => { if (active) void load(); });
    return () => { active = false; cancelPending(); };
  }, [load, cancelPending]);
  useEffect(() => {
    if (!allowed) return;
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return null;
      setCatalogLoading(true); setCatalogError(null);
      return Promise.all([relativeId ? Promise.resolve([relative]) : getUsers({ vaiTro: 'NGUOI_THAN' }),
        elderlyId ? Promise.resolve([elderly]) : getElders()]);
    })
      .then(result => { if (active && result) { const [people, profiles] = result; setAccounts(people.filter(isFamilyAccount)); setElders(profiles); } })
      .catch(error => { if (active) setCatalogError(error); })
      .finally(() => { if (active) setCatalogLoading(false); });
    return () => { active = false; };
  }, [allowed, elderlyId, relativeId, elderly, relative, catalogRevision]);
  const names = useMemo(() => ({ users: new Map(accounts.map(account => [Number(account.id), account])),
    elderly: new Map(elders.map(profile => [Number(profile.id), profile])) }), [accounts, elders]);
  const personName = link => names.users.get(Number(link.nguoiThanUserId))?.hoTen || `Tài khoản #${link.nguoiThanUserId}`;
  const profileName = link => names.elderly.get(Number(link.nguoiCaoTuoiId))?.hoTen || `NCT #${link.nguoiCaoTuoiId}`;
  const visible = links.filter(link => (status === 'all' || Boolean(link.thuHoiLuc) === (status === 'revoked'))
    && (!search.trim() || [personName(link), profileName(link), link.moiQuanHe]
      .some(value => String(value).toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi')))));
  const openEditor = record => {
    setFormError(null); setConflict(false);
    const initial = record ? { moiQuanHe: record.moiQuanHe, nguoiDongY: record.nguoiDongY, tuCachDongY: record.tuCachDongY,
      thoiDiemDongY: dayjs(vietnamWallTime(record.thoiDiemDongY)), canCuDongY: record.canCuDongY,
      phamViChiaSe: { ...record.phamViChiaSe }, dongYChiaSe: false }
      : { nguoiCaoTuoiId: elderlyId, nguoiThanUserId: relativeId, dongYChiaSe: false,
        phamViChiaSe: { benhNen: false, diUng: false, ketQuaKham: false } };
    setEditor({ record, initial });
  };
  const closeEditor = () => { if (!saving) { setEditor(null); setFormError(null); setConflict(false); form.resetFields(); } };
  const save = async values => {
    if (saving || conflict || !allowed || (editor?.record ? !canEdit : !canCreate)) return;
    setSaving(true); setFormError(null);
    try {
      if (editor?.record) await updateRelativeLink(editor.record.id, buildRelativeUpdate(values, editor.record));
      else {
        const payload = buildRelativeGrant({ ...values, nguoiCaoTuoiId: elderlyId || values.nguoiCaoTuoiId,
          nguoiThanUserId: relativeId || values.nguoiThanUserId });
        // Exact pair preflight also covers active links beyond the currently displayed page.
        const existing = await getRelativeLinks({ nguoiCaoTuoiId: payload.nguoiCaoTuoiId, nguoiThanUserId: payload.nguoiThanUserId, limit: 1 });
        if (hasActiveRelativeLink(existing, payload.nguoiCaoTuoiId, payload.nguoiThanUserId)) {
          const error = new Error('Liên kết đang hoạt động đã tồn tại.');
          error.response = { status: 409, data: { errorCode: 'LINK_CONFLICT' } }; throw error;
        }
        await grantRelativeLink(payload);
      }
      message.success(editor?.record ? 'Đã cập nhật liên kết và lưu lịch sử.' : 'Đã cấp quyền theo dõi theo sự đồng ý đã ghi nhận.');
      setEditor(null); form.resetFields(); await load();
    } catch (error) {
      const info = relativeErrorInfo(error); setFormError(info.message); setConflict(info.conflict);
      if (error.field) form.setFields([{ name: error.field, errors: [error.message] }]);
      if (info.conflict) await load();
    } finally { setSaving(false); }
  };
  const openRevoke = record => { setFormError(null); setConflict(false); setRevokeTarget(record); };
  const revoke = async values => {
    if (!canEdit || !revokeTarget || saving || conflict) return;
    setSaving(true); setFormError(null);
    try {
      await revokeRelativeLink(revokeTarget.id, buildRelativeRevoke(values, revokeTarget));
      message.success('Đã thu hồi quyền theo dõi. Lịch sử liên kết được giữ lại.'); setRevokeTarget(null); await load();
    } catch (error) {
      const info = relativeErrorInfo(error); setFormError(info.message); setConflict(info.conflict);
      if (error.field) revokeForm.setFields([{ name: error.field, errors: [error.message] }]);
      if (info.conflict) await load();
    } finally { setSaving(false); }
  };
  const openHistory = async (record, offset = 0) => {
    const sequence = ++historySequence.current;
    setHistoryTarget(record); setHistoryLoading(true); setHistoryError(null); if (!offset) setHistory([]);
    const [records, people] = await Promise.allSettled([
      getRelativeLinkHistory(record.id, { limit: 50, offset }), getUsers({ vaiTro: 'QUAN_TRI' }),
    ]);
    if (sequence !== historySequence.current) return;
    if (records.status === 'fulfilled') {
      setHistory(previous => offset ? [...previous, ...records.value] : records.value); setHistoryMore(records.value.length === 50);
    } else setHistoryError(records.reason);
    setActors(Object.fromEntries((people.status === 'fulfilled' ? people.value : [user]).map(person => [person.id || person.userId, person.hoTen])));
    setHistoryLoading(false);
  };
  if (!allowed) return null;
  return <section className="relative-links-panel" aria-label="Quản lý liên kết Người thân">
    <header className="relative-section-heading"><div><span className="relative-eyebrow">Chia sẻ có sự đồng ý</span>
      <h3>{elderly ? 'Người thân được phép theo dõi' : 'Người cao tuổi được phép theo dõi'}</h3>
      <p>{elderly?.hoTen || relative?.hoTen} · Quyền xem được kiểm soát theo từng liên kết.</p></div>
      <Space wrap><Button aria-label="Tải lại liên kết" icon={<ReloadOutlined />} loading={loading} onClick={() => load()}>Tải lại</Button>
        {canCreate && <Button type="primary" icon={<PlusOutlined />} disabled={Boolean(loadError) || catalogLoading || Boolean(catalogError)
          || Boolean(relative && !isActiveAccount(relative))} onClick={() => openEditor(null)}>Thêm liên kết</Button>}</Space></header>
    {loadError ? <RelativeUnavailable error={loadError} onRetry={() => load()} /> : <>
      {catalogError && <Alert type="warning" showIcon title="Chưa tải được danh mục tài khoản hoặc NCT"
        action={<Button onClick={() => setCatalogRevision(value => value + 1)}>Tải lại danh mục</Button>} />}
      {relative && !isActiveAccount(relative) && <Alert type="warning" showIcon title="Tài khoản chưa hoạt động"
        description="Bạn có thể xem lịch sử; chỉ cấp liên kết mới khi tài khoản đang hoạt động." />}
      <div className="relative-link-filters"><Input aria-label="Tìm liên kết" allowClear placeholder="Tìm tên hoặc mối quan hệ" value={search} onChange={event => setSearch(event.target.value)} />
        <Select aria-label="Trạng thái liên kết" value={status} onChange={setStatus} options={[
          { value: 'active', label: 'Đang hoạt động' }, { value: 'revoked', label: 'Đã thu hồi' }, { value: 'all', label: 'Tất cả liên kết' }]} /></div>
      <Spin spinning={loading || catalogLoading}>
        <div className="relative-links-list">
          {!visible.length ? <Empty description={loading ? 'Đang tải liên kết...' : 'Chưa có liên kết phù hợp'} /> : visible.map(link => (
            <article className={`relative-link-card ${link.thuHoiLuc ? 'is-revoked' : ''}`} key={link.id}>
              <div className="relative-link-title"><div><strong>{elderly ? personName(link) : profileName(link)}</strong><span>{link.moiQuanHe}</span></div>
                <Tag color={link.thuHoiLuc ? 'default' : 'green'}>{link.thuHoiLuc ? 'Đã thu hồi' : 'Đang hoạt động'}</Tag></div>
              <ScopeTags scope={link.phamViChiaSe} /><p className="relative-muted">Cấp ngày {formatRelativeTimeVN(link.taoLuc)}</p>
              <Space wrap className="relative-link-actions"><Button icon={<EyeOutlined />} onClick={() => setDetail(link)}>Chi tiết</Button>
                <Button icon={<HistoryOutlined />} onClick={() => openHistory(link)}>Lịch sử</Button>
                {!elderly && hasPermission('QLHOSONCT', 'xem') && <Button onClick={() => navigate(`/ho-so-nguoi-cao-tuoi?view=${link.nguoiCaoTuoiId}`)}>Mở hồ sơ NCT</Button>}
                {canEdit && !link.thuHoiLuc && <><Button onClick={() => openEditor(link)}>Cập nhật</Button>
                  <Button danger icon={<StopOutlined />} onClick={() => openRevoke(link)}>Thu hồi</Button></>}</Space>
            </article>
          ))}
        </div>
      </Spin>
      <div className="relative-list-footer"><span>Đã tải {links.length} liên kết</span>{hasMore && <Button loading={loading} onClick={() => load(links.length)}>Tải thêm liên kết</Button>}</div>
    </>}
    <ModalForm title={editor?.record ? 'Cập nhật liên kết Người thân' : 'Thêm liên kết Người thân'}
      subtitle="Chỉ cấp quyền sau khi đã xác minh sự đồng ý chia sẻ dữ liệu" icon={<LinkOutlined />}
      open={Boolean(editor)} onCancel={closeEditor} onFinish={save} form={form} loading={saving} width={760}
      afterOpenChange={open => { if (open && editor) { form.resetFields(); form.setFieldsValue(editor.initial); } }}
      className="app-form-modal relative-consent-modal" footer={<Space wrap className="relative-modal-actions">
        <Button disabled={saving} onClick={closeEditor}>Hủy</Button><Button type="primary" loading={saving} disabled={conflict}
          onClick={() => form.submit()}>{editor?.record ? 'Lưu cập nhật' : 'Cấp quyền theo dõi'}</Button></Space>}>
      {formError && <Alert type="error" showIcon title={formError} description={conflict ? 'Nội dung đang nhập được giữ lại. Đóng biểu mẫu để chọn lại liên kết với phiên bản mới.' : undefined} />}
      <FormSection title="Liên kết hồ sơ">
        {editor?.record ? <p>{personName(editor.record)} → {profileName(editor.record)}. Hồ sơ và tài khoản của liên kết được giữ nguyên.</p> : <Row gutter={16}>
          <Col xs={24} md={12}><Form.Item name="nguoiThanUserId" label="Tài khoản Người thân" rules={[{ required: true, message: 'Vui lòng chọn tài khoản Người thân' }]}>
            <Select showSearch optionFilterProp="label" placeholder="Chọn tài khoản" disabled={Boolean(relativeId)} options={accounts.filter(isActiveAccount).map(account => ({
              value: account.id, label: `${account.hoTen} · ${account.username}`,
              disabled: Boolean(elderlyId && hasActiveRelativeLink(links, elderlyId, account.id)),
            }))} /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="nguoiCaoTuoiId" label="Người cao tuổi" rules={[{ required: true, message: 'Vui lòng chọn NCT' }]}>
            <Select showSearch optionFilterProp="label" placeholder="Chọn hồ sơ NCT" disabled={Boolean(elderlyId)} options={elders.map(profile => ({
              value: profile.id, label: profile.hoTen, disabled: Boolean(relativeId && hasActiveRelativeLink(links, profile.id, relativeId)),
            }))} /></Form.Item></Col></Row>}
        <Form.Item name="moiQuanHe" label="Mối quan hệ với NCT" rules={[{ required: true, whitespace: true, max: 50, message: 'Nhập mối quan hệ, tối đa 50 ký tự' }]}>
          <Input maxLength={50} placeholder="Con trai, con gái, cháu, vợ/chồng hoặc quan hệ phù hợp" /></Form.Item>
      </FormSection>
      <FormSection title="Phạm vi chia sẻ" description="Thông tin cơ bản, số đo, lịch thuốc, lịch khám và cảnh báo theo quyền xem. Ba nội dung dưới đây cần đồng ý riêng.">
        <div className="relative-scope-options">{Object.entries(SCOPE_LABELS).map(([key, label]) => <Form.Item key={key} name={['phamViChiaSe', key]} valuePropName="checked"><Checkbox>{label}</Checkbox></Form.Item>)}</div>
        <p className="relative-muted">Tọa độ GPS SOS và ghi chú xử lý nội bộ không được chia sẻ.</p>
      </FormSection>
      <FormSection title="Ghi nhận sự đồng ý">
        <Row gutter={16}><Col xs={24} md={12}><Form.Item name="nguoiDongY" label="Họ tên người đồng ý" rules={[{ required: true, whitespace: true, max: 100, message: 'Nhập họ tên người đồng ý' }]}><Input maxLength={100} /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="tuCachDongY" label="Tư cách người đồng ý" rules={[{ required: true, whitespace: true, max: 100, message: 'Nhập tư cách đồng ý' }]}><Input maxLength={100} placeholder="Bản thân NCT hoặc tư cách đại diện đã xác minh" /></Form.Item></Col></Row>
        <Form.Item name="thoiDiemDongY" label="Thời điểm đồng ý (giờ Việt Nam)" rules={[{ required: true, message: 'Vui lòng chọn ngày giờ đồng ý' }]}>
          <DatePicker showTime={{ format: 'HH:mm:ss' }} showNow={false} format="DD/MM/YYYY HH:mm:ss" style={{ width: '100%' }}
            disabledDate={date => date && date.format('YYYY-MM-DD') > vietnamWallTime().slice(0, 10)} /></Form.Item>
        <Button size="small" onClick={() => form.setFieldValue('thoiDiemDongY', dayjs(vietnamWallTime()))}>Dùng thời gian hiện tại</Button>
        <Form.Item name="canCuDongY" label="Căn cứ đồng ý chia sẻ" rules={[{ required: true, whitespace: true, max: 1000, message: 'Nhập căn cứ đồng ý, tối đa 1000 ký tự' }]}>
          <Input.TextArea rows={3} maxLength={1000} showCount placeholder="Tham chiếu biên bản, hình thức xác nhận và nội dung đã được kiểm tra" /></Form.Item>
        {editor?.record && <Form.Item name="lyDo" label="Lý do cập nhật" rules={[{ required: true, whitespace: true, max: 500, message: 'Vui lòng nhập lý do cập nhật' }]}><Input.TextArea maxLength={500} rows={2} /></Form.Item>}
        <Form.Item name="dongYChiaSe" valuePropName="checked" rules={[{ validator: (_, value) => value === true ? Promise.resolve() : Promise.reject(new Error('Cần xác nhận đã kiểm tra sự đồng ý chia sẻ')) }]}>
          <Checkbox>Tôi đã xác minh sự đồng ý và phạm vi chia sẻ nêu trên.</Checkbox></Form.Item>
      </FormSection>
    </ModalForm>
    <ModalForm title="Xác nhận thu hồi quyền theo dõi" mode="edit" icon={<StopOutlined />} open={Boolean(revokeTarget)} form={revokeForm}
      onCancel={() => { if (!saving) { setRevokeTarget(null); setFormError(null); setConflict(false); } }} onFinish={revoke} loading={saving} width={580}
      afterOpenChange={open => { if (open) revokeForm.resetFields(); }}
      className="app-form-modal relative-consent-modal" footer={<Space wrap className="relative-modal-actions">
        <Button disabled={saving} onClick={() => { setRevokeTarget(null); setFormError(null); setConflict(false); }}>Hủy</Button>
        <Button danger type="primary" loading={saving} disabled={conflict} onClick={() => revokeForm.submit()}>Xác nhận thu hồi</Button></Space>}>
      {revokeTarget && <p>{personName(revokeTarget)} sẽ ngừng được theo dõi {profileName(revokeTarget)} theo liên kết này. Lịch sử được giữ lại.</p>}
      {formError && <Alert type="error" showIcon title={formError} />}
      <Form.Item name="lyDo" label="Lý do thu hồi" rules={[{ required: true, whitespace: true, max: 500, message: 'Vui lòng nhập lý do thu hồi' }]}><Input.TextArea rows={3} maxLength={500} showCount /></Form.Item>
    </ModalForm>
    <Modal title="Chi tiết liên kết Người thân" open={Boolean(detail)} onCancel={() => setDetail(null)} footer={<Button onClick={() => setDetail(null)}>Đóng</Button>}
      width={720} className="relative-detail-modal" destroyOnHidden>
      {detail && <><Descriptions column={1} size="small" items={[
        { key: 'person', label: 'Người thân', children: personName(detail) }, { key: 'elderly', label: 'NCT', children: profileName(detail) },
        { key: 'relationship', label: 'Mối quan hệ', children: detail.moiQuanHe },
        { key: 'state', label: 'Trạng thái', children: detail.thuHoiLuc ? 'Đã thu hồi' : 'Đang hoạt động' },
        { key: 'scope', label: 'Phạm vi chia sẻ', children: <ScopeTags scope={detail.phamViChiaSe} /> },
        { key: 'consenter', label: 'Người đồng ý', children: detail.nguoiDongY }, { key: 'capacity', label: 'Tư cách đồng ý', children: detail.tuCachDongY },
        { key: 'time', label: 'Thời điểm đồng ý', children: formatRelativeTimeVN(detail.thoiDiemDongY) },
        { key: 'basis', label: 'Căn cứ đồng ý', children: detail.canCuDongY },
        ...(detail.thuHoiLuc ? [{ key: 'revoked', label: 'Thu hồi lúc', children: formatRelativeTimeVN(detail.thuHoiLuc) }, { key: 'reason', label: 'Lý do thu hồi', children: detail.lyDoThuHoi }] : []),
      ]} /><Button icon={<HistoryOutlined />} onClick={() => { setDetail(null); openHistory(detail); }}>Xem lịch sử</Button></>}
    </Modal>
    <Modal title="Lịch sử liên kết Người thân" open={Boolean(historyTarget)} onCancel={() => { historySequence.current++; setHistoryTarget(null); }} width={800}
      className="relative-history-modal" destroyOnHidden footer={<Button onClick={() => { historySequence.current++; setHistoryTarget(null); }}>Đóng</Button>}>
      {historyError ? <RelativeUnavailable error={historyError} onRetry={() => openHistory(historyTarget)} /> : <Spin spinning={historyLoading}>
        {!history.length && !historyLoading ? <Empty description="Chưa có lịch sử liên kết" /> : <div className="relative-history-list">{history.map(row => <article key={row.id}>
          <header><strong>{ACTIONS[row.hanhDong] || row.hanhDong}</strong><span>{formatRelativeTimeVN(row.thoiGian)}</span></header>
          <p>Thực hiện: {actors[row.nguoiThucHienId] || `Tài khoản #${row.nguoiThucHienId}`}</p><p>Lý do: {row.lyDo}</p>
          <dl>{relativeHistoryChanges(row).map(change => <div key={change.label}><dt>{change.label}</dt><dd><span>{change.before}</span><span aria-hidden="true"> → </span><strong>{change.after}</strong></dd></div>)}</dl>
        </article>)}</div>}
        {historyMore && <Button loading={historyLoading} onClick={() => openHistory(historyTarget, history.length)}>Tải thêm lịch sử</Button>}
      </Spin>}
    </Modal>
  </section>;
};
export default RelativeLinksPanel;
