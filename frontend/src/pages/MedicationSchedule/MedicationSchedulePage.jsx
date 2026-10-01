// Trang lịch uống thuốc - Theo từng người cao tuổi, trạng thái màu sắc
import React, { useState, useEffect } from 'react';
import { Select, Tag, Space, message } from 'antd';
import { ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined, EyeOutlined } from '@ant-design/icons';
import { getSchedules, updateScheduleStatus } from '../../services/scheduleService';
import { getElders } from '../../services/elderlyService';
import PageHeader from '../../components/PageHeader';
import TableToolbar from '../../components/TableToolbar';
import DataTable from '../../components/DataTable';
import StatusTag, { getMedStatusMap } from '../../components/StatusTag';
import usePermission from '../../hooks/usePermission';
import TableAvatar from '../../components/TableAvatar';
import TableActionButton from '../../components/TableActionButton';
import { formatEntityCode } from '../../utils/displayUtils';
import RecordDetailModal from '../../components/RecordDetailModal';

const { Option } = Select;

const MedicationSchedulePage = () => {
  const { hasPermission } = usePermission();
  const canEdit = hasPermission('QLLICHUONGTHUOC', 'sua');
  const [schedules, setSchedules] = useState([]);
  const [elders, setElders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedElder, setSelectedElder] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [detailRecord, setDetailRecord] = useState(null);

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
      title: 'Mã lịch',
      key: 'maLich',
      width: 115,
      render: (_, record) => <span className="entity-code-badge">{formatEntityCode('LUT', record.id)}</span>,
    },
    {
      title: 'Người cao tuổi',
      dataIndex: 'nguoiCaoTuoiTen',
      key: 'nguoiCaoTuoiTen',
      sorter: (a, b) => a.nguoiCaoTuoiTen.localeCompare(b.nguoiCaoTuoiTen, 'vi'),
      render: (v) => <div className="table-person-cell"><TableAvatar name={v} /><span className="table-person-name">{v}</span></div>,
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
      sorter: (a, b) => (a.trangThaiHom_nay || '').localeCompare(b.trangThaiHom_nay || ''),
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
          <TableActionButton type="view" tooltip="Xem chi tiết" icon={<EyeOutlined />} onClick={() => setDetailRecord(r)} />
          {canEdit && <TableActionButton
            type="view"
            tooltip="Đánh dấu đã uống"
            icon={<CheckCircleOutlined />}
            onClick={() => handleStatusChange(r.id, 'DA_UONG')}
            disabled={r.trangThaiHom_nay === 'DA_UONG'}
          />}
          {canEdit && <TableActionButton
            type="delete"
            tooltip="Đánh dấu bỏ lỡ"
            icon={<CloseCircleOutlined />}
            onClick={() => handleStatusChange(r.id, 'BO_LO')}
            disabled={r.trangThaiHom_nay === 'BO_LO'}
          />}
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
        count={schedules.length}
        countLabel="lịch uống"
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
            <Option value="TU_CHOI">Từ chối</Option>
          </Select>,
        ]}
      />

      <DataTable
        columns={columns}
        dataSource={schedules}
        rowKey="id"
        loading={loading}
        emptyDescription="Chưa có lịch uống thuốc"
        onRow={(record) => ({ onClick: () => setDetailRecord(record) })}
        rowClassName={(r) => r.trangThaiHom_nay === 'BO_LO' ? 'row-danger' : ''}
      />

      <RecordDetailModal
        open={!!detailRecord}
        onClose={() => setDetailRecord(null)}
        title={`Chi tiết lịch uống thuốc — ${detailRecord?.nguoiCaoTuoiTen || ''}`}
        record={detailRecord}
        fields={[
          { label: 'Mã lịch', key: 'id', render: (value) => formatEntityCode('LUT', value) },
          { label: 'Người cao tuổi', key: 'nguoiCaoTuoiTen' },
          { label: 'Thuốc', key: 'tenThuoc' },
          { label: 'Liều dùng', key: 'lieuDung' },
          { label: 'Thời gian dự kiến', key: 'thoiGianDuKien' },
          { label: 'Trạng thái', key: 'trangThaiHom_nay', render: (value) => <StatusTag {...getMedStatusMap(value)} /> },
        ]}
      />
    </div>
  );
};

export default MedicationSchedulePage;
