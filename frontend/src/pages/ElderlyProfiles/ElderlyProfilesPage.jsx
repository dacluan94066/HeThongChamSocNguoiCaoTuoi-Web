import React, { useEffect, useState } from 'react';
import {
  Button, Col, DatePicker, Descriptions, Form, Input, message, Modal,
  Popconfirm, Row, Select, Space, Tag,
} from 'antd';
import {
  DeleteOutlined, EditOutlined, EyeOutlined, HeartOutlined, PlusOutlined, UserAddOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  assignElderCaregiver, createElder, deleteElder, getElders, updateElder,
} from '../../services/elderlyService';
import { getCaregivers } from '../../services/caregiverService';
import PageHeader from '../../components/PageHeader';
import TableToolbar from '../../components/TableToolbar';
import DataTable from '../../components/DataTable';
import StatusTag, { getElderStatusMap } from '../../components/StatusTag';
import TableAvatar from '../../components/TableAvatar';
import TableActionButton from '../../components/TableActionButton';
import usePermission from '../../hooks/usePermission';
import ModalForm, { FormSection } from '../../components/ModalForm';
import ProfileAccountCell from '../../components/ProfileAccountCell';

const ElderlyProfilesPage = () => {
  const { hasPermission } = usePermission();
  const canCreate = hasPermission('QLHOSONCT', 'them');
  const canEdit = hasPermission('QLHOSONCT', 'sua');
  const canDelete = hasPermission('QLHOSONCT', 'xoa');
  const [elders, setElders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assigningElder, setAssigningElder] = useState(null);
  const [caregivers, setCaregivers] = useState([]);
  const [assignSaving, setAssignSaving] = useState(false);
  const [form] = Form.useForm();
  const [assignForm] = Form.useForm();

  const loadElders = async () => {
    setLoading(true);
    try {
      setElders(await getElders({ search }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadElders();
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleView = (record) => {
    setSelected(record);
    setDetailOpen(true);
  };

  const handleAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldValue('trangThai', 'DangTheoDoi');
    setModalOpen(true);
  };

  const handleEdit = (record) => {
    setEditing(record);
    form.setFieldsValue({
      ...record,
      ngaySinh: record.ngaySinh ? dayjs(record.ngaySinh) : null,
      diaChi: record.diaChiThuongTru,
      benhNen: (record.benhNen || []).join(', '),
      diUng: (record.diUng || []).join(', '),
    });
    setModalOpen(true);
  };

  const handleSave = async (values) => {
    setSaving(true);
    try {
      const payload = {
        ...values,
        ngaySinh: values.ngaySinh?.format('YYYY-MM-DD'),
        benhNen: values.benhNen?.split(',').map((item) => item.trim()).filter(Boolean) || [],
        diUng: values.diUng?.split(',').map((item) => item.trim()).filter(Boolean) || [],
      };
      if (editing) {
        await updateElder(editing.id, payload);
        message.success('Cập nhật hồ sơ thành công');
      } else {
        await createElder(payload);
        message.success('Thêm hồ sơ người cao tuổi thành công');
      }
      setModalOpen(false);
      form.resetFields();
      await loadElders();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record) => {
    await deleteElder(record.id);
    message.success('Đã ngừng theo dõi hồ sơ');
    await loadElders();
  };

  const openAssignModal = async (record) => {
    setAssigningElder(record);
    assignForm.setFieldValue('nguoiChamSocId', record.nguoiChamSocId || undefined);
    setAssignOpen(true);
    try {
      setCaregivers(await getCaregivers());
    } catch {
      setCaregivers([]);
    }
  };

  const handleAssign = async ({ nguoiChamSocId }) => {
    setAssignSaving(true);
    try {
      await assignElderCaregiver(assigningElder.id, nguoiChamSocId);
      message.success('Đã gán người chăm sóc chính');
      setAssignOpen(false);
      await loadElders();
    } finally {
      setAssignSaving(false);
    }
  };

  const columns = [
    {
      title: 'Tài khoản',
      key: 'account',
      width: 260,
      render: (_, record) => <ProfileAccountCell key={record.id} record={record} kind="elderly" onRefresh={loadElders} />,
    },
    {
      title: 'Mã hồ sơ',
      dataIndex: 'maHoSo',
      key: 'maHoSo',
      width: 125,
      render: (value) => <span className="entity-code-badge">{value}</span>,
    },
    {
      title: 'Họ và tên',
      key: 'hoTen',
      width: 250,
      sorter: (a, b) => a.hoTen.localeCompare(b.hoTen, 'vi'),
      render: (_, record) => (
        <div className="table-person-cell">
          <TableAvatar name={record.hoTen} src={record.anhDaiDien} />
          <div className="table-person-copy">
            <div className="table-person-name">{record.hoTen}</div>
            <div className="table-person-meta">
              {record.tuoi !== null ? `${record.tuoi} tuổi` : 'Chưa có ngày sinh'}
              <span className="meta-dot">•</span>
              {record.gioiTinh || 'Chưa rõ giới tính'}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Nhóm máu',
      dataIndex: 'nhomMau',
      key: 'nhomMau',
      width: 105,
      align: 'center',
      render: (value) => value
        ? <span className="blood-type-badge">{value}</span>
        : <span className="muted-value">Chưa rõ</span>,
    },
    {
      title: 'Bệnh nền',
      dataIndex: 'benhNen',
      key: 'benhNen',
      width: 260,
      render: (values = []) => values.length > 0 ? (
        <Space size={[4, 5]} wrap>
          {values.map((item) => <Tag className="disease-tag" key={item}>{item}</Tag>)}
        </Space>
      ) : <span className="muted-value">Không có</span>,
    },
    {
      title: 'Người chăm sóc',
      dataIndex: 'nguoiChamSocTen',
      key: 'nguoiChamSocTen',
      width: 190,
      render: (value, record) => value ? (
        <button
          type="button"
          className="caregiver-link"
          onClick={(event) => { event.stopPropagation(); if (canEdit) openAssignModal(record); }}
        >
          <TableAvatar name={value} size={30} />
          <span>{value}</span>
        </button>
      ) : (
        <button
          type="button"
          className="unassigned-caregiver"
          disabled={!canEdit}
          onClick={(event) => { event.stopPropagation(); openAssignModal(record); }}
        >
          <PlusOutlined /> Chưa gán
        </button>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'trangThai',
      key: 'trangThai',
      width: 150,
      sorter: (a, b) => a.trangThai.localeCompare(b.trangThai),
      render: (value) => {
        const mapped = getElderStatusMap(value);
        return <StatusTag {...mapped} />;
      },
    },
    {
      title: 'Thao tác',
      key: 'action',
      fixed: 'right',
      width: 132,
      align: 'center',
      render: (_, record) => (
        <Space size={6} onClick={(event) => event.stopPropagation()}>
          <TableActionButton type="view" tooltip="Xem chi tiết" icon={<EyeOutlined />} onClick={() => handleView(record)} />
          {canEdit && <TableActionButton type="edit" tooltip="Chỉnh sửa" icon={<EditOutlined />} onClick={() => handleEdit(record)} />}
          {canDelete && (
            <Popconfirm
              title="Ngừng theo dõi hồ sơ này?"
              description="Hồ sơ sẽ được chuyển sang trạng thái ngừng theo dõi."
              okText="Xác nhận"
              cancelText="Hủy"
              onConfirm={() => handleDelete(record)}
            >
              <TableActionButton type="delete" tooltip="Xóa" icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
          {!canEdit && !canDelete && null}
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
        count={elders.length}
        countLabel="người cao tuổi"
        extra={canCreate && (
          <Button type="primary" icon={<PlusOutlined />} size="large" onClick={handleAdd}>Thêm hồ sơ mới</Button>
        )}
      />

      <TableToolbar search={search} onSearch={setSearch} searchPlaceholder="Tìm theo tên, mã hồ sơ..." />

      <DataTable
        columns={columns}
        dataSource={elders}
        rowKey="id"
        loading={loading}
        onRow={(record) => ({ onClick: () => handleView(record) })}
        emptyDescription="Chưa có hồ sơ người cao tuổi"
        emptyAction={canCreate && <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>Thêm hồ sơ mới</Button>}
      />

      <Modal
        title={`Chi tiết hồ sơ — ${selected?.hoTen || ''}`}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={<Button onClick={() => setDetailOpen(false)}>Đóng</Button>}
        width={720}
        centered
      >
        {selected && (
          <Descriptions bordered column={2} size="middle" style={{ marginTop: 16 }}>
            <Descriptions.Item label="Mã hồ sơ">{selected.maHoSo}</Descriptions.Item>
            <Descriptions.Item label="Họ và tên"><strong>{selected.hoTen}</strong></Descriptions.Item>
            <Descriptions.Item label="Ngày sinh">{selected.ngaySinh ? dayjs(selected.ngaySinh).format('DD/MM/YYYY') : 'Chưa cập nhật'}</Descriptions.Item>
            <Descriptions.Item label="Tuổi">{selected.tuoi !== null ? `${selected.tuoi} tuổi` : 'Chưa rõ'}</Descriptions.Item>
            <Descriptions.Item label="Giới tính">{selected.gioiTinh || 'Chưa cập nhật'}</Descriptions.Item>
            <Descriptions.Item label="CCCD">{selected.cmnd || 'Chưa cập nhật'}</Descriptions.Item>
            <Descriptions.Item label="Nhóm máu">{selected.nhomMau || 'Chưa rõ'}</Descriptions.Item>
            <Descriptions.Item label="Số điện thoại">{selected.soDienThoai || 'Chưa cập nhật'}</Descriptions.Item>
            <Descriptions.Item label="Người chăm sóc">{selected.nguoiChamSocTen || 'Chưa gán'}</Descriptions.Item>
            <Descriptions.Item label="Địa chỉ" span={2}>{selected.diaChiThuongTru || 'Chưa cập nhật'}</Descriptions.Item>
            <Descriptions.Item label="Bệnh nền" span={2}>
              {selected.benhNen?.length ? selected.benhNen.map((item) => <Tag className="disease-tag" key={item}>{item}</Tag>) : <span className="muted-value">Không có</span>}
            </Descriptions.Item>
            <Descriptions.Item label="Dị ứng" span={2}>
              {selected.diUng?.length ? selected.diUng.map((item) => <Tag color="red" key={item}>{item}</Tag>) : <span className="muted-value">Không có</span>}
            </Descriptions.Item>
            <Descriptions.Item label="Trạng thái" span={2}><StatusTag {...getElderStatusMap(selected.trangThai)} /></Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      <ModalForm
        title={editing ? 'Chỉnh sửa hồ sơ người cao tuổi' : 'Thêm hồ sơ người cao tuổi'}
        subtitle="Thông tin cá nhân và tình trạng sức khỏe cơ bản"
        icon={<HeartOutlined />}
        mode={editing ? 'edit' : 'create'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onFinish={handleSave}
        loading={saving}
        form={form}
      >
        <FormSection title="Thông tin cá nhân" description="Thông tin nhận diện cơ bản của người cao tuổi">
          <Row gutter={18}>
            <Col xs={24} md={12}><Form.Item name="hoTen" label="Họ và tên" rules={[{ required: true, message: 'Vui lòng nhập họ và tên' }]}><Input placeholder="VD: Nguyễn Văn An" /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="ngaySinh" label="Ngày sinh" rules={[{ required: true, message: 'Vui lòng chọn ngày sinh' }]}><DatePicker format="DD/MM/YYYY" placeholder="Chọn ngày sinh" style={{ width: '100%' }} /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="gioiTinh" label="Giới tính" rules={[{ required: true, message: 'Vui lòng chọn giới tính' }]}><Select placeholder="Chọn giới tính" options={[{ value: 'Nam' }, { value: 'Nữ' }, { value: 'Khác' }]} /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="cccd" label="CCCD" rules={[{ pattern: /^[0-9]{9,12}$/, message: 'CCCD phải gồm 9–12 chữ số' }]}><Input placeholder="VD: 079123456789" /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="soDienThoai" label="Số điện thoại" rules={[{ pattern: /^[0-9]{10,11}$/, message: 'Số điện thoại phải gồm 10–11 chữ số' }]}><Input placeholder="VD: 0901234567" /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="trangThai" label="Trạng thái"><Select options={[{ value: 'DangTheoDoi', label: 'Đang theo dõi' }, { value: 'NgungTheoDoi', label: 'Ngừng theo dõi' }]} /></Form.Item></Col>
          </Row>
          <Form.Item name="diaChi" label="Địa chỉ thường trú"><Input placeholder="Nhập số nhà, đường, phường/xã, quận/huyện, tỉnh/thành" /></Form.Item>
        </FormSection>
        <FormSection title="Thông tin sức khỏe" description="Nhóm máu, bệnh nền và dị ứng cần lưu ý">
          <Row gutter={18}><Col xs={24} md={12}><Form.Item name="nhomMau" label="Nhóm máu"><Select placeholder="Chọn nhóm máu" allowClear options={['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((value) => ({ value }))} /></Form.Item></Col></Row>
          <Form.Item name="benhNen" label="Bệnh nền"><Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="VD: Tăng huyết áp, tiểu đường (phân cách bằng dấu phẩy)" /></Form.Item>
          <Form.Item name="diUng" label="Dị ứng"><Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="VD: Penicillin, hải sản (phân cách bằng dấu phẩy)" /></Form.Item>
        </FormSection>
      </ModalForm>

      <ModalForm
        title="Gán người chăm sóc"
        subtitle={assigningElder ? `Chọn người chăm sóc chính cho ${assigningElder.hoTen}` : ''}
        icon={<UserAddOutlined />}
        mode="edit"
        saveLabel="Lưu người chăm sóc"
        open={assignOpen}
        onCancel={() => setAssignOpen(false)}
        onFinish={handleAssign}
        loading={assignSaving}
        form={assignForm}
        width={560}
      >
        <FormSection title="Người chăm sóc chính">
          <Form.Item name="nguoiChamSocId" label="Người chăm sóc" rules={[{ required: true, message: 'Vui lòng chọn người chăm sóc' }]}>
            <Select
              showSearch
              placeholder="Tìm và chọn người chăm sóc"
              optionFilterProp="label"
              options={caregivers.map((item) => ({ value: item.id, label: `${item.hoTen} — ${item.soDienThoai || 'chưa có SĐT'}` }))}
            />
          </Form.Item>
        </FormSection>
      </ModalForm>
    </div>
  );
};

export default ElderlyProfilesPage;
