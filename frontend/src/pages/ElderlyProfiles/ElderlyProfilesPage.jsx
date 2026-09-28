// Trang hồ sơ người cao tuổi - Danh sách và chi tiết
import React, { useState, useEffect } from 'react';
import { Space, Avatar, Tag, Button, Modal, Descriptions, Tooltip } from 'antd';
import { PlusOutlined, EyeOutlined, EditOutlined, UserOutlined, HeartOutlined } from '@ant-design/icons';
import { getElders } from '../../services/elderlyService';
import PageHeader from '../../components/PageHeader';
import TableToolbar from '../../components/TableToolbar';
import DataTable from '../../components/DataTable';
import StatusTag, { getElderStatusMap } from '../../components/StatusTag';

const ElderlyProfilesPage = () => {
  const [elders, setElders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    setLoading(true);
    getElders({ search }).then(setElders).finally(() => setLoading(false));
  }, [search]);

  const handleView = (record) => {
    setSelected(record);
    setDetailOpen(true);
  };

  const columns = [
    {
      title: 'Mã hồ sơ',
      dataIndex: 'maHoSo',
      key: 'maHoSo',
      width: 100,
      render: (v) => (
        <Tag style={{ background: '#EBF5FB', color: '#2E7D9A', borderColor: '#A8D4E6', fontWeight: 600 }}>
          {v}
        </Tag>
      ),
    },
    {
      title: 'Họ và tên',
      key: 'hoTen',
      render: (_, r) => (
        <Space>
          <Avatar
            icon={<UserOutlined />}
            style={{ background: r.gioiTinh === 'Nam' ? '#2E7D9A' : '#eb2f96' }}
            size={36}
          />
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{r.hoTen}</div>
            <div style={{ fontSize: 13, color: '#7A93A3' }}>{r.tuoi} tuổi • {r.gioiTinh}</div>
          </div>
        </Space>
      ),
    },
    { title: 'Nhóm máu', dataIndex: 'nhomMau', key: 'nhomMau', width: 90 },
    {
      title: 'Bệnh nền',
      dataIndex: 'benhNen',
      key: 'benhNen',
      render: (v) => (
        <Space wrap>
          {(v || []).slice(0, 2).map((b) => (
            <Tag key={b} style={{ background: '#FEF6E6', color: '#D4870A', borderColor: '#F5A623' }}>
              {b}
            </Tag>
          ))}
          {v?.length > 2 && <Tag>{`+${v.length - 2}`}</Tag>}
        </Space>
      ),
    },
    { title: 'Người chăm sóc', dataIndex: 'nguoiChamSocTen', key: 'nguoiChamSocTen' },
    {
      title: 'Trạng thái',
      dataIndex: 'trangThai',
      key: 'trangThai',
      render: (v, r) => {
        const { status } = getElderStatusMap(v);
        return <StatusTag status={status} label={r.trangThaiLabel} />;
      },
    },
    {
      title: 'Hành động',
      key: 'action',
      fixed: 'right',
      width: 100,
      render: (_, r) => (
        <Space>
          <Tooltip title="Xem chi tiết">
            <Button size="small" icon={<EyeOutlined />} onClick={() => handleView(r)} />
          </Tooltip>
          <Tooltip title="Chỉnh sửa">
            <Button size="small" icon={<EditOutlined />} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Hồ sơ người cao tuổi"
        subtitle="Quản lý thông tin cá nhân và bệnh lý của người cao tuổi"
        icon={<HeartOutlined />}
        extra={
          <Button type="primary" icon={<PlusOutlined />} size="large">
            Thêm hồ sơ mới
          </Button>
        }
      />

      <TableToolbar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Tìm theo tên, mã hồ sơ..."
        count={elders.length}
        countLabel="người cao tuổi"
      />

      <DataTable
        columns={columns}
        dataSource={elders}
        rowKey="id"
        loading={loading}
        totalLabel="người cao tuổi"
      />

      {/* Modal chi tiết */}
      <Modal
        title={`Chi tiết hồ sơ — ${selected?.hoTen}`}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={<Button onClick={() => setDetailOpen(false)} size="large">Đóng</Button>}
        width={720}
      >
        {selected && (
          <Descriptions bordered column={2} size="middle" style={{ marginTop: 16 }}>
            <Descriptions.Item label="Họ và tên" span={2}><strong>{selected.hoTen}</strong></Descriptions.Item>
            <Descriptions.Item label="Ngày sinh">{selected.ngaySinh}</Descriptions.Item>
            <Descriptions.Item label="Giới tính">{selected.gioiTinh}</Descriptions.Item>
            <Descriptions.Item label="CMND/CCCD">{selected.cmnd}</Descriptions.Item>
            <Descriptions.Item label="Nhóm máu">{selected.nhomMau}</Descriptions.Item>
            <Descriptions.Item label="Số điện thoại">{selected.soDienThoai}</Descriptions.Item>
            <Descriptions.Item label="Người chăm sóc">{selected.nguoiChamSocTen}</Descriptions.Item>
            <Descriptions.Item label="Địa chỉ" span={2}>{selected.diaChiThuongTru}</Descriptions.Item>
            <Descriptions.Item label="Bệnh nền" span={2}>
              <Space wrap>
                {(selected.benhNen || []).map((b) => (
                  <Tag key={b} style={{ background: '#FEF6E6', color: '#D4870A', borderColor: '#F5A623' }}>{b}</Tag>
                ))}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="Dị ứng" span={2}>
              {selected.diUng?.length > 0
                ? <Space wrap>{selected.diUng.map((d) => <Tag key={d} color="red">{d}</Tag>)}</Space>
                : <span style={{ color: '#7A93A3' }}>Không có</span>
              }
            </Descriptions.Item>
            <Descriptions.Item label="Tiền sử bệnh lý" span={2}>{selected.tieuSuBenhLy}</Descriptions.Item>
            <Descriptions.Item label="Ghi chú" span={2}>{selected.ghiChu}</Descriptions.Item>
            <Descriptions.Item label="Trạng thái" span={2}>
              <StatusTag status={getElderStatusMap(selected.trangThai).status} label={selected.trangThaiLabel} />
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};

export default ElderlyProfilesPage;
