import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Button, Col, DatePicker, Form, Input, message, Modal,
  Row, Select, Space, Spin, Tag,
} from 'antd';
import {
  CheckCircleOutlined, EditOutlined, EyeOutlined, HeartOutlined, IdcardOutlined,
  MedicineBoxOutlined, PhoneOutlined, PlusOutlined, SearchOutlined, StopOutlined,
  UserAddOutlined, UsergroupAddOutlined, WarningOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  assignElderCaregiver, createElder, getElderById, getElders, updateElder,
} from '../../services/elderlyService';
import { getCaregiverById, getCaregivers } from '../../services/caregiverService';
import { getPrescriptions } from '../../services/scheduleService';
import DataTable from '../../components/DataTable';
import StatusTag, { getElderStatusMap } from '../../components/StatusTag';
import TableAvatar from '../../components/TableAvatar';
import TableActionButton from '../../components/TableActionButton';
import usePermission from '../../hooks/usePermission';
import ModalForm, { FormSection } from '../../components/ModalForm';
import { formatEntityCode } from '../../utils/displayUtils';

const ElderlyProfilesPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryKeyword = searchParams.get('keyword')?.trim() || '';
  const { hasPermission } = usePermission();
  const canCreate = hasPermission('QLHOSONCT', 'them');
  const canEdit = hasPermission('QLHOSONCT', 'sua');
  const [elders, setElders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [activeMedications, setActiveMedications] = useState([]);
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
      setElders(await getElders());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    getElders()
      .then((data) => { if (active) setElders(data); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const filteredElders = useMemo(() => {
    const keyword = queryKeyword.toLocaleLowerCase('vi');
    return elders.filter((elder) => {
      const matchesKeyword = !keyword || [
        elder.hoTen,
        formatEntityCode('NCT', elder.id),
        elder.cmnd,
      ].some((value) => String(value || '').toLocaleLowerCase('vi').includes(keyword));
      const matchesStatus = statusFilter === 'all' || elder.trangThai === statusFilter;
      return matchesKeyword && matchesStatus;
    });
  }, [elders, queryKeyword, statusFilter]);

  const profileStats = useMemo(() => ({
    total: elders.length,
    active: elders.filter((item) => item.trangThai === 'DangTheoDoi').length,
    inactive: elders.filter((item) => item.trangThai === 'NgungTheoDoi').length,
  }), [elders]);

  const handleSearch = (value) => {
    const nextParams = new URLSearchParams(searchParams);
    const keyword = value.trim();
    if (keyword) nextParams.set('keyword', keyword);
    else nextParams.delete('keyword');
    setSearchParams(nextParams, { replace: true });
  };

  const handleView = async (record) => {
    setSelected(record);
    setActiveMedications([]);
    setDetailOpen(true);
    setDetailLoading(true);

    try {
      const detail = await getElderById(record.id) || record;
      const [caregiverResult, prescriptionResult] = await Promise.allSettled([
        detail.nguoiChamSocId ? getCaregiverById(detail.nguoiChamSocId) : Promise.resolve(null),
        getPrescriptions(record.id),
      ]);
      const caregiver = caregiverResult.status === 'fulfilled' ? caregiverResult.value : null;
      const prescriptions = prescriptionResult.status === 'fulfilled' && Array.isArray(prescriptionResult.value)
        ? prescriptionResult.value
        : [];
      const today = dayjs().startOf('day');
      const currentMedications = prescriptions
        .filter((item) => {
          const startsOn = item.ngayBatDau ? dayjs(item.ngayBatDau).startOf('day') : null;
          const endsOn = item.ngayKetThuc ? dayjs(item.ngayKetThuc).endOf('day') : null;
          return (!startsOn || !today.isBefore(startsOn)) && (!endsOn || !today.isAfter(endsOn));
        })
        .flatMap((item) => (item.danhSachThuoc || []).map((medicine) => ({
          ...medicine,
          prescriptionId: item.id,
        })));

      setSelected({
        ...record,
        ...detail,
        nguoiChamSocSoDienThoai: caregiver?.soDienThoai || '',
        nguoiChamSocMoiQuanHe: caregiver?.moiQuanHe || caregiver?.quanHe || '',
      });
      setActiveMedications(currentMedications);
    } catch {
      // Danh sách đã có đủ dữ liệu cơ bản; giữ modal sử dụng bản ghi đó nếu API chi tiết tạm lỗi.
      setSelected(record);
      setActiveMedications([]);
    } finally {
      setDetailLoading(false);
    }
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
      title: 'Họ tên / Tuổi',
      key: 'hoTen',
      width: 260,
      sorter: (a, b) => a.hoTen.localeCompare(b.hoTen, 'vi'),
      render: (_, record) => (
        <div className="table-person-cell">
          <TableAvatar name={record.hoTen} />
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
      title: 'Mã hồ sơ',
      key: 'maHoSo',
      width: 130,
      render: (_, record) => <span className="entity-code-badge">{formatEntityCode('NCT', record.id)}</span>,
    },
    {
      title: 'Bệnh nền & Dị ứng',
      key: 'medicalNotes',
      width: 310,
      render: (_, record) => (
        <div className="elderly-medical-tags">
          {record.benhNen?.length > 0
            ? record.benhNen.map((item) => <Tag className="disease-tag" key={`disease-${item}`}>{item}</Tag>)
            : <span className="muted-value">Không ghi nhận bệnh nền</span>}
          {record.diUng?.map((item) => (
            <Tag className="allergy-tag" icon={<WarningOutlined />} key={`allergy-${item}`}>{item}</Tag>
          ))}
        </div>
      ),
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
          <span><strong>{value}</strong><small>Người chăm sóc chính</small></span>
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
        </Space>
      ),
    },
  ];

  return (
    <div className="elderly-page">
      <section className="elderly-page-heading">
        <div>
          <span className="elderly-page-eyebrow"><span /> Cơ sở dữ liệu hồ sơ chăm sóc</span>
          <h1>Hồ sơ người cao tuổi</h1>
          <p>Quản lý thông tin hành chính, liên hệ và hồ sơ y tế của người cao tuổi.</p>
        </div>
        {canCreate && (
          <Button type="primary" icon={<PlusOutlined />} size="large" onClick={handleAdd}>Thêm hồ sơ</Button>
        )}
      </section>

      <section className="elderly-kpi-grid" aria-label="Thống kê hồ sơ người cao tuổi">
        <article className="elderly-kpi-card is-total">
          <span className="elderly-kpi-icon"><UsergroupAddOutlined /></span>
          <div><small>Tổng hồ sơ</small><strong>{profileStats.total}</strong><span>hồ sơ</span></div>
        </article>
        <article className="elderly-kpi-card is-active">
          <span className="elderly-kpi-icon"><CheckCircleOutlined /></span>
          <div><small>Đang theo dõi</small><strong>{profileStats.active}</strong><span>hồ sơ</span></div>
        </article>
        <article className="elderly-kpi-card is-inactive">
          <span className="elderly-kpi-icon"><StopOutlined /></span>
          <div><small>Ngừng theo dõi</small><strong>{profileStats.inactive}</strong><span>hồ sơ</span></div>
        </article>
      </section>

      <section className="elderly-filter-panel">
        <Input.Search
          key={queryKeyword}
          className="elderly-search"
          prefix={<SearchOutlined />}
          placeholder="Tìm theo họ tên, mã NCT hoặc CCCD"
          defaultValue={queryKeyword}
          allowClear
          enterButton="Tìm kiếm"
          onChange={(event) => {
            if (!event.target.value) handleSearch('');
          }}
          onSearch={handleSearch}
        />
        <div className="elderly-status-filters" aria-label="Lọc theo trạng thái">
          {[
            { value: 'all', label: 'Tất cả', count: profileStats.total },
            { value: 'DangTheoDoi', label: 'Đang theo dõi', count: profileStats.active },
            { value: 'NgungTheoDoi', label: 'Ngừng theo dõi', count: profileStats.inactive },
          ].map((item) => (
            <button
              type="button"
              className={statusFilter === item.value ? 'is-active' : ''}
              onClick={() => setStatusFilter(item.value)}
              key={item.value}
            >
              <span className={`filter-dot ${item.value}`} />
              {item.label}
              <b>{item.count}</b>
            </button>
          ))}
        </div>
      </section>

      <DataTable
        columns={columns}
        dataSource={filteredElders}
        rowKey="id"
        loading={loading}
        onRow={(record) => ({ onClick: () => handleView(record) })}
        emptyDescription="Chưa có hồ sơ người cao tuổi"
        emptyAction={canCreate && <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>Thêm hồ sơ mới</Button>}
      />

      <Modal
        className="elderly-detail-modal"
        title={null}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={(
          <div className="elderly-detail-footer">
            <Button onClick={() => setDetailOpen(false)}>Đóng</Button>
            {canEdit && selected && (
              <Button
                type="primary"
                icon={<EditOutlined />}
                onClick={() => {
                  setDetailOpen(false);
                  handleEdit(selected);
                }}
              >
                Chỉnh sửa hồ sơ
              </Button>
            )}
          </div>
        )}
        width={980}
        centered
      >
        {selected && (
          <Spin spinning={detailLoading}>
            <header className="elderly-detail-header">
              <span className="elderly-detail-header-icon"><IdcardOutlined /></span>
              <div>
                <small>Chi tiết hồ sơ người cao tuổi</small>
                <h2>{formatEntityCode('NCT', selected.id)} · {selected.hoTen}</h2>
              </div>
              <StatusTag {...getElderStatusMap(selected.trangThai)} />
            </header>

            <div className="elderly-detail-grid">
              <section className="elderly-detail-column">
                <h3><IdcardOutlined /> Thông tin hành chính & liên hệ</h3>
                <div className="elderly-identity-card">
                  <TableAvatar name={selected.hoTen} size={58} />
                  <div>
                    <strong>{selected.hoTen}</strong>
                    <span>{formatEntityCode('NCT', selected.id)}</span>
                    <small>{selected.tuoi !== null ? `${selected.tuoi} tuổi` : 'Chưa rõ tuổi'} · {selected.gioiTinh || 'Chưa cập nhật giới tính'}</small>
                  </div>
                </div>
                <div className="elderly-info-card">
                  <dl>
                    <div><dt>Ngày sinh</dt><dd>{selected.ngaySinh ? `${dayjs(selected.ngaySinh).format('DD/MM/YYYY')} (${selected.tuoi ?? '—'} tuổi)` : 'Chưa cập nhật'}</dd></div>
                    <div><dt>Giới tính</dt><dd>{selected.gioiTinh || 'Chưa cập nhật'}</dd></div>
                    <div><dt>CCCD</dt><dd>{selected.cmnd || 'Chưa cập nhật'}</dd></div>
                    <div><dt>Số điện thoại</dt><dd>{selected.soDienThoai || 'Chưa cập nhật'}</dd></div>
                    <div><dt>Địa chỉ</dt><dd>{selected.diaChiThuongTru || 'Chưa cập nhật'}</dd></div>
                  </dl>
                </div>
                <div className="elderly-primary-caregiver">
                  <div>
                    <small>Người chăm sóc chính</small>
                    <strong>{selected.nguoiChamSocTen || 'Chưa gán người chăm sóc'}</strong>
                    {selected.nguoiChamSocMoiQuanHe && <span>{selected.nguoiChamSocMoiQuanHe}</span>}
                  </div>
                  {selected.nguoiChamSocSoDienThoai && (
                    <Button
                      type="primary"
                      icon={<PhoneOutlined />}
                      href={`tel:${selected.nguoiChamSocSoDienThoai.replace(/[^+\d]/g, '')}`}
                    >
                      {selected.nguoiChamSocSoDienThoai}
                    </Button>
                  )}
                </div>
              </section>

              <section className="elderly-detail-column">
                <h3><MedicineBoxOutlined /> Hồ sơ y tế</h3>
                <div className="elderly-medical-overview">
                  <div className="elderly-blood-card">
                    <small>Nhóm máu</small>
                    <strong>{selected.nhomMau || 'Chưa rõ'}</strong>
                  </div>
                  <div className={`elderly-allergy-card ${selected.diUng?.length ? 'has-allergy' : ''}`}>
                    <small><WarningOutlined /> Dị ứng</small>
                    {selected.diUng?.length
                      ? <div>{selected.diUng.map((item) => <Tag className="allergy-tag" key={item}>{item}</Tag>)}</div>
                      : <span>Không ghi nhận dị ứng</span>}
                  </div>
                </div>
                <div className="elderly-medical-card">
                  <small>Bệnh nền</small>
                  <div className="elderly-tag-list">
                    {selected.benhNen?.length
                      ? selected.benhNen.map((item) => <Tag className="disease-tag" key={item}>{item}</Tag>)
                      : <span className="muted-value">Không ghi nhận bệnh nền</span>}
                  </div>
                </div>
                <div className="elderly-medical-card">
                  <small>Danh sách người chăm sóc</small>
                  {selected.nguoiChamSocTen ? (
                    <div className="elderly-caregiver-item">
                      <TableAvatar name={selected.nguoiChamSocTen} size={38} />
                      <div><strong>{selected.nguoiChamSocTen}</strong><span>Người chăm sóc chính</span></div>
                      <StatusTag status="success" label="Chính" size="small" />
                    </div>
                  ) : <span className="muted-value">Chưa gán người chăm sóc</span>}
                </div>
                {activeMedications.length > 0 && (
                  <div className="elderly-medical-card">
                    <small>Thuốc đang dùng</small>
                    <div className="elderly-medication-list">
                      {activeMedications.map((medicine) => (
                        <div key={`${medicine.prescriptionId}-${medicine.id || medicine.thuocId}`}>
                          <MedicineBoxOutlined />
                          <span><strong>{medicine.tenThuoc}</strong><small>{medicine.lieuDung || 'Chưa cập nhật liều dùng'}{medicine.soLanMoiNgay ? ` · ${medicine.soLanMoiNgay} lần/ngày` : ''}</small></span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </div>
          </Spin>
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
