import React, { useEffect, useMemo, useState } from 'react';
import {
  Button, Col, DatePicker, Form, Input, message, Popconfirm, Row, Select, TimePicker,
} from 'antd';
import {
  BankOutlined, CalendarOutlined, CheckCircleOutlined, ClockCircleOutlined,
  EditOutlined, EyeOutlined, FileDoneOutlined, MedicineBoxOutlined, PlusOutlined,
  SearchOutlined, StopOutlined, TeamOutlined, UserOutlined, WarningOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  getAppointments, createAppointment, updateAppointment, cancelAppointment,
  recordAppointmentResult,
} from '../../services/appointmentService';
import { getElders } from '../../services/elderlyService';
import ModalForm, { FormSection } from '../../components/ModalForm';
import StatusTag, { getAppointmentStatusMap } from '../../components/StatusTag';
import usePermission from '../../hooks/usePermission';
import TableAvatar from '../../components/TableAvatar';
import { formatEntityCode } from '../../utils/displayUtils';
import { todayVietnam } from '../../utils/vietnamDate';
import RecordDetailModal from '../../components/RecordDetailModal';
import { getSocket } from '../../services/socketClient';
import { isFutureAppointment } from '../../utils/appointmentTime';

const appointmentDateTime = (appointment) => {
  if (!appointment.ngayKham) return null;
  const value = dayjs(`${appointment.ngayKham}T${appointment.gioKham || '00:00'}`);
  return value.isValid() ? value : null;
};

const AppointmentCard = ({ appointment, canEdit, canDelete, onDetail, onEdit, onResult, onCancel }) => {
  const appointmentTime = appointmentDateTime(appointment);
  const status = getAppointmentStatusMap(appointment.trangThai);

  return (
    <article
      className={`appointment-card status-${String(appointment.trangThai || '').toLowerCase()}`}
      onClick={() => onDetail(appointment)}
    >
      <header className="appointment-card-header">
        <div className="appointment-person">
          <TableAvatar name={appointment.nguoiCaoTuoiTen} size={48} />
          <div>
            <div className="appointment-person-name">
              <strong>{appointment.nguoiCaoTuoiTen}</strong>
              <span>{formatEntityCode('NCT', appointment.nguoiCaoTuoiId)}</span>
              <em>{formatEntityCode('LK', appointment.id)}</em>
            </div>
            <small>{appointment.lyDoKham || 'Chưa cập nhật lý do khám'}</small>
          </div>
        </div>
        <StatusTag {...status} />
      </header>

      <div className="appointment-card-body">
        <div className="appointment-time-block">
          <ClockCircleOutlined />
          <div>
            <strong>{appointment.gioKham || '—'}</strong>
            <span>{appointmentTime ? appointmentTime.format('dddd, DD/MM/YYYY') : 'Chưa cập nhật ngày khám'}</span>
          </div>
        </div>
        <div className="appointment-info-item">
          <BankOutlined />
          <span><small>Bệnh viện</small><strong>{appointment.noiKham || 'Chưa cập nhật'}</strong></span>
        </div>
        <div className="appointment-info-item">
          <UserOutlined />
          <span><small>Bác sĩ</small><strong>{appointment.bacSiTen || 'Chưa cập nhật'}</strong></span>
        </div>
        <div className="appointment-info-item">
          <MedicineBoxOutlined />
          <span><small>Chuyên khoa</small><strong>{appointment.ghiChu || 'Chưa cập nhật'}</strong></span>
        </div>
      </div>

      <div className="appointment-reason">
        <small>Lý do khám</small>
        <p>{appointment.lyDoKham || 'Chưa cập nhật lý do khám.'}</p>
      </div>

      {appointment.ketQua && (
        <div className="appointment-result">
          <CheckCircleOutlined />
          <span><small>Kết quả khám</small><strong>{appointment.ketQua}</strong></span>
        </div>
      )}

      <footer className="appointment-card-actions" onClick={(event) => event.stopPropagation()}>
        <Button icon={<EyeOutlined />} onClick={() => onDetail(appointment)}>Chi tiết</Button>
        {canEdit && !['HUY', 'DA_KHAM'].includes(appointment.trangThai)
          && appointmentTime && !appointmentTime.isAfter(dayjs()) && (
          <Button type="primary" icon={<FileDoneOutlined />} onClick={() => onResult(appointment)}>Ghi kết quả khám</Button>
        )}
        {canEdit && !['HUY', 'DA_KHAM'].includes(appointment.trangThai) && (
          <Button icon={<EditOutlined />} onClick={() => onEdit(appointment)}>Sửa</Button>
        )}
        {canDelete && appointment.trangThai === 'CHUA_DEN' && (
          <Popconfirm
            title="Hủy lịch khám này?"
            description="Lịch khám sẽ chuyển sang trạng thái Đã hủy."
            onConfirm={() => onCancel(appointment.id)}
            okText="Hủy lịch"
            cancelText="Không"
          >
            <Button danger icon={<StopOutlined />}>Hủy</Button>
          </Popconfirm>
        )}
      </footer>
    </article>
  );
};

