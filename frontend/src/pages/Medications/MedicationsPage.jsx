import React, { useEffect, useState } from 'react';
import { Button, Col, Form, Input, message, Popconfirm, Row, Space } from 'antd';
import {
  EditOutlined, EyeOutlined, MedicineBoxOutlined, PlusOutlined, StopOutlined,
} from '@ant-design/icons';
import {
  createMedication, deleteMedication, getMedications, updateMedication,
} from '../../services/medicationService';
import PageHeader from '../../components/PageHeader';
import TableToolbar from '../../components/TableToolbar';
import DataTable from '../../components/DataTable';
import ModalForm, { FormSection } from '../../components/ModalForm';
import usePermission from '../../hooks/usePermission';
import TableActionButton from '../../components/TableActionButton';
import RecordDetailModal from '../../components/RecordDetailModal';
import MedicationQuickTabs from '../../components/MedicationQuickTabs';
import StatusTag from '../../components/StatusTag';
import ElderlyMedicationsPanel from './ElderlyMedicationsPanel';

const MedicationsPage = () => {
  const { hasPermission } = usePermission();
  const canCreate = hasPermission('QLTHUOC', 'them');
  const canEdit = hasPermission('QLTHUOC', 'sua');
  const canDelete = hasPermission('QLTHUOC', 'xoa');
  const canViewPersonal = hasPermission('QLHOSONCT', 'xem') && hasPermission('QLLICHUONGTHUOC', 'xem');
  const canCreatePrescription = hasPermission('QLLICHUONGTHUOC', 'them');
  const [activeView, setActiveView] = useState('personal');
  const showPersonal = canViewPersonal && activeView === 'personal';
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

  useEffect(() => {
    load();
    // Tải lại danh mục theo từ khóa phía backend.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const handleAdd = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const handleEdit = (record) => {
    setEditing(record);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const handleDisable = async (id) => {
    await deleteMedication(id);
    message.success('Đã ngừng cho chọn thuốc trong đơn mới');
    load();
  };

  const handleSave = async (values) => {
    setSaving(true);
    try {
      if (editing) {
        await updateMedication(editing.id, { ...editing, ...values });
        message.success('Cập nhật thuốc thành công');
      } else {
        await createMedication(values);
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
      title: 'Tên thuốc',
      dataIndex: 'tenThuoc',
      key: 'tenThuoc',
      width: 210,
      sorter: (a, b) => a.tenThuoc.localeCompare(b.tenThuoc, 'vi'),
      render: (value, record) => (
        <div className="medication-catalog-name">
          <span className="medication-catalog-icon"><MedicineBoxOutlined /></span>
          <div>
            <strong>{value}</strong>
            <StatusTag
              size="small"
              status={record.trangThai === 'DANG_SU_DUNG' ? 'success' : 'inactive'}
              label={record.trangThaiLabel}
            />
          </div>
        </div>
      ),
    },
    {
      title: 'Hoạt chất',
      dataIndex: 'hoatChat',
      key: 'hoatChat',
      width: 180,
      render: (value) => value || '—',
    },
    {
      title: 'Đơn vị tính',
      dataIndex: 'donViTinh',
      key: 'donViTinh',
      width: 125,
      render: (value) => <span className="medication-unit-badge">{value || '—'}</span>,
    },
    {
      title: 'Nhà sản xuất',
      dataIndex: 'nhaSanXuat',
      key: 'nhaSanXuat',
      width: 180,
      render: (value) => value || '—',
    },
    {
      title: 'Cách dùng',
      dataIndex: 'cachDung',
      key: 'cachDung',
      width: 260,
      render: (value) => value || 'Chưa cập nhật',
    },
    {
      title: 'Tác dụng phụ',
      dataIndex: 'tacDungPhu',
      key: 'tacDungPhu',
      width: 250,
      render: (value) => value || 'Chưa ghi nhận',
    },
    {
      title: 'Thao tác',
      key: 'action',
      fixed: 'right',
      width: 145,
      render: (_, record) => {
        const isActive = record.trangThai === 'DANG_SU_DUNG';
        return (
          <Space>
            <TableActionButton type="view" tooltip="Xem chi tiết" icon={<EyeOutlined />} onClick={() => setDetailRecord(record)} />
            {canEdit && (
              <TableActionButton type="edit" tooltip="Chỉnh sửa" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
            )}
            {canDelete && isActive && (
              <Popconfirm
                title="Ngừng cho chọn thuốc này trong đơn mới?"
                description="Thuốc sẽ được giữ lại trong dữ liệu nhưng không còn dùng để tạo đơn mới."
                onConfirm={() => handleDisable(record.id)}
                okText="Ngừng dùng"
                cancelText="Hủy"
              >
                <TableActionButton type="delete" tooltip="Ngừng chọn trong đơn mới" icon={<StopOutlined />} />
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div className="medication-management-page medication-catalog-page">
      <PageHeader
        title={showPersonal ? 'Thuốc của người cao tuổi' : 'Kho thuốc tham chiếu'}
        subtitle={showPersonal
          ? 'Xem thuốc trong đơn của từng người cao tuổi được chăm sóc'
          : 'Kho thông tin thuốc dùng chung để chọn khi nhập đơn, không phải thuốc của tất cả người cao tuổi'}
        icon={<MedicineBoxOutlined />}
        extra={!showPersonal && canCreate && (
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} size="large">
            Thêm thuốc
          </Button>
        )}
      />

      <MedicationQuickTabs />

      {canViewPersonal && (
        <div className="medication-view-tabs" role="tablist" aria-label="Chọn cách xem thuốc">
          <button type="button" role="tab" aria-selected={showPersonal} className={showPersonal ? 'is-active' : ''} onClick={() => setActiveView('personal')}>
            Thuốc của NCT
          </button>
          <button type="button" role="tab" aria-selected={!showPersonal} className={!showPersonal ? 'is-active' : ''} onClick={() => setActiveView('catalog')}>
            Kho thuốc tham chiếu
          </button>
        </div>
      )}

      {showPersonal ? <ElderlyMedicationsPanel canCreatePrescription={canCreatePrescription} /> : (

      <section className="medication-list-panel">
        <div className="medication-list-heading">
          <div>
            <h3>Kho thuốc tham chiếu</h3>
            <p>Thuốc dùng chung để nhập đơn. Chọn “Thuốc của NCT” để xem thuốc của một người cụ thể.</p>
          </div>
          <span>{medications.length} thuốc</span>
        </div>

        <TableToolbar
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Tìm tên thuốc hoặc hoạt chất..."
          searchWidth={360}
        />

        <DataTable
          columns={columns}
          dataSource={medications}
          rowKey="id"
          loading={loading}
          onRow={(record) => ({ onClick: () => setDetailRecord(record) })}
          rowClassName={(record) => record.trangThai === 'NGUNG_SU_DUNG' ? 'row-inactive' : ''}
          emptyDescription="Chưa có thuốc trong danh mục"
          emptyAction={canCreate && (
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>Thêm thuốc</Button>
          )}
        />
      </section>
      )}

      <RecordDetailModal
        open={!!detailRecord}
        onClose={() => setDetailRecord(null)}
        title={`Chi tiết thuốc — ${detailRecord?.tenThuoc || ''}`}
        record={detailRecord}
        fields={[
          { label: 'Tên thuốc', key: 'tenThuoc' },
          { label: 'Hoạt chất', key: 'hoatChat' },
          { label: 'Đơn vị tính', key: 'donViTinh' },
          { label: 'Nhà sản xuất', key: 'nhaSanXuat' },
          { label: 'Trạng thái', key: 'trangThaiLabel' },
          { label: 'Cách dùng', key: 'cachDung', span: 2 },
          { label: 'Tác dụng phụ', key: 'tacDungPhu', span: 2 },
          { label: 'Mô tả', key: 'moTa', span: 2 },
        ]}
      />

      <ModalForm
        title={editing ? 'Chỉnh sửa thông tin thuốc' : 'Thêm thuốc mới'}
        subtitle="Cập nhật thông tin dược phẩm đúng theo danh mục sử dụng"
        icon={<MedicineBoxOutlined />}
        mode={editing ? 'edit' : 'create'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onFinish={handleSave}
        loading={saving}
        form={form}
      >
        <FormSection title="Thông tin cơ bản" description="Thông tin nhận diện thuốc">
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

        <FormSection title="Hướng dẫn và lưu ý" description="Cách dùng cùng thông tin an toàn đã được ghi nhận">
          <Form.Item name="cachDung" label="Cách dùng">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} placeholder="VD: Uống sau ăn, ngày 2 lần" />
          </Form.Item>
          <Form.Item name="tacDungPhu" label="Tác dụng phụ">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} placeholder="Nhập các tác dụng phụ cần lưu ý" />
          </Form.Item>
          <Form.Item name="moTa" label="Mô tả">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} placeholder="Thông tin bổ sung về thuốc" />
          </Form.Item>
        </FormSection>
      </ModalForm>
    </div>
  );
};

export default MedicationsPage;
