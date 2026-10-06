// Trang lịch khám bệnh - Danh sách và thêm lịch mới
import React, { useState, useEffect } from 'react';
import { Space, Button, Popconfirm, Form, Select, DatePicker, TimePicker, Input, message, Row, Col } from 'antd';
import {
  PlusOutlined, EditOutlined, EyeOutlined, StopOutlined, CalendarOutlined, FileDoneOutlined,
} from '@ant-design/icons';
import {
  getAppointments, createAppointment, updateAppointment, cancelAppointment,
  recordAppointmentResult,
} from '../../services/appointmentService';
import { getElders } from '../../services/elderlyService';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import TableToolbar from '../../components/TableToolbar';
import DataTable from '../../components/DataTable';
import ModalForm, { FormSection } from '../../components/ModalForm';
import StatusTag, { getAppointmentStatusMap } from '../../components/StatusTag';
import usePermission from '../../hooks/usePermission';
import TableAvatar from '../../components/TableAvatar';
import TableActionButton from '../../components/TableActionButton';
import { formatEntityCode } from '../../utils/displayUtils';
import RecordDetailModal from '../../components/RecordDetailModal';

const { Option } = Select;

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
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailRecord, setDetailRecord] = useState(null);
  const [resultRecord, setResultRecord] = useState(null);
  const [form] = Form.useForm();
  const [resultForm] = Form.useForm();

  const load = () => {
    setLoading(true);
    getAppointments({ search, trangThai: filterStatus || undefined })
      .then(setAppointments).finally(() => setLoading(false));
  };

  useEffect(() => {
    getAppointments({ search, trangThai: filterStatus || undefined })
      .then(setAppointments)
      .finally(() => setLoading(false));
  }, [search, filterStatus]);
  useEffect(() => { getElders().then(setElders); }, []);

  const handleSearch = (value) => {
    setLoading(true);
    setSearch(value);
  };

  const handleFilterStatus = (value) => {
    setLoading(true);
    setFilterStatus(value || '');
  };

  const handleCancel = async (id) => {
    await cancelAppointment(id);
    message.success('Hủy lịch khám thành công');
    load();
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
    setSaving(true);
    try {
      const elder = elders.find((e) => e.id === values.nguoiCaoTuoiId);
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
      load();
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
      load();
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      title: 'Mã lịch',
      key: 'maLich',
      width: 115,
      render: (_, record) => <span className="entity-code-badge">{formatEntityCode('LK', record.id)}</span>,
    },
    {
      title: 'Người cao tuổi',
      dataIndex: 'nguoiCaoTuoiTen',
      key: 'nguoiCaoTuoiTen',
      sorter: (a, b) => a.nguoiCaoTuoiTen.localeCompare(b.nguoiCaoTuoiTen, 'vi'),
      render: (v) => <div className="table-person-cell"><TableAvatar name={v} /><span className="table-person-name">{v}</span></div>,
    },
    {
      title: 'Ngày & Giờ khám',
      key: 'ngayGio',
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600 }}>
            <CalendarOutlined style={{ marginRight: 6, color: '#2E7D9A' }} />
            {dayjs(r.ngayKham).format('DD/MM/YYYY')}
          </div>
          <div style={{ fontSize: 13, color: '#7A93A3' }}>⏰ {r.gioKham}</div>
        </div>
      ),
    },
    { title: 'Nơi khám', dataIndex: 'noiKham', key: 'noiKham' },
    { title: 'Lý do khám', dataIndex: 'lyDoKham', key: 'lyDoKham' },
    { title: 'Bác sĩ', dataIndex: 'bacSiTen', key: 'bacSiTen' },
    {
      title: 'Kết quả',
      dataIndex: 'ketQua',
      key: 'ketQua',
      render: (v) => v || <span style={{ color: '#BFBFBF' }}>—</span>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'trangThai',
      key: 'trangThai',
      sorter: (a, b) => a.trangThai.localeCompare(b.trangThai),
      render: (v) => {
        const mapped = getAppointmentStatusMap(v);
        return <StatusTag {...mapped} />;
      },
    },
    {
      title: 'Hành động',
      key: 'action',
      fixed: 'right',
      width: 132,
      render: (_, r) => (
        <Space>
          <TableActionButton type="view" tooltip="Xem chi tiết" icon={<EyeOutlined />} onClick={() => setDetailRecord(r)} />
          {canEdit && <TableActionButton type="edit" tooltip="Chỉnh sửa" icon={<EditOutlined />} onClick={() => handleEdit(r)} />}
          {canEdit && r.trangThai !== 'HUY' && (
            <TableActionButton
              type="view"
              tooltip="Ghi kết quả khám"
              icon={<FileDoneOutlined />}
              onClick={() => openResultModal(r)}
            />
          )}
          {canDelete && r.trangThai === 'CHUA_DEN' && (
            <Popconfirm title="Hủy lịch khám này?" onConfirm={() => handleCancel(r.id)} okText="Hủy lịch" cancelText="Không">
              <TableActionButton type="delete" tooltip="Hủy lịch" icon={<StopOutlined />} />
            </Popconfirm>
          )}
          {!canEdit && !(canDelete && r.trangThai === 'CHUA_DEN') && <span style={{ color: '#BFBFBF' }}>—</span>}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Lịch khám bệnh"
        subtitle="Quản lý lịch khám và theo dõi kết quả khám bệnh"
        icon={<CalendarOutlined />}
        count={appointments.length}
        countLabel="lịch khám"
        extra={canCreate && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAdd}
            size="large"
          >
            Thêm lịch khám
          </Button>
        )}
      />

      <TableToolbar
        search={search}
        onSearch={handleSearch}
        searchPlaceholder="Tìm theo tên, nơi khám..."
        filters={[
          <Select
            key="status"
            placeholder="Lọc trạng thái"
            style={{ width: 160 }}
            allowClear
            onChange={handleFilterStatus}
          >
            <Option value="CHUA_DEN">Chưa đến</Option>
            <Option value="DA_KHAM">Đã khám</Option>
            <Option value="HUY">Hủy</Option>
            <Option value="DA_DOI_LICH">Đã đổi lịch</Option>
          </Select>,
        ]}
      />

      <DataTable
        columns={columns}
        dataSource={appointments}
        rowKey="id"
        loading={loading}
        onRow={(record) => ({ onClick: () => setDetailRecord(record) })}
        emptyDescription="Chưa có lịch khám bệnh"
        emptyAction={canCreate && <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>Thêm lịch khám</Button>}
      />

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
          { label: 'Nơi khám', key: 'noiKham' },
          { label: 'Bác sĩ', key: 'bacSiTen' },
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
                  {elders.map((e) => <Option key={e.id} value={e.id}>{e.hoTen}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="noiKham" label="Nơi khám" rules={[{ required: true, message: 'Vui lòng nhập nơi khám' }]}>
                <Input placeholder="VD: Bệnh viện Chợ Rẫy" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="ngayKham" label="Ngày khám" rules={[{ required: true, message: 'Vui lòng chọn ngày khám' }]}>
                <DatePicker format="DD/MM/YYYY" placeholder="Chọn ngày khám" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="gioKham" label="Giờ khám" rules={[{ required: true, message: 'Vui lòng chọn giờ khám' }]}>
                <TimePicker format="HH:mm" placeholder="Chọn giờ khám" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="bacSiTen" label="Bác sĩ phụ trách">
                <Input placeholder="VD: BS. Nguyễn Văn An" />
              </Form.Item>
            </Col>
          </Row>
        </FormSection>

        <FormSection title="Nội dung khám" description="Mục đích khám và các lưu ý cần chuẩn bị">
          <Form.Item name="lyDoKham" label="Lý do khám">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="Mô tả triệu chứng hoặc lý do tái khám" />
          </Form.Item>
          <Form.Item name="ghiChu" label="Chuyên khoa / Ghi chú">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="VD: Tim mạch; mang theo kết quả xét nghiệm cũ" />
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
