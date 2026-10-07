// Trang cảnh báo - Lọc, xử lý và đánh dấu đã xem
import React, { useState, useEffect } from 'react';
import { Select, Tag, Form, Input, message, Badge, Space } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { AlertOutlined, CheckCircleOutlined, CheckOutlined, EyeOutlined } from '@ant-design/icons';
import { getAlerts, markAlertSeen, resolveAlert } from '../../services/alertService';
import { getCurrentUser } from '../../services/authService';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import TableToolbar from '../../components/TableToolbar';
import DataTable from '../../components/DataTable';
import ModalForm, { FormSection } from '../../components/ModalForm';
import StatusTag, { getAlertLevelStatus, getAlertStatusMap } from '../../components/StatusTag';
import usePermission from '../../hooks/usePermission';
import TableAvatar from '../../components/TableAvatar';
import TableActionButton from '../../components/TableActionButton';
import { formatEntityCode } from '../../utils/displayUtils';
import RecordDetailModal from '../../components/RecordDetailModal';
import { getSocket } from '../../services/socketClient';

const { Option } = Select;

const MUC_DO_ORDER = { THAP: 1, TRUNG_BINH: 2, CAO: 3, KHAN_CAP: 4 };

const AlertsPage = () => {
  const { hasPermission } = usePermission();
  const canEdit = hasPermission('QLCANHBAO', 'sua');
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterLevel, setFilterLevel] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [resolveModal, setResolveModal] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [detailRecord, setDetailRecord] = useState(null);
  const [form] = Form.useForm();
  const currentUser = getCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightedAlertId = searchParams.get('highlight');

  const load = () => {
    setLoading(true);
    getAlerts({ mucDo: filterLevel || undefined, trangThai: filterStatus || undefined })
      .then((data) => {
        data.sort((a, b) => (MUC_DO_ORDER[b.mucDo] || 0) - (MUC_DO_ORDER[a.mucDo] || 0));
        setAlerts(data);
      }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filterLevel, filterStatus]);

  useEffect(() => {
    if (!highlightedAlertId) return undefined;

    let cancelled = false;
    const openHighlightedAlert = async () => {
      try {
        setLoading(true);
        const data = await getAlerts();
        if (cancelled) return;
        data.sort((a, b) => (MUC_DO_ORDER[b.mucDo] || 0) - (MUC_DO_ORDER[a.mucDo] || 0));
        setFilterLevel('');
        setFilterStatus('');
        setAlerts(data);

        const target = data.find((item) => String(item.id) === String(highlightedAlertId));
        if (target) {
          setDetailRecord(target);
        } else {
          message.warning('Không tìm thấy cảnh báo cần xem hoặc bạn không có quyền truy cập.');
        }
      } catch {
        if (!cancelled) {
          message.error('Không thể tải chi tiết cảnh báo. Vui lòng thử lại.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          const nextParams = new URLSearchParams(searchParams);
          nextParams.delete('highlight');
          setSearchParams(nextParams, { replace: true });
        }
      }
    };

    openHighlightedAlert();
    return () => {
      cancelled = true;
    };
  }, [highlightedAlertId, searchParams, setSearchParams]);

  useEffect(() => {
    const socket = getSocket();
    const refreshAlerts = () => {
      getAlerts({ mucDo: filterLevel || undefined, trangThai: filterStatus || undefined })
        .then((data) => {
          data.sort((a, b) => (MUC_DO_ORDER[b.mucDo] || 0) - (MUC_DO_ORDER[a.mucDo] || 0));
          setAlerts(data);
        });
    };

    socket.on('canhbao:new', refreshAlerts);
    socket.on('canhbao:updated', refreshAlerts);
    return () => {
      socket.off('canhbao:new', refreshAlerts);
      socket.off('canhbao:updated', refreshAlerts);
    };
  }, [filterLevel, filterStatus]);

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
      title: 'Mã cảnh báo',
      key: 'maCanhBao',
      width: 125,
      render: (_, record) => <span className="entity-code-badge">{formatEntityCode('CB', record.id)}</span>,
    },
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
      sorter: (a, b) => a.nguoiCaoTuoiTen.localeCompare(b.nguoiCaoTuoiTen, 'vi'),
      render: (v) => <div className="table-person-cell"><TableAvatar name={v} /><span className="table-person-name">{v}</span></div>,
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
      sorter: (a, b) => a.trangThai.localeCompare(b.trangThai),
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
          <TableActionButton type="view" tooltip="Xem chi tiết" icon={<EyeOutlined />} onClick={() => setDetailRecord(r)} />
          {canEdit && r.trangThai === 'CHUA_XU_LY' && (
            <TableActionButton type="edit" tooltip="Đánh dấu đã xem" icon={<CheckCircleOutlined />} onClick={() => handleMarkSeen(r.id)} />
          )}
          {canEdit && r.trangThai !== 'DA_XU_LY' && (
            <TableActionButton type="edit" tooltip="Xử lý cảnh báo" icon={<CheckOutlined />} onClick={() => { setSelectedAlert(r); setResolveModal(true); }} />
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
        count={alerts.length}
        countLabel="cảnh báo"
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
      />

      <DataTable
        columns={columns}
        dataSource={alerts}
        rowKey="id"
        loading={loading}
        emptyDescription="Hiện chưa có cảnh báo nào"
        onRow={(record) => ({ onClick: () => setDetailRecord(record) })}
        rowClassName={(r) => r.mucDo === 'KHAN_CAP' || r.trangThai === 'CHUA_XU_LY' ? 'row-danger' : ''}
      />

      <RecordDetailModal
        open={!!detailRecord}
        onClose={() => setDetailRecord(null)}
        title={`Chi tiết cảnh báo — ${detailRecord?.nguoiCaoTuoiTen || ''}`}
        record={detailRecord}
        fields={[
          { label: 'Mã cảnh báo', key: 'id', render: (value) => formatEntityCode('CB', value) },
          { label: 'Người cao tuổi', key: 'nguoiCaoTuoiTen' },
          { label: 'Loại cảnh báo', key: 'loaiCanhBaoLabel' },
          { label: 'Mức độ', key: 'mucDo', render: (value) => <StatusTag {...getAlertLevelStatus(value)} /> },
          { label: 'Thời gian', key: 'thoiGianPhatHien', render: (value) => dayjs(value).format('DD/MM/YYYY HH:mm') },
          { label: 'Trạng thái', key: 'trangThai', render: (value) => <StatusTag {...getAlertStatusMap(value)} /> },
          { label: 'Mô tả', key: 'moTa', span: 2 },
          { label: 'Điểm ưu tiên', key: 'diemUuTien', render: (value, record) => `${value ?? 0}/100 — ${record.uuTienLabel || ''}` },
          { label: 'Vượt thời gian phản hồi', key: 'quaSla', render: (value) => value ? 'Có' : 'Không' },
          { label: 'Lý do ưu tiên', key: 'lyDoUuTien', span: 2, render: (value) => Array.isArray(value) ? value.join(' • ') : value },
          { label: 'Hành động đề xuất', key: 'khuyenNghi', span: 2 },
          { label: 'Người xử lý', key: 'nguoiXuLy' },
          { label: 'Thời gian xử lý', key: 'thoiGianXuLy', render: (value) => value ? dayjs(value).format('DD/MM/YYYY HH:mm') : null },
          { label: 'Ghi chú xử lý', key: 'ghiChuXuLy', span: 2 },
        ]}
      />

      {/* Modal xử lý */}
      <ModalForm
        title="Xử lý cảnh báo"
        subtitle="Ghi nhận nội dung và kết quả xử lý cảnh báo sức khỏe"
        icon={<AlertOutlined />}
        saveIcon={<CheckOutlined />}
        open={resolveModal}
        onCancel={() => { setResolveModal(false); form.resetFields(); }}
        onFinish={handleResolve}
        loading={saving}
        saveLabel="Xác nhận xử lý"
        form={form}
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
        <FormSection title="Kết quả xử lý" description="Mô tả hành động đã thực hiện và tình trạng sau xử lý">
          <Form.Item
            name="ghiChu"
            label="Ghi chú xử lý"
            rules={[{ required: true, message: 'Vui lòng nhập ghi chú xử lý cảnh báo' }]}
          >
            <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} placeholder="Mô tả cách đã xử lý cảnh báo và kết quả hiện tại..." />
          </Form.Item>
        </FormSection>
      </ModalForm>
    </div>
  );
};

export default AlertsPage;
