// Trang lịch khám bệnh - Danh sách và thêm lịch mới
import React, { useState, useEffect } from 'react';
import { Tag, Space, Button, Tooltip, Popconfirm, Form, Select, DatePicker, TimePicker, Input, message } from 'antd';
import {
  PlusOutlined, EditOutlined, StopOutlined, CalendarOutlined,
} from '@ant-design/icons';
import { getAppointments, createAppointment, cancelAppointment } from '../../services/appointmentService';
import { getElders } from '../../services/elderlyService';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import TableToolbar from '../../components/TableToolbar';
import DataTable from '../../components/DataTable';
import ModalForm from '../../components/ModalForm';
import StatusTag from '../../components/StatusTag';

const { Option } = Select;

const APPT_STATUS_MAP = {
  CHUA_DEN: { status: 'info',    label: 'Chưa đến' },
  DA_KHAM:  { status: 'success', label: 'Đã khám' },
  HUY:      { status: 'inactive',label: 'Hủy' },
};

const AppointmentsPage = () => {
  const [appointments, setAppointments] = useState([]);
  const [elders, setElders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const load = () => {
    setLoading(true);
    getAppointments({ search, trangThai: filterStatus || undefined })
      .then(setAppointments).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search, filterStatus]);
  useEffect(() => { getElders().then(setElders); }, []);

  const handleCancel = async (id) => {
    await cancelAppointment(id);
    message.success('Hủy lịch khám thành công');
    load();
  };

  const handleSave = async (values) => {
    setSaving(true);
    try {
      const elder = elders.find((e) => e.id === values.nguoiCaoTuoiId);
      await createAppointment({
        ...values,
        nguoiCaoTuoiTen: elder?.hoTen || '',
        ngayKham: values.ngayKham?.format('YYYY-MM-DD'),
        gioKham: values.gioKham?.format('HH:mm'),
        trangThai: 'CHUA_DEN',
        trangThaiLabel: 'Chưa đến',
      });
      message.success('Thêm lịch khám thành công');
      setModalOpen(false);
      form.resetFields();
      load();
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      title: 'Người cao tuổi',
      dataIndex: 'nguoiCaoTuoiTen',
      key: 'nguoiCaoTuoiTen',
      render: (v) => <span style={{ fontWeight: 600, fontSize: 15 }}>{v}</span>,
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
      render: (v) => {
        const cfg = APPT_STATUS_MAP[v] || { status: 'default', label: v };
        return <StatusTag status={cfg.status} label={cfg.label} />;
      },
    },
    {
      title: 'Hành động',
      key: 'action',
      fixed: 'right',
      width: 100,
      render: (_, r) => (
        <Space>
          <Tooltip title="Chỉnh sửa">
            <Button size="small" icon={<EditOutlined />} />
          </Tooltip>
          {r.trangThai === 'CHUA_DEN' && (
            <Popconfirm title="Hủy lịch khám này?" onConfirm={() => handleCancel(r.id)} okText="Hủy lịch" cancelText="Không">
              <Tooltip title="Hủy lịch">
                <Button size="small" danger icon={<StopOutlined />} />
              </Tooltip>
            </Popconfirm>
          )}
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
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => { form.resetFields(); setModalOpen(true); }}
            size="large"
          >
            Thêm lịch khám
          </Button>
        }
      />

      <TableToolbar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Tìm theo tên, nơi khám..."
        filters={[
          <Select
            key="status"
            placeholder="Lọc trạng thái"
            style={{ width: 160 }}
            allowClear
            onChange={setFilterStatus}
          >
            <Option value="CHUA_DEN">Chưa đến</Option>
            <Option value="DA_KHAM">Đã khám</Option>
            <Option value="HUY">Hủy</Option>
          </Select>,
        ]}
        count={appointments.length}
        countLabel="lịch khám"
      />

      <DataTable
        columns={columns}
        dataSource={appointments}
        rowKey="id"
        loading={loading}
        totalLabel="lịch khám"
      />

      <ModalForm
        title="Thêm lịch khám mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onFinish={handleSave}
        loading={saving}
        saveLabel="Thêm lịch"
        form={form}
        width={540}
      >
        <Form.Item name="nguoiCaoTuoiId" label="Người cao tuổi" rules={[{ required: true, message: 'Vui lòng chọn người cao tuổi' }]}>
          <Select placeholder="Chọn người cao tuổi">
            {elders.map((e) => <Option key={e.id} value={e.id}>{e.hoTen}</Option>)}
          </Select>
        </Form.Item>
        <Form.Item name="ngayKham" label="Ngày khám" rules={[{ required: true, message: 'Vui lòng chọn ngày' }]}>
          <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="gioKham" label="Giờ khám" rules={[{ required: true, message: 'Vui lòng chọn giờ' }]}>
          <TimePicker format="HH:mm" style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="noiKham" label="Nơi khám" rules={[{ required: true, message: 'Vui lòng nhập nơi khám' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="lyDoKham" label="Lý do khám">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="bacSiTen" label="Bác sĩ phụ trách">
          <Input />
        </Form.Item>
        <Form.Item name="ghiChu" label="Ghi chú">
          <Input.TextArea rows={2} />
        </Form.Item>
      </ModalForm>
    </div>
  );
};

export default AppointmentsPage;