const AppointmentsPage = () => {
  const { hasPermission } = usePermission();
  const canCreate = hasPermission('QLLICHKHAM', 'them');
  const canEdit = hasPermission('QLLICHKHAM', 'sua');
  const canDelete = hasPermission('QLLICHKHAM', 'xoa');
  const [appointments, setAppointments] = useState([]);
  const [elders, setElders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [dateRange, setDateRange] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailRecord, setDetailRecord] = useState(null);
  const [resultRecord, setResultRecord] = useState(null);
  const [form] = Form.useForm();
  const [resultForm] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      setAppointments(await getAppointments());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    Promise.all([getAppointments(), getElders()])
      .then(([appointmentData, elderData]) => {
        if (!active) return;
        setAppointments(appointmentData);
        setElders(elderData);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const socket = getSocket();
    const handleAppointmentUpdated = () => {
      getAppointments().then(setAppointments);
    };
    socket.on('lichkham:updated', handleAppointmentUpdated);
    return () => socket.off('lichkham:updated', handleAppointmentUpdated);
  }, []);

  const filteredAppointments = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('vi');
    return appointments.filter((appointment) => {
      const date = appointmentDateTime(appointment);
      const matchesSearch = !keyword || [
        appointment.nguoiCaoTuoiTen,
        formatEntityCode('NCT', appointment.nguoiCaoTuoiId),
        formatEntityCode('LK', appointment.id),
        appointment.noiKham,
        appointment.bacSiTen,
        appointment.ghiChu,
        appointment.lyDoKham,
      ].some((value) => String(value || '').toLocaleLowerCase('vi').includes(keyword));
      const matchesDate = !dateRange?.[0] || !dateRange?.[1] || (date
        && !date.isBefore(dateRange[0].startOf('day'))
        && !date.isAfter(dateRange[1].endOf('day')));
      return matchesSearch
        && matchesDate
        && (!filterStatus || appointment.trangThai === filterStatus);
    });
  }, [appointments, dateRange, filterStatus, search]);

  const stats = useMemo(() => {
    const now = dayjs();
    const weekStart = now.startOf('week');
    const weekEnd = now.endOf('week');
    return {
      week: appointments.filter((item) => {
        const date = appointmentDateTime(item);
        return date && !date.isBefore(weekStart) && !date.isAfter(weekEnd);
      }).length,
      today: appointments.filter((item) => {
        const date = appointmentDateTime(item);
        return date?.isSame(now, 'day');
      }).length,
      upcoming: appointments.filter((item) => item.trangThai === 'CHUA_DEN').length,
      overdue: appointments.filter((item) => {
        const date = appointmentDateTime(item);
        return item.trangThai === 'CHUA_DEN' && date?.isBefore(now);
      }).length,
    };
  }, [appointments]);

  const handleCancel = async (id) => {
    await cancelAppointment(id);
    message.success('Hủy lịch khám thành công');
    await load();
  };

  const handleAdd = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const handleEdit = (record) => {
    const [hour = 0, minute = 0] = (record.gioKham || '').split(':').map(Number);
    setEditing(record);
    form.setFieldsValue({
      ...record,
      ngayKham: record.ngayKham ? dayjs(record.ngayKham) : null,
      gioKham: record.gioKham ? dayjs().hour(hour).minute(minute).second(0) : null,
    });
    setModalOpen(true);
  };

  const handleSave = async (values) => {
    const day = values.ngayKham?.format('YYYY-MM-DD');
    const time = values.gioKham?.format('HH:mm');
    const changingTime = !editing || day !== editing.ngayKham || time !== editing.gioKham;
    if (changingTime && !isFutureAppointment(day, time)) {
      const error = 'Giờ khám mới phải ở tương lai. Vui lòng kiểm tra ngày và giờ khám.';
      form.setFields([{ name: 'gioKham', errors: [error] }]);
      form.scrollToField('gioKham', { focus: true });
      message.error(error);
      return;
    }
    setSaving(true);
    try {
      const elder = elders.find((item) => item.id === values.nguoiCaoTuoiId);
      const payload = {
        ...values,
        nguoiCaoTuoiTen: elder?.hoTen || '',
        ngayKham: values.ngayKham?.format('YYYY-MM-DD'),
        gioKham: values.gioKham?.format('HH:mm'),
        trangThai: 'CHUA_DEN',
        trangThaiLabel: 'Chưa đến',
      };
      if (editing) {
        await updateAppointment(editing.id, payload);
        message.success('Cập nhật lịch khám thành công');
      } else {
        await createAppointment(payload);
        message.success('Thêm lịch khám thành công');
      }
      setModalOpen(false);
      form.resetFields();
      await load();
    } catch (error) {
      // The interceptor shows the conflict once. Never replay a stale edit.
      if (error.response?.status === 409 && error.response?.data?.errorCode === 'APPOINTMENT_CHANGED') {
        setModalOpen(false);
        setEditing(null);
        form.resetFields();
        await load();
      }
    } finally {
      setSaving(false);
    }
  };

  const openResultModal = (record) => {
    setResultRecord(record);
    resultForm.setFieldsValue({ ketQuaKham: record.ketQua || '' });
  };

  const handleSaveResult = async ({ ketQuaKham }) => {
    if (!resultRecord) return;
    setSaving(true);
    try {
      await recordAppointmentResult(resultRecord.id, ketQuaKham.trim());
      message.success('Đã ghi kết quả khám và cập nhật trạng thái Đã khám');
      setResultRecord(null);
      resultForm.resetFields();
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="appointments-page">
      <section className="appointments-heading">
        <div>
          <span className="appointments-eyebrow"><span /> Theo dõi lịch khám bệnh</span>
          <h1>Quản lý Lịch khám bệnh</h1>
          <p>Quản lý lịch hẹn, thông tin chuyên khoa và kết quả khám của người cao tuổi.</p>
        </div>
        {canCreate && <Button type="primary" size="large" icon={<PlusOutlined />} onClick={handleAdd}>Thêm lịch khám</Button>}
      </section>

      <section className="appointment-kpi-grid">
        <article className="appointment-kpi-card is-week">
          <span><CalendarOutlined /></span>
          <div><small>Tổng lịch trong tuần</small><strong>{stats.week}</strong><em>lịch khám</em></div>
        </article>
        <article className="appointment-kpi-card is-today">
          <span><ClockCircleOutlined /></span>
          <div><small>Hôm nay</small><strong>{stats.today}</strong><em>lịch khám</em></div>
        </article>
        <article className="appointment-kpi-card is-upcoming">
          <span><TeamOutlined /></span>
          <div><small>Chưa đến</small><strong>{stats.upcoming}</strong><em>lịch khám</em></div>
        </article>
        <article className="appointment-kpi-card is-overdue">
          <span><WarningOutlined /></span>
          <div><small>Quá hạn chưa khám</small><strong>{stats.overdue}</strong><em>cần kiểm tra</em></div>
        </article>
      </section>

      <section className="appointment-list-panel">
        <div className="appointment-filter-bar">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Tìm theo tên, mã NCT, bệnh viện, bác sĩ"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <DatePicker.RangePicker
            value={dateRange}
            onChange={setDateRange}
            format="DD/MM/YYYY"
            placeholder={['Từ ngày', 'Đến ngày']}
          />
          <Select
            value={filterStatus || undefined}
            placeholder="Tất cả trạng thái"
            allowClear
            onChange={(value) => setFilterStatus(value || '')}
            options={[
              { value: 'CHUA_DEN', label: 'Chưa đến' },
              { value: 'DA_KHAM', label: 'Đã khám' },
              { value: 'HUY', label: 'Đã hủy' },
            ]}
          />
        </div>

        <div className="appointment-card-list" aria-busy={loading}>
          {filteredAppointments.map((appointment) => (
            <AppointmentCard
              key={appointment.id}
              appointment={appointment}
              canEdit={canEdit}
              canDelete={canDelete}
              onDetail={setDetailRecord}
              onEdit={handleEdit}
              onResult={openResultModal}
              onCancel={handleCancel}
            />
          ))}
          {!loading && filteredAppointments.length === 0 && (
            <div className="appointment-empty-state">
              <CalendarOutlined />
              <strong>Không có lịch khám phù hợp</strong>
              <span>Hãy thay đổi từ khóa, khoảng ngày hoặc trạng thái.</span>
              {canCreate && <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>Thêm lịch khám</Button>}
            </div>
          )}
        </div>
      </section>

      <RecordDetailModal
        open={!!detailRecord}
        onClose={() => setDetailRecord(null)}
        title={`Chi tiết lịch khám — ${detailRecord?.nguoiCaoTuoiTen || ''}`}
        record={detailRecord}
        fields={[
          { label: 'Mã lịch', key: 'id', render: (value) => formatEntityCode('LK', value) },
          { label: 'Người cao tuổi', key: 'nguoiCaoTuoiTen' },
          { label: 'Ngày khám', key: 'ngayKham', render: (value) => value ? dayjs(value).format('DD/MM/YYYY') : null },
          { label: 'Giờ khám', key: 'gioKham' },
          { label: 'Bệnh viện', key: 'noiKham' },
          { label: 'Bác sĩ', key: 'bacSiTen' },
          { label: 'Chuyên khoa', key: 'ghiChu', span: 2 },
          { label: 'Lý do khám', key: 'lyDoKham', span: 2 },
          { label: 'Kết quả', key: 'ketQua', span: 2 },
          { label: 'Trạng thái', key: 'trangThai', span: 2, render: (value) => <StatusTag {...getAppointmentStatusMap(value)} /> },
        ]}
      />

      <ModalForm
        title={editing ? 'Chỉnh sửa lịch khám' : 'Thêm lịch khám mới'}
        subtitle="Thiết lập thời gian, địa điểm và nội dung buổi khám"
        icon={<CalendarOutlined />}
        mode={editing ? 'edit' : 'create'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onFinish={handleSave}
        loading={saving}
        form={form}
      >
        <FormSection title="Thông tin lịch khám" description="Người cao tuổi, ngày giờ và địa điểm khám">
          <Row gutter={18}>
            <Col xs={24} md={12}>
              <Form.Item name="nguoiCaoTuoiId" label="Người cao tuổi" rules={[{ required: true, message: 'Vui lòng chọn người cao tuổi' }]}>
                <Select placeholder="Chọn hồ sơ người cao tuổi" showSearch optionFilterProp="children">
                  {elders.map((elder) => <Select.Option key={elder.id} value={elder.id}>{elder.hoTen}</Select.Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="noiKham" label="Nơi khám" rules={[{ required: true, message: 'Vui lòng nhập nơi khám' }]}>
                <Input placeholder="VD: Bệnh viện Chợ Rẫy" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="ngayKham"
                label="Ngày khám"
                rules={[
                  { required: true, message: 'Vui lòng chọn ngày khám' },
                  {
                    validator(_, value) {
                      const date = value?.format('YYYY-MM-DD');
                      if (!date || date >= todayVietnam() || (editing && date === editing.ngayKham)) {
                        return Promise.resolve();
                      }
                      return Promise.reject(new Error('Ngày khám không được trước ngày hiện tại'));
                    },
                  },
                ]}
              >
                <DatePicker
                  format="DD/MM/YYYY"
                  placeholder="Chọn ngày khám"
                  style={{ width: '100%' }}
                  disabledDate={(date) => date && date.format('YYYY-MM-DD') < todayVietnam()
                    && (!editing || date.format('YYYY-MM-DD') !== editing.ngayKham)}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="gioKham" label="Giờ khám" rules={[{ required: true, message: 'Vui lòng chọn giờ khám' }]}>
                <TimePicker format="HH:mm" placeholder="Chọn giờ khám" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="bacSiTen" label="Bác sĩ tại nơi khám">
                <Input placeholder="VD: BS. Nguyễn Văn An" />
              </Form.Item>
            </Col>
          </Row>
        </FormSection>

        <FormSection title="Nội dung khám" description="Mục đích khám và chuyên khoa tiếp nhận">
          <Form.Item name="lyDoKham" label="Lý do khám">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="Mô tả triệu chứng hoặc lý do tái khám" />
          </Form.Item>
          <Form.Item name="ghiChu" label="Chuyên khoa">
            <Input placeholder="VD: Tim mạch, Cơ xương khớp" />
          </Form.Item>
        </FormSection>
      </ModalForm>

      <ModalForm
        title="Ghi kết quả khám"
        subtitle={`${resultRecord?.nguoiCaoTuoiTen || ''} — ${resultRecord?.noiKham || ''}`}
        icon={<FileDoneOutlined />}
        mode="edit"
        open={!!resultRecord}
        onCancel={() => setResultRecord(null)}
        onFinish={handleSaveResult}
        loading={saving}
        saveLabel="Lưu kết quả"
        form={resultForm}
      >
        <FormSection
          title="Kết quả buổi khám"
          description="Sau khi lưu, lịch khám sẽ được chuyển sang trạng thái Đã khám"
        >
          <Form.Item
            name="ketQuaKham"
            label="Kết quả khám"
            rules={[
              { required: true, whitespace: true, message: 'Vui lòng nhập kết quả khám' },
              { max: 500, message: 'Kết quả khám tối đa 500 ký tự' },
            ]}
          >
            <Input.TextArea
              autoSize={{ minRows: 4, maxRows: 8 }}
              placeholder="Nhập chẩn đoán, kết luận hoặc hướng điều trị..."
            />
          </Form.Item>
        </FormSection>
      </ModalForm>
    </div>
  );
};

export default AppointmentsPage;
