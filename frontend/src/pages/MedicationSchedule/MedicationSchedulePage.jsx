// Trang lịch uống thuốc - Theo từng người cao tuổi, trạng thái màu sắc
import React, { useState, useEffect } from 'react';
import { Select, Tag, Space, Button, message, Spin } from 'antd';
import { ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { getSchedules, updateScheduleStatus } from '../../services/scheduleService';
import { getElders } from '../../services/elderlyService';
import PageHeader from '../../components/PageHeader';
import TableToolbar from '../../components/TableToolbar';
import DataTable from '../../components/DataTable';
import StatusTag, { getMedStatusMap } from '../../components/StatusTag';

const { Option } = Select;

const MedicationSchedulePage = () => {
  const [schedules, setSchedules] = useState([]);
  const [elders, setElders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedElder, setSelectedElder] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => { getElders().then(setElders); }, []);
  useEffect(() => {
    setLoading(true);
    getSchedules({ nguoiCaoTuoiId: selectedElder, trangThai: filterStatus || undefined })
      .then(setSchedules).finally(() => setLoading(false));
  }, [selectedElder, filterStatus]);

  const handleStatusChange = async (id, newStatus) => {
    const { label } = getMedStatusMap(newStatus);
    await updateScheduleStatus(id, newStatus, label);
    message.success(`Đã cập nhật: ${label}`);
    setSchedules((prev) =>
      prev.map((s) => s.id === id ? { ...s, trangThaiHom_nay: newStatus, trangThaiLabel: label } : s)
    );
  };

  const columns = [
    {
      title: 'Người cao tuổi',
      dataIndex: 'nguoiCaoTuoiTen',
      key: 'nguoiCaoTuoiTen',
      render: (v) => <span style={{ fontWeight: 600, fontSize: 15 }}>{v}</span>,
    },
    {
      title: 'Thuốc',
      dataIndex: 'tenThuoc',
      key: 'tenThuoc',
      render: (v, r) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{v}</div>
          <div style={{ fontSize: 13, color: '#7A93A3' }}>{r.lieuDung}</div>
        </div>
      ),
    },
    {
      title: 'Giờ uống',
      key: 'gio',
      render: (_, r) => (
        <Space direction="vertical" size={4}>
          {r.gioBuoiSang && (
            <Tag icon={<ClockCircleOutlined />} style={{ background: '#FEF6E6', color: '#D4870A', borderColor: '#F5A623' }}>
              ☀️ Sáng: {r.gioBuoiSang}
            </Tag>
          )}
          {r.gioBuoiTrua && (
            <Tag icon={<ClockCircleOutlined />} style={{ background: '#EBF5FB', color: '#2E7D9A', borderColor: '#A8D4E6' }}>
              🌤 Trưa: {r.gioBuoiTrua}
            </Tag>
          )}
          {r.gioBuoiToi && (
            <Tag icon={<ClockCircleOutlined />} style={{ background: '#F0F4F7', color: '#6B7C8A', borderColor: '#C8D6DE' }}>
              🌙 Tối: {r.gioBuoiToi}
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Trạng thái hôm nay',
      dataIndex: 'trangThaiHom_nay',
      key: 'trangThai',
      render: (v) => {
        const { status, label } = getMedStatusMap(v || 'CHUA_DEN_GIO');
        return <StatusTag status={status} label={label} />;
      },
    },
    {
      title: 'Cập nhật',
      key: 'action',
      fixed: 'right',
      width: 160,
      render: (_, r) => (
        <Space>
          <Button
            size="small"
            type="primary"
            icon={<CheckCircleOutlined />}
            onClick={() => handleStatusChange(r.id, 'DA_UONG')}
            disabled={r.trangThaiHom_nay === 'DA_UONG'}
          >
            Đã uống
          </Button>
          <Button
            size="small"
            danger
            icon={<CloseCircleOutlined />}
            onClick={() => handleStatusChange(r.id, 'BO_LO')}
            disabled={r.trangThaiHom_nay === 'BO_LO'}
          >
            Bỏ lỡ
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Lịch uống thuốc"
        subtitle="Theo dõi và cập nhật trạng thái uống thuốc theo từng người cao tuổi"
        icon={<ClockCircleOutlined />}
      />

      <TableToolbar
        filters={[
          <Select
            key="elder"
            placeholder="Chọn người cao tuổi"
            style={{ width: 240 }}
            allowClear
            onChange={setSelectedElder}
          >
            {elders.map((e) => <Option key={e.id} value={e.id}>{e.hoTen}</Option>)}
          </Select>,
          <Select
            key="status"
            placeholder="Lọc trạng thái"
            style={{ width: 180 }}
            allowClear
            onChange={setFilterStatus}
          >
            <Option value="DA_UONG">✅ Đã uống</Option>
            <Option value="BO_LO">❌ Bỏ lỡ</Option>
            <Option value="CHUA_DEN_GIO">⏰ Chưa đến giờ</Option>
          </Select>,
        ]}
        count={schedules.length}
        countLabel="lịch uống"
      />

      <DataTable
        columns={columns}
        dataSource={schedules}
        rowKey="id"
        loading={loading}
        totalLabel="lịch uống"
        rowClassName={(r) => r.trangThaiHom_nay === 'BO_LO' ? 'row-danger' : ''}
      />
    </div>
  );
};

export default MedicationSchedulePage;
