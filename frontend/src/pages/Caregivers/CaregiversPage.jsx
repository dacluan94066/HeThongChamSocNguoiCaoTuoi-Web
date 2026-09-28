// Trang quản lý người chăm sóc - Danh sách và phân công
import React, { useState, useEffect } from 'react';
import { Space, Avatar, Tag, Button, Row, Col, Card, Tooltip } from 'antd';
import { PlusOutlined, EditOutlined, UserOutlined, TeamOutlined } from '@ant-design/icons';
import { getCaregivers } from '../../services/caregiverService';
import PageHeader from '../../components/PageHeader';
import TableToolbar from '../../components/TableToolbar';
import DataTable from '../../components/DataTable';

const CaregiversPage = () => {
  const [caregivers, setCaregivers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    getCaregivers({ search }).then(setCaregivers).finally(() => setLoading(false));
  }, [search]);

  const totalPhuTrach = caregivers.reduce((sum, c) => sum + (c.soNguoiPhuTrach || 0), 0);

  const columns = [
    {
      title: 'Nhân viên',
      key: 'hoTen',
      render: (_, r) => (
        <Space>
          <Avatar icon={<UserOutlined />} style={{ background: '#4CAF93' }} size={36} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{r.hoTen}</div>
            <div style={{ fontSize: 13, color: '#7A93A3' }}>{r.maNhanVien}</div>
          </div>
        </Space>
      ),
    },
    { title: 'Điện thoại', dataIndex: 'soDienThoai', key: 'soDienThoai' },
    { title: 'Trình độ', dataIndex: 'trinhDoChuyenMon', key: 'trinhDoChuyenMon' },
    {
      title: 'Kinh nghiệm',
      dataIndex: 'namKinhNghiem',
      key: 'namKinhNghiem',
      render: (v) => `${v} năm`,
    },
    {
      title: 'Người phụ trách',
      key: 'phuTrach',
      render: (_, r) => (
        <Space wrap>
          {(r.nguoiCaoTuoiTen || []).map((ten) => (
            <Tag
              key={ten}
              style={{ background: '#EBF5FB', color: '#2E7D9A', borderColor: '#A8D4E6' }}
            >
              {ten}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'trangThaiLabel',
      key: 'trangThai',
      render: (v) => (
        <Tag style={{ background: '#E8F8F5', color: '#367A65', borderColor: '#A8DFCE', fontWeight: 600 }}>
          {v}
        </Tag>
      ),
    },
    {
      title: 'Hành động',
      key: 'action',
      fixed: 'right',
      width: 80,
      render: () => (
        <Tooltip title="Chỉnh sửa">
          <Button size="small" icon={<EditOutlined />} />
        </Tooltip>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Người chăm sóc"
        subtitle="Quản lý danh sách nhân viên và phân công chăm sóc"
        icon={<TeamOutlined />}
        extra={
          <Button type="primary" icon={<PlusOutlined />} size="large">
            Thêm người chăm sóc
          </Button>
        }
      />

      {/* Thống kê nhanh */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={8}>
          <Card
            size="small"
            style={{ borderRadius: 10, borderLeft: '4px solid #4CAF93', boxShadow: 'var(--shadow-card)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <TeamOutlined style={{ fontSize: 28, color: '#4CAF93' }} />
              <div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#1A2E3B' }}>{caregivers.length}</div>
                <div style={{ fontSize: 14, color: '#7A93A3' }}>Tổng nhân viên</div>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card
            size="small"
            style={{ borderRadius: 10, borderLeft: '4px solid #2E7D9A', boxShadow: 'var(--shadow-card)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <UserOutlined style={{ fontSize: 28, color: '#2E7D9A' }} />
              <div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#1A2E3B' }}>{totalPhuTrach}</div>
                <div style={{ fontSize: 14, color: '#7A93A3' }}>Tổng NCT phụ trách</div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      <TableToolbar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Tìm theo tên, mã nhân viên..."
        count={caregivers.length}
        countLabel="nhân viên"
      />

      <DataTable
        columns={columns}
        dataSource={caregivers}
        rowKey="id"
        loading={loading}
        totalLabel="nhân viên"
      />
    </div>
  );
};

export default CaregiversPage;
