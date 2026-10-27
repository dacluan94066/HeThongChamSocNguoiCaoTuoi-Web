import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Button, Form, Input, message, Modal, Select, Space, Spin, Tag,
} from 'antd';
import {
  CheckCircleOutlined, EditOutlined, EyeOutlined, HeartOutlined, IdcardOutlined,
  KeyOutlined, MedicineBoxOutlined, PhoneOutlined, PlusOutlined, SearchOutlined, StopOutlined,
  UserAddOutlined, UsergroupAddOutlined, WarningOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  assignElderCaregiver, getElderById, getElders, resetElderMobilePassword, updateElder,
} from '../../services/elderlyService';
import { getCaregiverById, getCaregivers } from '../../services/caregiverService';
import { getPrescriptions } from '../../services/scheduleService';
import DataTable from '../../components/DataTable';
import StatusTag, { getElderStatusMap } from '../../components/StatusTag';
import TableAvatar from '../../components/TableAvatar';
import TableActionButton from '../../components/TableActionButton';
import usePermission from '../../hooks/usePermission';
import { useAuth } from '../../context/AuthContext';
import ModalForm, { FormSection } from '../../components/ModalForm';
import { formatEntityCode } from '../../utils/displayUtils';
import { mobilePasswordRules } from '../../utils/accountFormRules';
import { ElderlyPersonalFields, ElderlyHealthFields } from '../../components/ElderlyProfileFields';
import RelativeLinksPanel from '../../components/RelativeLinksPanel';
import { canViewRelativeAdmin } from '../../utils/relativeAdmin';

const ElderlyProfilesPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryKeyword = searchParams.get('keyword')?.trim() || '';
  const { hasPermission } = usePermission();
  const { user } = useAuth();
  const isCaregiver = user?.tenVaiTro === 'NguoiChamSoc';
  const canEdit = hasPermission('QLHOSONCT', 'sua');
  const canAssign = user?.tenVaiTro === 'QuanTriVien' && canEdit;
  const canResetPassword = user?.tenVaiTro === 'QuanTriVien' && canEdit;
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
  const [resetTarget, setResetTarget] = useState(null);
  const [resetSaving, setResetSaving] = useState(false);
  const [resetForm] = Form.useForm();
  const [form] = Form.useForm();
  const [assignForm] = Form.useForm();
  const [relativeSectionOpen, setRelativeSectionOpen] = useState(false);

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

  const handleView = useCallback(async (record) => {
    setRelativeSectionOpen(false);
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
  }, []);

  useEffect(() => {
    if (loading || !searchParams.has('view') || user?.tenVaiTro !== 'QuanTriVien' || !hasPermission('QLHOSONCT', 'xem')) return;
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      const id = Number(searchParams.get('view'));
      const next = new URLSearchParams(searchParams); next.delete('view'); setSearchParams(next, { replace: true });
      const record = Number.isInteger(id) && id > 0 ? elders.find(elder => Number(elder.id) === id) : null;
      if (record) void handleView(record);
      else message.warning('Không tìm thấy hồ sơ NCT được chọn trong danh sách hiện tại.');
    });
    return () => { active = false; };
  }, [elders, loading, searchParams, setSearchParams, user?.tenVaiTro, hasPermission, handleView]);
  const handleEdit = (record) => {
    setEditing(record);
    form.resetFields();
    form.setFieldsValue({
      ...record,
      ngaySinh: record.ngaySinh ? dayjs(record.ngaySinh) : null,
      diaChi: record.diaChiThuongTru,
      cccd: record.cmnd,
      benhNen: (record.benhNen || []).join(', '),
      diUng: (record.diUng || []).join(', '),
    });
    setModalOpen(true);
  };

  const handleSave = async (values) => {
    if (!editing || !canEdit) return;
    setSaving(true);
    try {
      const payload = {
        ...values,
        ngaySinh: values.ngaySinh?.format('YYYY-MM-DD'),
        benhNen: values.benhNen?.split(',').map((item) => item.trim()).filter(Boolean) || [],
        diUng: values.diUng?.split(',').map((item) => item.trim()).filter(Boolean) || [],
      };
      await updateElder(editing.id, payload);
      message.success('Cập nhật hồ sơ thành công');
      setModalOpen(false);
      form.resetFields();
      await loadElders();
    } catch (error) {
      if (!error.config) message.error(error.message || 'Không thể lưu hồ sơ. Vui lòng thử lại.');
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

  const openResetPassword = (record) => {
    if (!canResetPassword || !record?.userId) return;
    resetForm.resetFields();
    setResetTarget(record);
  };

  const handleResetPassword = async ({ matKhauMoi }) => {
    if (!canResetPassword || !resetTarget?.userId) return;
    setResetSaving(true);
    try {
      await resetElderMobilePassword(resetTarget.id, matKhauMoi);
      message.success('Đã đặt lại mật khẩu Mobile. Hãy bàn giao mật khẩu mới riêng cho NCT.');
      resetForm.resetFields();
      setResetTarget(null);
    } catch (error) {
      if (error.response?.data?.errorCode === 'INVALID_PASSWORD') {
        resetForm.setFields([{ name: 'matKhauMoi', errors: [error.response.data.message] }]);
      }
      if (!error.config) message.error(error.message || 'Không thể đặt lại mật khẩu. Vui lòng thử lại.');
    } finally {
      setResetSaving(false);
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
          disabled={!canAssign}
          onClick={(event) => { event.stopPropagation(); if (canAssign) openAssignModal(record); }}
        >
          <TableAvatar name={value} size={30} />
          <span><strong>{value}</strong><small>Người chăm sóc chính</small></span>
        </button>
      ) : (
        <button
          type="button"
          className="unassigned-caregiver"
          disabled={!canAssign}
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
          <h1>{isCaregiver ? 'Người cao tuổi tôi chăm sóc' : 'Hồ sơ người cao tuổi'}</h1>
          <p>{isCaregiver
            ? 'Chỉ hiển thị hồ sơ đang được phân công cho tài khoản của bạn.'
            : 'Quản lý hồ sơ và phân công chăm sóc. Thêm NCT mới tại Người dùng & Phân quyền để tạo đồng thời tài khoản Mobile.'}</p>
        </div>
      </section>

      <section className="elderly-kpi-grid" aria-label="Thống kê hồ sơ người cao tuổi">
        <article className="elderly-kpi-card is-total">
          <span className="elderly-kpi-icon"><UsergroupAddOutlined /></span>
          <div><small>{isCaregiver ? 'Hồ sơ được phân công' : 'Tổng hồ sơ'}</small><strong>{profileStats.total}</strong><span>hồ sơ</span></div>
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
        emptyDescription={isCaregiver
          ? 'Bạn chưa được phân công chăm sóc người cao tuổi nào'
          : 'Chưa có hồ sơ người cao tuổi'}
      />

      <Modal
        className="elderly-detail-modal"
        title={null}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={(
          <div className="elderly-detail-footer">
            <Button onClick={() => setDetailOpen(false)}>Đóng</Button>
            {canResetPassword && selected?.userId && (
              <Button icon={<KeyOutlined />} disabled={detailLoading} onClick={() => openResetPassword(selected)}>
                Đặt lại mật khẩu Mobile
              </Button>
            )}
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
                    <div><dt>Tài khoản Mobile</dt><dd>{selected.userId ? 'Đã có tài khoản' : 'Chưa có tài khoản'}</dd></div>
                    {selected.userId && <div><dt>Tên đăng nhập</dt><dd>{selected.tenDangNhap || 'Chưa cập nhật'}</dd></div>}
                    {selected.email && <div><dt>Email</dt><dd>{selected.email}</dd></div>}
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
            {canViewRelativeAdmin(user, hasPermission) && <details className="elderly-relative-section" key={selected.id}
              open={relativeSectionOpen} onToggle={event => setRelativeSectionOpen(event.currentTarget.open)}>
              <summary>Người thân được phép theo dõi</summary>
              {detailOpen && relativeSectionOpen && <RelativeLinksPanel key={selected.id} elderly={selected} />}
            </details>}
          </Spin>
        )}
      </Modal>

      <ModalForm
        title="Chỉnh sửa hồ sơ người cao tuổi"
        subtitle="Thông tin cá nhân và tình trạng sức khỏe cơ bản"
        icon={<HeartOutlined />}
        mode="edit"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onFinish={handleSave}
        loading={saving}
        form={form}
      >
        <ElderlyPersonalFields showStatus />
        {editing && canResetPassword && (
          <FormSection title="Tài khoản đăng nhập Mobile" description="Đặt lại mật khẩu là thao tác riêng, không cần lưu thay đổi hồ sơ.">
            {editing.userId ? (
              <>
                <p>Tên đăng nhập: <strong>{editing.tenDangNhap || 'Chưa cập nhật'}</strong></p>
                <Button icon={<KeyOutlined />} disabled={saving} onClick={() => openResetPassword(editing)}>
                  Đặt lại mật khẩu Mobile
                </Button>
              </>
            ) : <p>Hồ sơ chưa có tài khoản Mobile nên chưa thể đặt lại mật khẩu.</p>}
          </FormSection>
        )}
        <ElderlyHealthFields />
      </ModalForm>

      <ModalForm
        title="Đặt lại mật khẩu Mobile"
        subtitle={resetTarget ? `Tài khoản của ${resetTarget.hoTen}` : ''}
        icon={<KeyOutlined />}
        open={Boolean(resetTarget)}
        onCancel={() => { resetForm.resetFields(); setResetTarget(null); }}
        onFinish={handleResetPassword}
        loading={resetSaving}
        form={resetForm}
        width={560}
        mode="edit"
        saveLabel="Đặt lại mật khẩu"
      >
        <FormSection title="Mật khẩu mới" description="Mật khẩu cũ sẽ không còn đăng nhập được. Tài khoản và thông tin hồ sơ vẫn giữ nguyên.">
          <Form.Item name="matKhauMoi" label="Mật khẩu Mobile mới" rules={mobilePasswordRules}>
            <Input.Password autoComplete="new-password" maxLength={72} placeholder="Nhập ít nhất 6 ký tự" />
          </Form.Item>
          <Form.Item name="xacNhanMatKhauMoi" label="Nhập lại mật khẩu mới" dependencies={['matKhauMoi']}
            rules={[{ required: true, message: 'Vui lòng nhập lại mật khẩu mới' },
              ({ getFieldValue }) => ({ validator: (_, value) => !value || value === getFieldValue('matKhauMoi')
                ? Promise.resolve() : Promise.reject(new Error('Mật khẩu nhập lại chưa khớp')) })]}>
            <Input.Password autoComplete="new-password" maxLength={72} placeholder="Nhập lại mật khẩu mới" />
          </Form.Item>
          <p>Chỉ Admin được thực hiện. Mã OTP khôi phục mật khẩu cũ sẽ hết hiệu lực; hãy bàn giao mật khẩu mới riêng cho NCT.</p>
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
