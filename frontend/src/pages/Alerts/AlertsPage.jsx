// Trang cảnh báo - Lọc, xử lý và đánh dấu đã xem
import React, { useState, useEffect } from 'react';
import { Button, Select, Tag, Form, Input, message, Tooltip, Badge, Space } from 'antd';
import { AlertOutlined, CheckOutlined, EyeOutlined } from '@ant-design/icons';
import { getAlerts, markAlertSeen, resolveAlert } from '../../services/alertService';
import { getCurrentUser } from '../../services/authService';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import TableToolbar from '../../components/TableToolbar';
import DataTable from '../../components/DataTable';
import ModalForm from '../../components/ModalForm';
import StatusTag, { getAlertLevelStatus, getAlertStatusMap } from '../../components/StatusTag';

const { Option } = Select;

const MUC_DO_ORDER = { THAP: 1, TRUNG_BINH: 2, CAO: 3, KHAN_CAP: 4 };

const AlertsPage = () => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterLevel, setFilterLevel] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [resolveModal, setResolveModal] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [form] = Form.useForm();
  const currentUser = getCurrentUser();

  const load = () => {
    setLoading(true);
    getAlerts({ mucDo: filterLevel || undefined, trangThai: filterStatus || undefined })
      .then((data) => {
        data.sort((a, b) => (MUC_DO_ORDER[b.mucDo] || 0) - (MUC_DO_ORDER[a.mucDo] || 0));
        setAlerts(data);
      }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filterLevel, filterStatus]);

  const handleMarkSeen = async (id) => {
    await markAlertSeen(id, currentUser?.hoTen || 'Hệ thống');
    message.success('Đã đánh dấu đã xem');
    load();
  };

  const handleResolve = async (values) => {
    setSaving(true);
    try {
      await resolveAlert(selectedAlert.id, currentUser?.hoTen || 'Hệ thống', values.ghiChu);
      message.success('Đã xử lý cảnh báo thành công');
      setResolveModal(false);
      form.resetFields();
      load();
    } finally {
      setSaving(false);
    }
  };

  const unresolved = alerts.filter((a) => a.trangThai === 'CHUA_XU_LY').length;

  const columns = [
    {
      title: 'Mức độ',
      dataIndex: 'mucDo',
      key: 'mucDo',
      width: 130,
      render: (v) => {
        const { status, label } = getAlertLevelStatus(v);
        return <StatusTag status={status} label={label} />;
      },
      sorter: (a, b) => (MUC_DO_ORDER[a.mucDo] || 0) - (MUC_DO_ORDER[b.mucDo] || 0),
    },
    {
      title: 'Người cao tuổi',
      dataIndex: 'nguoiCaoTuoiTen',
      key: 'nguoiCaoTuoiTen',
      render: (v) => <strong style={{ fontSize: 15 }}>{v}</strong>,
    },
    {
      title: 'Loại cảnh báo',
      dataIndex: 'loaiCanhBaoLabel',
      key: 'loaiCanhBaoLabel',
      render: (v) => (
        <Tag style={{ background: '#EBF5FB', color: '#2E7D9A', borderColor: '#A8D4E6' }}>{v}</Tag>
      ),
    },
    { title: 'Mô tả', dataIndex: 'moTa', key: 'moTa' },
    {
      title: 'Thời gian',
      dataIndex: 'thoiGianPhatHien',
      key: 'thoiGianPhatHien',
      render: (v) => dayjs(v).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'trangThai',
      key: 'trangThai',
      render: (v) => {
        const { status, label } = getAlertStatusMap(v);
        return <StatusTag status={status} label={label} />;
      },
    },
    {
      title: 'Người xử lý',
      dataIndex: 'nguoiXuLy',
      key: 'nguoiXuLy',
      render: (v) => v || <span style={{ color: '#BFBFBF' }}>—</span>,
    },
    {
      title: 'Hành động',
      key: 'action',
      fixed: 'right',
      width: 110,
      render: (_, r) => (
        <Space>
          {r.trangThai === 'CHUA_XU_LY' && (
            <Tooltip title="Đánh dấu đã xem">
              <Button size="small" icon={<EyeOutlined />} onClick={() => handleMarkSeen(r.id)} />
            </Tooltip>
          )}
          {r.trangThai !== 'DA_XU_LY' && (
            <Tooltip title="Xử lý cảnh báo">
              <Button
                size="small"
                type="primary"
                icon={<CheckOutlined />}
                onClick={() => { setSelectedAlert(r); setResolveModal(true); }}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Cảnh báo"
        subtitle="Quản lý và xử lý các cảnh báo sức khỏe"
        icon={<AlertOutlined />}
        badge={
          unresolved > 0 && (
            <Badge count={unresolved} style={{ marginLeft: 4 }} />
          )
        }
      />

      <TableToolbar
        filters={[
          <Select
            key="level"
            placeholder="Lọc mức độ"
            style={{ width: 160 }}
            allowClear
            onChange={setFilterLevel}
          >
            <Option value="THAP">Thấp</Option>
            <Option value="TRUNG_BINH">Trung bình</Option>
            <Option value="CAO">Cao</Option>
            <Option value="KHAN_CAP">🚨 Khẩn cấp</Option>
          </Select>,
          <Select
            key="status"
            placeholder="Lọc trạng thái"
            style={{ width: 160 }}
            allowClear
            onChange={setFilterStatus}
          >
            <Option value="CHUA_XU_LY">Chưa xử lý</Option>
            <Option value="DA_XEM">Đã xem</Option>
            <Option value="DA_XU_LY">Đã xử lý</Option>
          </Select>,
        ]}
        count={alerts.length}
        countLabel={`cảnh báo (${unresolved} chưa xử lý)`}
      />

      <DataTable
        columns={columns}
        dataSource={alerts}
        rowKey="id"
        loading={loading}
        totalLabel="cảnh báo"
        rowClassName={(r) => r.mucDo === 'KHAN_CAP' || r.trangThai === 'CHUA_XU_LY' ? 'row-danger' : ''}
      />

      {/* Modal xử lý */}
      <ModalForm
        title="Xử lý cảnh báo"
        open={resolveModal}
        onCancel={() => { setResolveModal(false); form.resetFields(); }}
        onFinish={handleResolve}
        loading={saving}
        saveLabel="Xác nhận xử lý"
        form={form}
        width={520}
      >
        {selectedAlert && (
          <div style={{
            marginBottom: 16,
            padding: '12px 16px',
            background: '#FDEEEE',
            borderRadius: 8,
            borderLeft: '4px solid #E15554',
          }}>
            <strong style={{ color: '#E15554' }}>{selectedAlert.nguoiCaoTuoiTen}</strong>
            <span style={{ color: '#3D5263', marginLeft: 8 }}>{selectedAlert.moTa}</span>
          </div>
        )}
        <Form.Item
          name="ghiChu"
          label="Ghi chú xử lý"
          rules={[{ required: true, message: 'Vui lòng nhập ghi chú xử lý' }]}
        >
          <Input.TextArea rows={4} placeholder="Mô tả cách đã xử lý cảnh báo..." />
        </Form.Item>
      </ModalForm>
    </div>
  );
};

export default AlertsPage;
