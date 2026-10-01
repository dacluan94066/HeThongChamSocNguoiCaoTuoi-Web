// Trang danh mục thuốc - CRUD thuốc
import React, { useState, useEffect } from 'react';
import { Tag, Space, Button, Popconfirm, Form, Input, message, Row, Col } from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, MedicineBoxOutlined,
} from '@ant-design/icons';
import { getMedications, createMedication, updateMedication, deleteMedication } from '../../services/medicationService';
import PageHeader from '../../components/PageHeader';
import TableToolbar from '../../components/TableToolbar';
import DataTable from '../../components/DataTable';
import ModalForm, { FormSection } from '../../components/ModalForm';
import usePermission from '../../hooks/usePermission';
import TableActionButton from '../../components/TableActionButton';
import { formatEntityCode } from '../../utils/displayUtils';
import RecordDetailModal from '../../components/RecordDetailModal';

const MedicationsPage = () => {
  const { hasPermission } = usePermission();
  const canCreate = hasPermission('QLTHUOC', 'them');
  const canEdit = hasPermission('QLTHUOC', 'sua');
  const canDelete = hasPermission('QLTHUOC', 'xoa');
  const [medications, setMedications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailRecord, setDetailRecord] = useState(null);
  const [form] = Form.useForm();

  const load = () => {
    setLoading(true);
    getMedications({ search }).then(setMedications).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [search]);

  const handleAdd = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const handleEdit = (r) => { setEditing(r); form.setFieldsValue(r); setModalOpen(true); };

  const handleDelete = async (id) => {
    await deleteMedication(id);
    message.success('Xóa thuốc thành công');
    load();
  };

  const handleSave = async (values) => {
    setSaving(true);
    try {
      if (editing) {
        await updateMedication(editing.id, values);
        message.success('Cập nhật thành công');
      } else {
        await createMedication({ ...values, trangThai: 'DANG_SU_DUNG', trangThaiLabel: 'Đang sử dụng' });
        message.success('Thêm thuốc thành công');
      }
      setModalOpen(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      title: 'Mã thuốc',
      dataIndex: 'maThuoc',
      key: 'maThuoc',
      width: 90,
      render: (_, record) => <span className="entity-code-badge">{formatEntityCode('THUOC', record.id)}</span>,
    },
    {
      title: 'Tên thuốc',
      key: 'tenThuoc',
      sorter: (a, b) => a.tenThuoc.localeCompare(b.tenThuoc, 'vi'),
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>
            <MedicineBoxOutlined style={{ color: '#2E7D9A', marginRight: 8 }} />
            {r.tenThuoc}
          </div>
          <div style={{ fontSize: 13, color: '#7A93A3' }}>Hoạt chất: {r.hoatChat}</div>
        </div>
      ),
    },
    {
      title: 'Nhóm thuốc',
      dataIndex: 'nhomThuoc',
      key: 'nhomThuoc',
      render: (v) => (
        <Tag style={{ background: '#FEF6E6', color: '#D4870A', borderColor: '#F5A623' }}>{v}</Tag>
      ),
    },
    { title: 'Đơn vị tính', dataIndex: 'donViTinh', key: 'donViTinh', width: 110 },
    { title: 'Cách dùng', dataIndex: 'cachDung', key: 'cachDung' },
    { title: 'Nhà SX', dataIndex: 'nhaSanXuat', key: 'nhaSanXuat' },
    {
      title: 'Hành động',
      key: 'action',
      fixed: 'right',
      width: 132,
      render: (_, r) => (
        <Space>
          <TableActionButton type="view" tooltip="Xem chi tiết" icon={<EyeOutlined />} onClick={() => setDetailRecord(r)} />
          {canEdit && <TableActionButton type="edit" tooltip="Chỉnh sửa" icon={<EditOutlined />} onClick={() => handleEdit(r)} />}
          {canDelete && <Popconfirm title="Xóa thuốc này?" onConfirm={() => handleDelete(r.id)} okText="Xóa" cancelText="Hủy">
            <TableActionButton type="delete" tooltip="Xóa" icon={<DeleteOutlined />} />
          </Popconfirm>}
          {!canEdit && !canDelete && <span style={{ color: '#BFBFBF' }}>—</span>}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Danh mục thuốc"
        subtitle="Quản lý danh sách thuốc trong hệ thống"
        icon={<MedicineBoxOutlined />}
        count={medications.length}
        countLabel="loại thuốc"
        extra={canCreate && (
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} size="large">
            Thêm thuốc mới
          </Button>
        )}
      />

      <TableToolbar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Tìm tên thuốc, hoạt chất..."
      />

      <DataTable
        columns={columns}
        dataSource={medications}
        rowKey="id"
        loading={loading}
        onRow={(record) => ({ onClick: () => setDetailRecord(record) })}
        emptyDescription="Chưa có thuốc trong danh mục"
        emptyAction={canCreate && <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>Thêm thuốc mới</Button>}
      />

      <RecordDetailModal
        open={!!detailRecord}
        onClose={() => setDetailRecord(null)}
        title={`Chi tiết thuốc — ${detailRecord?.tenThuoc || ''}`}
        record={detailRecord}
        fields={[
          { label: 'Mã thuốc', key: 'id', render: (value) => formatEntityCode('THUOC', value) },
          { label: 'Tên thuốc', key: 'tenThuoc' },
          { label: 'Hoạt chất', key: 'hoatChat' },
          { label: 'Nhóm thuốc', key: 'nhomThuoc' },
          { label: 'Đơn vị tính', key: 'donViTinh' },
          { label: 'Nhà sản xuất', key: 'nhaSanXuat' },
          { label: 'Cách dùng', key: 'cachDung', span: 2 },
          { label: 'Chống chỉ định', key: 'chongChiDinh', span: 2 },
          { label: 'Tác dụng phụ', key: 'tacDungPhu', span: 2 },
        ]}
      />

      <ModalForm
        title={editing ? 'Chỉnh sửa thông tin thuốc' : 'Thêm thuốc mới'}
        subtitle="Cập nhật đầy đủ thông tin thuốc và hướng dẫn sử dụng"
        icon={<MedicineBoxOutlined />}
        mode={editing ? 'edit' : 'create'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onFinish={handleSave}
        loading={saving}
        form={form}
      >
        <FormSection title="Thông tin cơ bản" description="Thông tin nhận diện và phân loại thuốc">
          <Row gutter={18}>
            <Col xs={24} md={12}>
              <Form.Item name="tenThuoc" label="Tên thuốc" rules={[{ required: true, message: 'Vui lòng nhập tên thuốc' }]}>
                <Input placeholder="VD: Paracetamol 500mg" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="hoatChat" label="Hoạt chất">
                <Input placeholder="VD: Paracetamol" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="nhomThuoc" label="Nhóm thuốc">
                <Input placeholder="VD: Giảm đau, hạ sốt" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="donViTinh" label="Đơn vị tính" rules={[{ required: true, message: 'Vui lòng nhập đơn vị tính' }]}>
                <Input placeholder="VD: Viên, hộp, chai" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="nhaSanXuat" label="Nhà sản xuất">
                <Input placeholder="VD: Dược Hậu Giang" />
              </Form.Item>
            </Col>
          </Row>
        </FormSection>

        <FormSection title="Hướng dẫn sử dụng" description="Cách dùng và các lưu ý an toàn">
          <Form.Item name="cachDung" label="Cách dùng">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} placeholder="VD: Uống sau ăn, ngày 2 lần" />
          </Form.Item>
          <Form.Item name="chongChiDinh" label="Chống chỉ định">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} placeholder="Nhập trường hợp không nên sử dụng thuốc" />
          </Form.Item>
          <Form.Item name="tacDungPhu" label="Tác dụng phụ">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} placeholder="Nhập các tác dụng phụ cần lưu ý" />
          </Form.Item>
        </FormSection>
      </ModalForm>
    </div>
  );
};

export default MedicationsPage;
