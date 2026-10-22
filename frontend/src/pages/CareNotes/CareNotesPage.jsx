// Care notes describe observations/activity; they never trigger dosing or SOS.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Col, DatePicker, Empty, Form, Input, Modal, Row, Select, Skeleton, Space, Tag, Timeline, message } from 'antd';
import { AlertOutlined, BookOutlined, ClockCircleOutlined, DeleteOutlined, EditOutlined, HeartOutlined, HistoryOutlined, MedicineBoxOutlined, PlusOutlined, ReloadOutlined, UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { createCareNote, deleteCareNote, getCareNoteHistory, getCareNotes, updateCareNote } from '../../services/careNoteService';
import { getElders } from '../../services/elderlyService';
import PageHeader from '../../components/PageHeader';
import TableToolbar from '../../components/TableToolbar';
import ModalForm, { FormSection } from '../../components/ModalForm';
import usePermission from '../../hooks/usePermission';
import { CARE_NOTE_TYPES, buildCareNotePayload, buildCareNoteQuery, careNoteError, careNoteMoment, groupCareNotesByDay, isCareNoteConflict, isValidCareTime, vietnamNowWall } from '../../utils/careNotes';
import './CareNotesPage.css';

const TYPES = {
  CHAM_SOC_HANG_NGAY: { icon: <HeartOutlined />, color: '#26966f' },
  SU_CO: { icon: <AlertOutlined />, color: '#c64040' },
  VAT_LY_TRI_LIEU: { icon: <MedicineBoxOutlined />, color: '#287a9a' },
  CANH_BAO: { icon: <AlertOutlined />, color: '#b8780c' },
};
const typeOptions = Object.entries(CARE_NOTE_TYPES).map(([value, label]) => ({ value, label }));
const formatMoment = value => value && dayjs(value).isValid() ? dayjs(value).format('HH:mm · DD/MM/YYYY') : 'Chưa có thông tin';
const reasonRules = [
  { required: true, whitespace: true, message: 'Vui lòng nhập lý do để lưu dấu vết thay đổi' },
  { validator: (_, value) => !value || (value.trim().length >= 5 && value.trim().length <= 300)
    ? Promise.resolve() : Promise.reject(new Error('Lý do phải từ 5 đến 300 ký tự')) },
];
function Snapshot({ label, value }) {
  if (!value) return null;
  return <div className="care-note-snapshot"><strong>{label}</strong><p>{value.tieuDe}</p>
    <p>{CARE_NOTE_TYPES[value.loaiNhatKy] || value.loaiNhatKy} · {formatMoment(value.thoiGianChamSoc)}</p>
    <p>{value.noiDung}</p>{value.trangThai === 'HUY' && <Tag color="red">Đã xóa mềm</Tag>}</div>;
}
function ConflictNotice({ conflict, onLoad, onUseLatest }) {
  if (!conflict) return null;
  return <Alert className="care-note-form-error" type="warning" showIcon message="Nhật ký đã được người khác cập nhật"
    description={<><p>Bản nháp của bạn vẫn được giữ nguyên. Xem bản mới và đối chiếu trước khi tiếp tục; không ghi đè tự động.</p>
      {conflict.error && <p>{conflict.error}</p>}
      {conflict.latest && <div className="care-note-conflict-preview"><strong>Bản mới: {conflict.latest.tieuDe}</strong>
        <p>{formatMoment(careNoteMoment(conflict.latest))}</p><p>{conflict.latest.noiDung}</p></div>}
      <Space wrap><Button size="small" loading={conflict.loading} onClick={onLoad}>Xem bản mới để đối chiếu</Button>
        {conflict.latest && <Button size="small" onClick={onUseLatest}>Nạp bản mới vào form</Button>}</Space></>} />;
}

const CareNotesPage = () => {
  const { hasPermission, permissionsLoading } = usePermission();
  const canView = hasPermission('QLNHATKY', 'xem'), canCreate = hasPermission('QLNHATKY', 'them');
  const canEdit = hasPermission('QLNHATKY', 'sua'), canDelete = hasPermission('QLNHATKY', 'xoa');
  const [notes, setNotes] = useState([]), [elders, setElders] = useState([]);
  const [eldersError, setEldersError] = useState(''), [eldersReload, setEldersReload] = useState(0);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [reload, setReload] = useState(0);
  const [selectedElder, setSelectedElder] = useState(null), [dateRange, setDateRange] = useState(null), [selectedType, setSelectedType] = useState(null);
  const [search, setSearch] = useState(''), [appliedSearch, setAppliedSearch] = useState('');
  const [editor, setEditor] = useState({ open: false, record: null }), [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(''), [conflict, setConflict] = useState(null);
  const [deleteRecord, setDeleteRecord] = useState(null), [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(''), [deleteConflict, setDeleteConflict] = useState(null);
  const [history, setHistory] = useState({ record: null, loading: false, entries: [], error: '' });
  const [form] = Form.useForm(), [deleteForm] = Form.useForm();
  const mounted = useRef(false), editorSession = useRef(0), deleteSession = useRef(0), historySession = useRef(0);
  const savingRef = useRef(false), deletingRef = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const timer = setTimeout(() => setAppliedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useMemo(() => buildCareNoteQuery({ elderlyId: selectedElder, from: dateRange?.[0]?.format('YYYY-MM-DD'),
    to: dateRange?.[1]?.format('YYYY-MM-DD'), type: selectedType, search: appliedSearch }), [selectedElder, dateRange, selectedType, appliedSearch]);
  const hasFilters = Object.keys(query).length > 0;
  useEffect(() => {
    if (permissionsLoading || (!canView && !canCreate)) return undefined;
    let active = true;
    getElders().then(rows => { if (active) { setElders(rows); setEldersError(''); } })
      .catch(failure => { if (active) setEldersError(careNoteError(failure, 'Không tải được danh sách người cao tuổi.')); });
    return () => { active = false; };
  }, [canView, canCreate, permissionsLoading, eldersReload]);
  useEffect(() => {
    if (permissionsLoading || !canView) return undefined;
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return undefined;
      setLoading(true); setError('');
      return getCareNotes(query);
    }).then(rows => { if (active && rows) setNotes(rows); })
      .catch(failure => { if (active) setError(careNoteError(failure)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query, reload, canView, permissionsLoading]);
  const clearFilters = () => { setSelectedElder(null); setDateRange(null); setSelectedType(null); setSearch(''); setAppliedSearch(''); };
  const populateForm = record => form.setFieldsValue({
    nguoiCaoTuoiId: record?.nguoiCaoTuoiId ?? selectedElder ?? undefined,
    loaiNhatKy: record?.loaiNhatKy ?? 'CHAM_SOC_HANG_NGAY',
    thoiGianChamSoc: dayjs(record ? careNoteMoment(record) : vietnamNowWall()),
    tieuDe: record?.tieuDe ?? '', noiDung: record?.noiDung ?? '', lyDo: '',
  });
  const openEditor = (record = null) => {
    editorSession.current++; form.resetFields(); populateForm(record); setEditor({ open: true, record }); setSaveError(''); setConflict(null);
  };
  const closeEditor = () => {
    if (savingRef.current) return;
    editorSession.current++; setEditor({ open: false, record: null }); setSaveError(''); setConflict(null); form.resetFields();
  };
  const handleSave = async values => {
    if (savingRef.current || conflict) return;
    savingRef.current = true; setSaving(true); setSaveError('');
    const session = editorSession.current;
    try {
      const payload = buildCareNotePayload({ ...values, thoiGianChamSoc: values.thoiGianChamSoc.format('YYYY-MM-DDTHH:mm:ss') }, editor.record);
      if (editor.record) await updateCareNote(editor.record.id, payload); else await createCareNote(payload);
      if (!mounted.current || session !== editorSession.current) return;
      message.success(editor.record ? 'Đã lưu thay đổi nhật ký và lịch sử chỉnh sửa' : 'Đã ghi nhận hoạt động chăm sóc');
      setEditor({ open: false, record: null }); form.resetFields();
      // Refresh via current effect dependencies, not filters captured before mutation.
      setReload(value => value + 1);
    } catch (failure) {
      if (!mounted.current || session !== editorSession.current) return;
      setSaveError(careNoteError(failure, 'Chưa lưu được nhật ký. Nội dung bạn nhập vẫn được giữ.'));
      if (isCareNoteConflict(failure)) setConflict({ loading: false, latest: null, error: '' });
    } finally {
      savingRef.current = false;
      if (mounted.current && session === editorSession.current) setSaving(false);
    }
  };
  const openDelete = record => { deleteSession.current++; deleteForm.resetFields(); setDeleteRecord(record); setDeleteError(''); setDeleteConflict(null); };
  const closeDelete = () => {
    if (deletingRef.current) return;
    deleteSession.current++; setDeleteRecord(null); setDeleteConflict(null); setDeleteError('');
  };
  const handleDelete = async values => {
    if (deletingRef.current || deleteConflict) return;
    deletingRef.current = true; setDeleting(true); setDeleteError('');
    const session = deleteSession.current;
    try {
      await deleteCareNote(deleteRecord.id, { version: deleteRecord.version, lyDo: values.lyDo.trim() });
      if (!mounted.current || session !== deleteSession.current) return;
      message.success('Đã xóa mềm nhật ký; lịch sử thay đổi vẫn được giữ');
      setDeleteRecord(null); deleteForm.resetFields(); setReload(value => value + 1);
    } catch (failure) {
      if (!mounted.current || session !== deleteSession.current) return;
      setDeleteError(careNoteError(failure, 'Không thể xóa nhật ký. Lý do bạn nhập vẫn được giữ.'));
      if (isCareNoteConflict(failure)) setDeleteConflict({ loading: false, latest: null, error: '' });
    } finally {
      deletingRef.current = false;
      if (mounted.current && session === deleteSession.current) setDeleting(false);
    }
  };
  const loadConflict = async mode => {
    const isEdit = mode === 'edit', record = isEdit ? editor.record : deleteRecord;
    const session = isEdit ? editorSession.current : deleteSession.current, update = isEdit ? setConflict : setDeleteConflict;
    update(value => ({ ...value, loading: true, error: '' }));
    try {
      const rows = await getCareNotes({ nguoiCaoTuoiId: record.nguoiCaoTuoiId });
      const latest = rows.find(row => Number(row.id) === Number(record.id));
      if (!mounted.current || session !== (isEdit ? editorSession.current : deleteSession.current)) return;
      update({ loading: false, latest: latest ?? null, error: latest ? '' : 'Nhật ký không còn trong danh sách hoặc quyền truy cập đã thay đổi. Hãy đóng form và tải lại.' });
    } catch (failure) {
      if (mounted.current && session === (isEdit ? editorSession.current : deleteSession.current)) update(value => ({ ...value, loading: false, error: careNoteError(failure) }));
    }
  };
  const adoptLatestRecord = mode => {
    const isEdit = mode === 'edit', latest = (isEdit ? conflict : deleteConflict)?.latest;
    if (!latest) return;
    Modal.confirm({
      title: isEdit ? 'Nạp bản mới vào form?' : 'Dùng bản mới để kiểm tra lại trước khi xóa?',
      content: isEdit ? 'Bản nháp hiện tại sẽ được thay bằng bản mới trên hệ thống. Bạn có thể sao chép bản nháp trước khi tiếp tục.'
        : 'Nội dung được cập nhật theo bản mới. Lý do xóa được giữ, và bạn phải bấm xác nhận xóa lần nữa.',
      okText: 'Nạp bản mới', cancelText: 'Giữ bản nháp',
      onOk: () => {
        if (isEdit) { setEditor({ open: true, record: latest }); populateForm(latest); setConflict(null); setSaveError(''); }
        else { setDeleteRecord(latest); setDeleteConflict(null); setDeleteError(''); }
      },
    });
  };
  const openHistory = async record => {
    const session = ++historySession.current;
    setHistory({ record, loading: true, entries: [], error: '' });
    try {
      const entries = await getCareNoteHistory(record.id);
      if (mounted.current && session === historySession.current) setHistory({ record, loading: false, entries, error: '' });
    } catch (failure) {
      if (mounted.current && session === historySession.current) setHistory({ record, loading: false, entries: [], error: careNoteError(failure, 'Không tải được lịch sử nhật ký.') });
    }
  };
  const closeHistory = () => { historySession.current++; setHistory({ record: null, loading: false, entries: [], error: '' }); };
  const elderOptions = elders.map(elder => ({ value: elder.id, label: elder.hoTen }));
  if (editor.record && !elders.some(elder => Number(elder.id) === Number(editor.record.nguoiCaoTuoiId))) elderOptions.push({ value: editor.record.nguoiCaoTuoiId, label: editor.record.nguoiCaoTuoiTen });
  const grouped = groupCareNotesByDay(notes);
  const renderNote = note => {
    const cfg = TYPES[note.loaiNhatKy] || { icon: <BookOutlined />, color: '#617a74' };
    return { key: note.id, dot: React.cloneElement(cfg.icon, { style: { color: cfg.color, fontSize: 18 } }), children:
      <Card className="care-note-card" size="small" style={{ '--note-color': cfg.color }}>
        <div className="care-note-card-header"><div><div className="care-note-person"><UserOutlined /><strong>{note.nguoiCaoTuoiTen || 'Chưa có tên NCT'}</strong>
          <Tag color={cfg.color}>{CARE_NOTE_TYPES[note.loaiNhatKy] || note.loaiNhatKyLabel || 'Nhật ký'}</Tag></div><h4 className="care-note-title">{note.tieuDe}</h4></div>
          <span className="care-note-time"><ClockCircleOutlined />{formatMoment(careNoteMoment(note))}</span></div>
        <div className="care-note-content">{note.noiDung}</div>
        <div className="care-note-footer"><div className="care-note-author">
          <span>Người ghi: <strong>{note.nguoiGhiTen || note.nguoiChamSocTen || 'Chưa có thông tin người ghi'}</strong></span>
          <span>Tạo bản ghi: {formatMoment(note.ngayTao)}</span>
          {note.chinhSuaLanCuoi && <span>Đã chỉnh sửa: {formatMoment(note.chinhSuaLanCuoi.thoiGian)} · {note.chinhSuaLanCuoi.nguoiThucHienTen || 'Chưa có tên'}</span>}
        </div><div className="care-note-actions"><Button size="small" icon={<HistoryOutlined />} onClick={() => openHistory(note)}>Lịch sử</Button>
          {canEdit && note.canEdit !== false && <Button size="small" icon={<EditOutlined />} onClick={() => openEditor(note)}>Sửa</Button>}
          {canDelete && note.canEdit !== false && <Button size="small" danger icon={<DeleteOutlined />} onClick={() => openDelete(note)}>Xóa</Button>}
        </div></div></Card> };
  };
  if (permissionsLoading) return <Skeleton active paragraph={{ rows: 8 }} />;
  if (!canView) return <Alert type="warning" showIcon message="Bạn chưa có quyền xem nhật ký chăm sóc." />;
  return <div className="care-notes-page">
    <PageHeader title="Nhật ký chăm sóc" subtitle="Ghi lại việc đã làm, tình trạng và lưu ý để người chăm sóc tiếp theo nắm được"
      icon={<BookOutlined />} count={loading || error ? undefined : notes.length} countLabel="nhật ký"
      extra={canCreate && <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => openEditor()}>Thêm nhật ký</Button>} />
    <Alert className="care-notes-intro" type="info" showIcon icon={<BookOutlined />} message="Sổ ghi nhận và bàn giao chăm sóc"
      description={<p>Ghi rõ đã hỗ trợ NCT việc gì, tình trạng sau chăm sóc và điều cần theo dõi tiếp. Nhật ký không tự xác nhận thuốc, tạo chỉ số sức khỏe, gửi cảnh báo hoặc SOS.</p>} />
    {eldersError && <Alert type="warning" showIcon message={eldersError} style={{ marginBottom: 12 }} action={<Button size="small" onClick={() => setEldersReload(value => value + 1)}>Tải lại danh sách NCT</Button>} />}
    <TableToolbar search={search} onSearch={setSearch} searchWidth={290} searchPlaceholder="Tìm nội dung, tiêu đề nhật ký..."
      filters={[
        <Select key="elder" aria-label="Lọc theo người cao tuổi" className="care-notes-filter-select" placeholder="Người cao tuổi" value={selectedElder} onChange={setSelectedElder}
          options={elders.map(elder => ({ value: elder.id, label: elder.hoTen }))} allowClear showSearch optionFilterProp="label" />,
        <DatePicker.RangePicker key="date" aria-label="Lọc khoảng ngày chăm sóc" className="care-notes-filter-range" format="DD/MM/YYYY" value={dateRange} onChange={setDateRange} placeholder={['Từ ngày chăm sóc', 'Đến ngày chăm sóc']} />,
        <Select key="type" aria-label="Lọc loại nhật ký" className="care-notes-filter-select" placeholder="Loại nhật ký" options={typeOptions} value={selectedType} onChange={setSelectedType} allowClear />,
      ]} extra={<div className="care-notes-filter-actions"><Button icon={<ReloadOutlined />} onClick={() => setReload(value => value + 1)} loading={loading}>Tải lại</Button><Button onClick={clearFilters} disabled={!hasFilters && !search}>Xóa bộ lọc</Button></div>} />
    {loading ? <div className="care-notes-state" role="status" aria-label="Đang tải nhật ký"><Skeleton active paragraph={{ rows: 7 }} /></div>
      : error ? <Alert type="error" showIcon message="Không tải được nhật ký chăm sóc" description={error} action={<Button onClick={() => setReload(value => value + 1)}>Thử lại</Button>} />
        : notes.length === 0 ? <div className="care-notes-state"><Empty description={hasFilters ? 'Không có nhật ký phù hợp bộ lọc' : 'Chưa có nhật ký chăm sóc nào'}>
          <Space wrap>{hasFilters && <Button onClick={clearFilters}>Xóa bộ lọc</Button>}{canCreate && <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>Ghi hoạt động chăm sóc đầu tiên</Button>}</Space>
        </Empty></div> : grouped.map(group => <section className="care-note-day" key={group.day}><div className="care-note-day-heading"><h3>{group.day === 'unknown' ? 'Chưa rõ ngày chăm sóc' : 'Ngày ' + dayjs(group.day).format('DD/MM/YYYY')}</h3><Tag>{group.entries.length} nhật ký</Tag></div><Timeline className="care-note-timeline" items={group.entries.map(renderNote)} /></section>)}

    <ModalForm open={editor.open} mode={editor.record ? 'edit' : 'create'} title={editor.record ? 'Sửa nhật ký chăm sóc' : 'Ghi hoạt động chăm sóc'}
      subtitle="Ghi việc đã thực hiện và tình trạng thực tế; không thay thế lịch thuốc hoặc SOS" icon={<BookOutlined />}
      saveLabel={editor.record ? 'Lưu thay đổi' : 'Lưu nhật ký'} form={form} onCancel={closeEditor} onFinish={handleSave} loading={saving} keyboard={!saving} closable={!saving} width={760}
      footer={<Space wrap><Button onClick={closeEditor} disabled={saving}>Hủy</Button>
        <Button type="primary" loading={saving} disabled={saving || Boolean(conflict)} onClick={() => form.submit()}
          title={conflict ? 'Hãy đối chiếu và nạp bản mới trước khi lưu' : undefined}>{editor.record ? 'Lưu thay đổi' : 'Lưu nhật ký'}</Button></Space>}>
      {saveError && <Alert className="care-note-form-error" type="error" showIcon message={saveError} />}
      <ConflictNotice conflict={conflict} onLoad={() => loadConflict('edit')} onUseLatest={() => adoptLatestRecord('edit')} />
      <FormSection title="Chăm sóc ai, vào lúc nào?" description="Người ghi và thời điểm tạo được hệ thống lưu tự động từ tài khoản đăng nhập.">
        <Row gutter={18}><Col xs={24} md={12}><Form.Item name="nguoiCaoTuoiId" label="Người cao tuổi" rules={[{ required: true, message: 'Chọn người cao tuổi được chăm sóc' }]}>
          <Select disabled={Boolean(editor.record)} options={elderOptions} placeholder="Chọn người đang phụ trách" showSearch optionFilterProp="label" /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="loaiNhatKy" label="Loại nhật ký" rules={[{ required: true, message: 'Chọn loại nhật ký' }]}><Select options={typeOptions} /></Form.Item></Col>
          <Col xs={24}><Form.Item name="thoiGianChamSoc" label="Ngày và giờ thực sự chăm sóc (giờ Việt Nam)" extra="Có thể chọn ngày cũ nếu ghi bổ sung. Thời điểm tạo bản ghi vẫn được giữ riêng."
            rules={[{ required: true, message: 'Chọn ngày và giờ đã chăm sóc' }, { validator: (_, value) => !value || isValidCareTime(value.format('YYYY-MM-DDTHH:mm:ss')) ? Promise.resolve() : Promise.reject(new Error('Thời điểm chăm sóc phải hợp lệ và không ở tương lai')) }]}>
            <DatePicker showTime={{ format: 'HH:mm' }} format="DD/MM/YYYY HH:mm" style={{ width: '100%' }} disabledDate={value => value && value.format('YYYY-MM-DD') > vietnamNowWall().slice(0, 10)} /></Form.Item></Col></Row>
      </FormSection>
      <FormSection title="Đã làm gì và có lưu ý gì?" description="Chỉ ghi thông tin thực tế. Bạn có thể viết ngắn, không cần dùng thuật ngữ y tế.">
        <div className="care-note-editor-guidance"><strong>Gợi ý viết nội dung theo 3 ý:</strong>
          <p>1. Đã làm gì: hỗ trợ ăn uống, vệ sinh cá nhân, đi khám...</p><p>2. Tình trạng/kết quả: NCT ăn được bao nhiêu, sinh hoạt như thế nào...</p>
          <p>3. Lưu ý bàn giao: điều người chăm sóc tiếp theo cần biết hoặc theo dõi.</p><p><em>Đây chỉ là gợi ý cách viết, không tự điền thành dữ liệu của NCT.</em></p></div>
        <Form.Item name="tieuDe" label="Việc chăm sóc / tiêu đề" rules={[{ required: true, whitespace: true, message: 'Nhập tiêu đề hoạt động' }, { max: 200, message: 'Tiêu đề tối đa 200 ký tự' }]}>
          <Input maxLength={200} showCount placeholder="Ví dụ minh họa: Hỗ trợ sinh hoạt buổi sáng" /></Form.Item>
        <Form.Item name="noiDung" label="Việc đã làm · tình trạng · lưu ý" rules={[{ required: true, whitespace: true, message: 'Nhập nội dung thực tế đã chăm sóc' }, { max: 1000, message: 'Nội dung tối đa 1000 ký tự' }]}>
          <Input.TextArea maxLength={1000} showCount autoSize={{ minRows: 5, maxRows: 12 }} placeholder={'Đã thực hiện: ...\nTình trạng/kết quả: ...\nCần theo dõi hoặc bàn giao: ...'} /></Form.Item>
        {editor.record && <Form.Item name="lyDo" label="Lý do chỉnh sửa" rules={reasonRules}><Input.TextArea maxLength={300} showCount autoSize={{ minRows: 2, maxRows: 4 }} placeholder="Vì sao cần sửa bản ghi này?" /></Form.Item>}
      </FormSection>
    </ModalForm>

    <ModalForm open={Boolean(deleteRecord)} title="Xóa mềm nhật ký chăm sóc?" icon={<DeleteOutlined />} mode="edit" saveLabel="Xác nhận xóa mềm" saveIcon={<DeleteOutlined />}
      form={deleteForm} loading={deleting} keyboard={!deleting} closable={!deleting} onCancel={closeDelete} onFinish={handleDelete} width={640}
      footer={<Space wrap><Button onClick={closeDelete} disabled={deleting}>Hủy</Button>
        <Button type="primary" danger loading={deleting} disabled={deleting || Boolean(deleteConflict)} onClick={() => deleteForm.submit()}
          title={deleteConflict ? 'Hãy đối chiếu và nạp bản mới trước khi xóa' : undefined}>Xác nhận xóa mềm</Button></Space>}>
      <Alert type="warning" showIcon message="Nhật ký sẽ được ẩn khỏi danh sách, không xóa vĩnh viễn" description="Người ghi ban đầu, nội dung và lịch sử thay đổi vẫn được giữ. Thao tác này không xóa dữ liệu thuốc, chỉ số hoặc cảnh báo." />
      <Snapshot label={deleteRecord?.nguoiCaoTuoiTen || 'Nhật ký được chọn'} value={deleteRecord && { ...deleteRecord, thoiGianChamSoc: careNoteMoment(deleteRecord) }} />
      {deleteError && <Alert className="care-note-form-error" type="error" showIcon message={deleteError} />}
      <ConflictNotice conflict={deleteConflict} onLoad={() => loadConflict('delete')} onUseLatest={() => adoptLatestRecord('delete')} />
      <Form.Item name="lyDo" label="Lý do xóa" rules={reasonRules} style={{ marginTop: 18 }}><Input.TextArea maxLength={300} showCount autoSize={{ minRows: 2, maxRows: 4 }} placeholder="Ví dụ: Bản ghi bị nhập trùng với nhật ký khác" /></Form.Item>
    </ModalForm>

    <Modal open={Boolean(history.record)} title={'Lịch sử nhật ký' + (history.record ? ' — ' + history.record.tieuDe : '')} width={840} footer={<Button onClick={closeHistory}>Đóng</Button>} onCancel={closeHistory} destroyOnHidden>
      {history.loading ? <Skeleton active paragraph={{ rows: 6 }} /> : history.error ? <Alert type="error" showIcon message={history.error} action={<Button onClick={() => openHistory(history.record)}>Thử lại</Button>} />
        : history.entries.length === 0 ? <Empty description="Chưa có lịch sử được lưu cho bản ghi cũ này" />
          : history.entries.map(entry => <article className="care-note-history-entry" key={entry.id}>
            <Tag color={entry.hanhDong === 'XOA' ? 'red' : entry.hanhDong === 'SUA' ? 'orange' : 'green'}>{{ TAO: 'Tạo nhật ký', SUA: 'Chỉnh sửa', XOA: 'Xóa mềm' }[entry.hanhDong] || entry.hanhDong}</Tag>
            <div className="care-note-history-meta"><strong>{entry.nguoiThucHienTen || 'Chưa có tên người thực hiện'}</strong> · {formatMoment(entry.thoiGian)}<div>Lý do: {entry.lyDo || 'Không cung cấp lý do'}</div></div>
            <Row gutter={12}><Col xs={24} md={entry.truoc && entry.sau ? 12 : 24}><Snapshot label="Trước thay đổi" value={entry.truoc} /></Col>
              <Col xs={24} md={entry.truoc && entry.sau ? 12 : 24}><Snapshot label="Sau thay đổi" value={entry.sau} /></Col></Row>
          </article>)}
    </Modal>
  </div>;
};
export default CareNotesPage;
