import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Card, Checkbox, Col, DatePicker, Form, Input, InputNumber, Progress, Row,
  Select, Space, Tag, TimePicker, Typography, message,
} from 'antd';
import {
  AlertOutlined, CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined,
  DeleteOutlined, EyeOutlined, HourglassOutlined, MedicineBoxOutlined, PlusOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { createPrescription, getSchedules, supplementSchedule, updateScheduleStatus } from '../../services/scheduleService';
import { getElders } from '../../services/elderlyService';
import { getMedications } from '../../services/medicationService';
import PageHeader from '../../components/PageHeader';
import TableToolbar from '../../components/TableToolbar';
import DataTable from '../../components/DataTable';
import StatusTag, { getMedStatusMap } from '../../components/StatusTag';
import usePermission from '../../hooks/usePermission';
import TableAvatar from '../../components/TableAvatar';
import { formatEntityCode } from '../../utils/displayUtils';
import RecordDetailModal from '../../components/RecordDetailModal';
import ModalForm, { FormSection } from '../../components/ModalForm';
import MedicationQuickTabs from '../../components/MedicationQuickTabs';
import { todayVietnam } from '../../utils/vietnamDate';
import { getSocket } from '../../services/socketClient';
import { findDuplicateMedicine, matchesScheduleDateRange, selectedMedicineIds } from '../../utils/medicationScheduleRules';
import { canSupplementDose } from '../../utils/medicationSupplement';

const { Option } = Select;

const SHIFT_OPTIONS = [
  { key: 'ALL', label: 'Tất cả ca' },
  { key: 'MORNING', label: 'Sáng', range: '05:00–10:59' },
  { key: 'NOON', label: 'Trưa', range: '11:00–13:59' },
  { key: 'AFTERNOON', label: 'Chiều', range: '14:00–17:59' },
  { key: 'EVENING', label: 'Tối', range: '18:00–04:59' },
];

const getScheduleTime = (schedule) => {
  const parsed = dayjs(schedule?.thoiGianDuKien);
  return parsed.isValid() ? parsed : null;
};

const getScheduleShift = (schedule) => {
  const time = getScheduleTime(schedule);
  if (!time) return null;
  const hour = time.hour();
  if (hour >= 5 && hour < 11) return 'MORNING';
  if (hour >= 11 && hour < 14) return 'NOON';
  if (hour >= 14 && hour < 18) return 'AFTERNOON';
  return 'EVENING';
};

const getShiftLabel = (schedule) => (
  SHIFT_OPTIONS.find((item) => item.key === getScheduleShift(schedule))?.label || 'Không xác định'
);

const PrescriptionMedicationRow = ({ field, form, medications, onRemove, canRemove }) => {
  const timesPerDay = Form.useWatch(['danhSachThuoc', field.name, 'soLanMoiNgay'], form) || 1;
  const rows = Form.useWatch('danhSachThuoc', form) || [];
  const selectedElsewhere = selectedMedicineIds(rows, field.name);

  const updateTimesPerDay = (value) => {
    const count = Math.max(1, Math.min(24, Number(value) || 1));
    const currentTimes = form.getFieldValue(['danhSachThuoc', field.name, 'gioUong']) || [];
    form.setFieldValue(
      ['danhSachThuoc', field.name, 'gioUong'],
      Array.from({ length: count }, (_, index) => currentTimes[index] || null),
    );
  };

  return (
    <Card
      size="small"
      title={`Thuốc ${field.name + 1}`}
      extra={canRemove && (
        <Button type="text" danger icon={<DeleteOutlined />} onClick={onRemove}>Xóa</Button>
      )}
      style={{ marginBottom: 16 }}
    >
      <Row gutter={16}>
        <Col xs={24} md={10}>
          <Form.Item
            name={[field.name, 'thuocId']}
            label="Thuốc"
            rules={[
              { required: true, message: 'Vui lòng chọn thuốc' },
              { validator: (_, value) => !value || !selectedMedicineIds(form.getFieldValue('danhSachThuoc') || [], field.name).has(Number(value))
                ? Promise.resolve() : Promise.reject(new Error('Thuốc này đã được chọn ở dòng khác trong đơn')) },
            ]}
          >
            <Select
              showSearch
              allowClear
              optionFilterProp="label"
              placeholder="Chọn thuốc trong danh mục"
              options={medications.map((medication) => ({
                value: medication.id,
                disabled: selectedElsewhere.has(Number(medication.id)),
                label: medication.donViTinh
                  ? `${medication.tenThuoc} (${medication.donViTinh})`
                  : medication.tenThuoc,
              }))}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item
            name={[field.name, 'lieuDung']}
            label="Liều dùng"
            rules={[
              { required: true, whitespace: true, message: 'Vui lòng nhập liều dùng' },
              { max: 100, message: 'Liều dùng tối đa 100 ký tự' },
            ]}
          >
            <Input placeholder="VD: 1 viên/lần" />
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          <Form.Item
            name={[field.name, 'soLanMoiNgay']}
            label="Số lần/ngày"
            rules={[{ required: true, message: 'Nhập số lần uống' }]}
          >
            <InputNumber
              min={1}
              max={24}
              precision={0}
              style={{ width: '100%' }}
              onChange={updateTimesPerDay}
            />
          </Form.Item>
        </Col>
      </Row>

      <Typography.Text strong>Giờ uống</Typography.Text>
      <Row gutter={12} style={{ marginTop: 8 }}>
        {Array.from({ length: timesPerDay }, (_, timeIndex) => (
          <Col xs={24} sm={12} md={8} lg={6} key={timeIndex}>
            <Form.Item
              name={[field.name, 'gioUong', timeIndex]}
              label={`Lần ${timeIndex + 1}`}
              rules={[{ required: true, message: 'Vui lòng chọn giờ' }]}
            >
              <TimePicker format="HH:mm" minuteStep={1} placeholder="Chọn giờ" style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        ))}
      </Row>
    </Card>
  );
};

const MedicationSchedulePage = () => {
  const { hasPermission } = usePermission();
  const canCreate = hasPermission('QLLICHUONGTHUOC', 'them');
  const canEdit = hasPermission('QLLICHUONGTHUOC', 'sua');
  const [schedules, setSchedules] = useState([]);
  const [elders, setElders] = useState([]);
  const [medications, setMedications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedElder, setSelectedElder] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [selectedShift, setSelectedShift] = useState('ALL');
  const [dateRange, setDateRange] = useState(null);
  const [detailRecord, setDetailRecord] = useState(null);
  const [prescriptionModalOpen, setPrescriptionModalOpen] = useState(false);
  const [prescriptionForm] = Form.useForm();
  const [displayNow, setDisplayNow] = useState(() => new Date());
  const [supplementDose, setSupplementDose] = useState(null);
  const [supplementSaving, setSupplementSaving] = useState(false);
  const [supplementForm] = Form.useForm();

  useEffect(() => {
    const timer = setInterval(() => setDisplayNow(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    Promise.all([getElders(), getMedications()]).then(([elderlyList, medicationList]) => {
      setElders(elderlyList);
      setMedications(medicationList.filter((medication) => medication.trangThai !== 'NGUNG_SU_DUNG'));
    }).catch(() => {
      setElders([]);
      setMedications([]);
    });
  }, []);

  const loadSchedules = useCallback(async () => {
    try {
      setSchedules(await getSchedules());
    } catch {
      setSchedules([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    getSchedules()
      .then((data) => { if (active) setSchedules(data); })
      .catch(() => { if (active) setSchedules([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const socket = getSocket();
    const handleScheduleUpdated = () => loadSchedules();
    socket.on('lichuongthuoc:updated', handleScheduleUpdated);
    return () => socket.off('lichuongthuoc:updated', handleScheduleUpdated);
  }, [loadSchedules]);

  const todaySchedules = useMemo(() => schedules.filter((schedule) => {
    const time = getScheduleTime(schedule);
    return time?.isSame(dayjs(displayNow), 'day');
  }), [schedules, displayNow]);

  const kpis = useMemo(() => {
    const total = todaySchedules.length;
    const taken = todaySchedules.filter((item) => item.trangThaiHom_nay === 'DA_UONG').length;
    const intervention = todaySchedules.filter((item) => (
      ['BO_LO', 'TU_CHOI'].includes(item.trangThaiHom_nay)
    )).length;
    const upcoming = todaySchedules.filter((item) => item.trangThaiHom_nay === 'CHUA_DEN_GIO'
      && getScheduleTime(item)?.isAfter(dayjs(displayNow))).length;
    return {
      total,
      taken,
      intervention,
      upcoming,
      completionRate: total ? Math.round((taken / total) * 100) : 0,
    };
  }, [todaySchedules, displayNow]);

  const filteredSchedules = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('vi');
    return schedules.filter((schedule) => {
      const matchesSearch = !keyword || [
        schedule.nguoiCaoTuoiTen,
        schedule.tenThuoc,
        formatEntityCode('LUT', schedule.id),
      ].some((value) => String(value || '').toLocaleLowerCase('vi').includes(keyword));
      const matchesElder = !selectedElder
        || Number(schedule.nguoiCaoTuoiId) === Number(selectedElder);
      const matchesStatus = !filterStatus || schedule.trangThaiHom_nay === filterStatus;
      const matchesShift = selectedShift === 'ALL' || getScheduleShift(schedule) === selectedShift;
      const matchesDate = matchesScheduleDateRange(schedule,
        dateRange?.[0]?.format('YYYY-MM-DD'), dateRange?.[1]?.format('YYYY-MM-DD'));
      return matchesSearch && matchesElder && matchesStatus && matchesShift && matchesDate;
    });
  }, [dateRange, filterStatus, schedules, search, selectedElder, selectedShift]);

  const openPrescriptionModal = () => {
    prescriptionForm.resetFields();
    prescriptionForm.setFieldsValue({
      nguoiCaoTuoiId: selectedElder || undefined,
      ngayBatDau: dayjs(),
      danhSachThuoc: [{ soLanMoiNgay: 1, gioUong: [null] }],
    });
    setPrescriptionModalOpen(true);
  };

  const handleCreatePrescription = async (values) => {
    const duplicate = findDuplicateMedicine(values.danhSachThuoc);
    if (duplicate) {
      const error = `Thuốc ở dòng ${duplicate.index + 1} đã được chọn ở dòng ${duplicate.firstIndex + 1}. Nếu uống nhiều cữ, chỉnh Số lần/ngày trong một dòng thuốc.`;
      prescriptionForm.setFields([{ name: ['danhSachThuoc', duplicate.index, 'thuocId'], errors: [error] }]);
      message.error(error);
      return;
    }
    const invalidTimes = values.danhSachThuoc.some((item) => (
      !Array.isArray(item.gioUong)
      || item.gioUong.length !== Number(item.soLanMoiNgay)
      || item.gioUong.some((time) => !time)
    ));
    if (invalidTimes) {
      message.error('Mỗi thuốc phải có đủ số giờ uống tương ứng với số lần/ngày');
      return;
    }
    const duplicateTimes = values.danhSachThuoc.some((item) => {
      const times = item.gioUong.map((time) => time.format('HH:mm'));
      return new Set(times).size !== times.length;
    });
    if (duplicateTimes) {
      message.error('Giờ uống trong cùng một thuốc không được trùng nhau');
      return;
    }

    setSaving(true);
    try {
      const result = await createPrescription(values.nguoiCaoTuoiId, {
        bacSiKeDon: values.bacSiKeDon?.trim() || null,
        ngayBatDau: values.ngayBatDau.format('YYYY-MM-DD'),
        ngayKetThuc: values.ngayKetThuc?.format('YYYY-MM-DD') || null,
        ghiChu: values.ghiChu?.trim() || null,
        danhSachThuoc: values.danhSachThuoc.map((item) => ({
          thuocId: item.thuocId,
          lieuDung: item.lieuDung.trim(),
          soLanMoiNgay: Number(item.soLanMoiNgay),
          gioUong: item.gioUong.map((time) => time.format('HH:mm')),
        })),
      });
      message.success(`Tạo đơn thuốc thành công, đã sinh ${result.soLichDaTao || 0} lịch uống`);
      setPrescriptionModalOpen(false);
      prescriptionForm.resetFields();
      setSelectedElder(values.nguoiCaoTuoiId);
      await loadSchedules();
    } catch {
      // Axios interceptor hiển thị thông báo lỗi từ backend.
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    const { label } = getMedStatusMap(newStatus);
    await updateScheduleStatus(id, newStatus);
    message.success(`Đã cập nhật: ${label}`);
    await loadSchedules();
  };

  const hasConfirmerData = schedules.some((item) => Boolean(item.nguoiXacNhanTen));

  const handleSupplement = async (values) => {
    setSupplementSaving(true);
    try {
      await supplementSchedule(supplementDose.id, {
        thoiGianThucTe: `${values.thoiGianThucTe.format('YYYY-MM-DDTHH:mm')}:00+07:00`,
        lyDo: values.lyDo.trim(),
      });
      message.success('Đã ghi nhận bổ sung liều thuốc đã uống');
      setSupplementDose(null);
      await loadSchedules();
    } catch {
      // The interceptor displays the authoritative server validation/conflict.
    } finally {
      setSupplementSaving(false);
    }
  };

  const columns = [
    {
      title: 'Mã lịch', key: 'maLich', width: 120,
      render: (_, record) => <span className="entity-code-badge">{formatEntityCode('LUT', record.id)}</span>,
    },
    {
      title: 'Người cao tuổi', dataIndex: 'nguoiCaoTuoiTen', key: 'nguoiCaoTuoiTen', width: 210,
      sorter: (a, b) => a.nguoiCaoTuoiTen.localeCompare(b.nguoiCaoTuoiTen, 'vi'),
      render: (value) => (
        <div className="table-person-cell">
          <TableAvatar name={value} />
          <span className="table-person-name">{value}</span>
        </div>
      ),
    },
    {
      title: 'Thuốc & liều dùng', dataIndex: 'tenThuoc', key: 'tenThuoc', width: 220,
      render: (value, record) => (
        <div className="medication-name-cell">
          <strong>{value || 'Chưa cập nhật'}</strong>
          <span>{record.lieuDung || 'Chưa cập nhật liều dùng'}</span>
        </div>
      ),
    },
    {
      title: 'Ngày uống', key: 'ngayUong', width: 130,
      sorter: (a, b) => (a.thoiGianDuKien || '').localeCompare(b.thoiGianDuKien || ''),
      render: (_, record) => getScheduleTime(record)?.format('DD/MM/YYYY') || '—',
    },
    {
      title: 'Giờ uống', key: 'gio', width: 145,
      render: (_, record) => {
        const time = getScheduleTime(record);
        return (
          <Tag className={`schedule-time-tag shift-${(getScheduleShift(record) || 'unknown').toLowerCase()}`}>
            <ClockCircleOutlined />
            <strong>{time ? time.format('HH:mm') : '—'}</strong>
            <span>{getShiftLabel(record)}</span>
          </Tag>
        );
      },
    },
    {
      title: 'Trạng thái', dataIndex: 'trangThaiHom_nay', key: 'trangThai', width: 145,
      render: (value, record) => <Space direction="vertical">
        <StatusTag {...getMedStatusMap(value || 'CHUA_DEN_GIO', record.thoiGianDuKien, displayNow)} />
        {record.ghiNhanBoSung && <>
          <Tag color="blue">Ghi nhận bổ sung</Tag>
          <small>Đã uống: {dayjs(record.thoiGianThucTe).format('HH:mm DD/MM/YYYY')}</small>
          <small>Ghi nhận: {dayjs(record.ghiNhanBoSung.ngayGhiNhan).format('HH:mm DD/MM/YYYY')}</small>
          <small>{record.ghiNhanBoSung.nguoiGhiNhanTen}: {record.ghiNhanBoSung.lyDo}</small>
        </>}
      </Space>,
    },
    {
      title: 'Người xác nhận', dataIndex: 'nguoiXacNhanTen', key: 'nguoiXacNhanTen', width: 180,
      render: (value, record) => (
        <div className="schedule-confirmer">
          <strong>{value || 'Chưa xác nhận'}</strong>
          {record.thoiGianThucTe && <span>{dayjs(record.thoiGianThucTe).format('HH:mm DD/MM/YYYY')}</span>}
        </div>
      ),
    },
    {
      title: 'Thao tác', key: 'action', fixed: 'right', width: 275,
      render: (_, record) => (
        <Space wrap>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={(event) => { event.stopPropagation(); setDetailRecord(record); }}
          >
            Xem
          </Button>
          {canEdit && canSupplementDose(record, displayNow) && (
            <Button size="small" onClick={(event) => {
              event.stopPropagation(); supplementForm.resetFields(); setSupplementDose(record);
            }}>Đã uống nhưng quên xác nhận</Button>
          )}
          {canEdit && record.thoiGianDuKien?.slice(0, 10) === todayVietnam() && record.trangThaiHom_nay !== 'DA_UONG' && (
            <Button
              size="small"
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={(event) => { event.stopPropagation(); handleStatusChange(record.id, 'DA_UONG'); }}
            >
              Xác nhận đã uống
            </Button>
          )}
          {canEdit && record.thoiGianDuKien?.slice(0, 10) === todayVietnam() && !['BO_LO', 'TU_CHOI'].includes(record.trangThaiHom_nay) && (
            <Button
              size="small"
              danger
              icon={<CloseCircleOutlined />}
              onClick={(event) => { event.stopPropagation(); handleStatusChange(record.id, 'BO_LO'); }}
            >
              Bỏ lỡ
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const visibleColumns = hasConfirmerData
    ? columns
    : columns.filter((column) => column.key !== 'nguoiXacNhanTen');

  return (
    <div className="medication-management-page">
      <PageHeader
        title="Quản lý lịch uống thuốc"
        subtitle="Theo dõi đúng giờ, xác nhận liều đã uống và phát hiện trường hợp cần can thiệp"
        icon={<ClockCircleOutlined />}
        extra={canCreate && (
          <Button type="primary" size="large" icon={<PlusOutlined />} onClick={openPrescriptionModal}>
            Tạo đơn thuốc
          </Button>
        )}
      />

      <MedicationQuickTabs />
      <ModalForm
        open={Boolean(supplementDose)}
        title="Ghi nhận bổ sung liều đã uống"
        form={supplementForm}
        onCancel={() => { if (!supplementSaving) setSupplementDose(null); }}
        onFinish={handleSupplement}
        loading={supplementSaving}
        saveLabel="Lưu ghi nhận bổ sung"
      >
        <Alert type="warning" showIcon message="Không phải hướng dẫn uống bù"
          description="Chỉ ghi nhận nếu người cao tuổi đã thực sự uống liều này trước đó. Không uống thêm thuốc chỉ để xác nhận." />
        <p>{supplementDose?.tenThuoc} · Giờ dự kiến: {supplementDose && dayjs(supplementDose.thoiGianDuKien).format('HH:mm DD/MM/YYYY')}</p>
        <Form.Item name="thoiGianThucTe" label="Thời điểm thực sự đã uống (giờ Việt Nam)" rules={[
          { required: true, message: 'Chọn thời điểm đã uống' },
          { validator: (_, value) => !value || (value.format('YYYY-MM-DDTHH:mm:ss') >= `${supplementDose?.thoiGianDuKien?.slice(0, 10)}T00:00:00`
            && new Date(`${value.format('YYYY-MM-DDTHH:mm:ss')}+07:00`) <= new Date())
            ? Promise.resolve() : Promise.reject(new Error('Giờ đã uống phải từ ngày của liều thuốc đến hiện tại')) },
        ]}>
          <DatePicker showTime={{ format: 'HH:mm' }} format="DD/MM/YYYY HH:mm" style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="lyDo" label="Lý do ghi nhận bổ sung" rules={[
          { required: true, whitespace: true, message: 'Nhập lý do ghi nhận bổ sung' },
          { validator: (_, value) => !value || (value.trim().length >= 5 && value.trim().length <= 300)
            ? Promise.resolve() : Promise.reject(new Error('Lý do phải từ 5 đến 300 ký tự')) },
        ]}><Input.TextArea maxLength={300} rows={3} showCount /></Form.Item>
        <Form.Item name="xacNhan" valuePropName="checked" rules={[
          { validator: (_, value) => value ? Promise.resolve() : Promise.reject(new Error('Cần xác nhận đã thực sự uống liều này')) },
        ]}><Checkbox>Tôi xác nhận người cao tuổi đã thực sự uống liều này.</Checkbox></Form.Item>
      </ModalForm>

      <section className="medication-kpi-grid" aria-label="Thống kê lịch uống thuốc hôm nay">
        <article className="medication-kpi-card">
          <div className="medication-kpi-icon is-primary"><MedicineBoxOutlined /></div>
          <div><span>Tổng liều hôm nay</span><strong>{kpis.total}</strong><small>liều theo lịch</small></div>
        </article>
        <article className="medication-kpi-card is-success">
          <div className="medication-kpi-icon"><CheckCircleOutlined /></div>
          <div className="medication-kpi-content">
            <span>Đã uống</span><strong>{kpis.taken}</strong>
            <Progress percent={kpis.completionRate} size="small" showInfo strokeColor="#16A34A" />
          </div>
        </article>
        <article className="medication-kpi-card is-danger">
          <div className="medication-kpi-icon"><AlertOutlined /></div>
          <div><span>Cần can thiệp</span><strong>{kpis.intervention}</strong><small>Bỏ lỡ hoặc từ chối</small></div>
        </article>
        <article className="medication-kpi-card is-warning">
          <div className="medication-kpi-icon"><HourglassOutlined /></div>
          <div><span>Chưa đến giờ</span><strong>{kpis.upcoming}</strong><small>liều còn chờ hôm nay</small></div>
        </article>
      </section>

      <section className="medication-list-panel">
        <div className="medication-list-heading">
          <div><h3>Danh sách lịch uống thuốc</h3><p>Lọc theo ngày dự kiến uống thuốc. Các thẻ thống kê phía trên tính cho hôm nay.</p></div>
          <span>{filteredSchedules.length} lịch phù hợp</span>
        </div>

        <TableToolbar
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Tìm mã lịch, người cao tuổi, tên thuốc..."
          searchWidth={330}
          filters={[
            <DatePicker.RangePicker
              key="schedule-date"
              aria-label="Lọc ngày dự kiến uống thuốc"
              format="DD/MM/YYYY"
              placeholder={['Từ ngày uống', 'Đến ngày uống']}
              value={dateRange}
              onChange={setDateRange}
              allowClear
              style={{ width: 290 }}
              presets={[
                { label: 'Hôm nay', value: [dayjs(todayVietnam()), dayjs(todayVietnam())] },
                { label: '7 ngày gần đây', value: [dayjs(todayVietnam()).subtract(6, 'day'), dayjs(todayVietnam())] },
                { label: '7 ngày tới', value: [dayjs(todayVietnam()), dayjs(todayVietnam()).add(6, 'day')] },
              ]}
            />,
            <Button key="today" onClick={() => setDateRange([dayjs(todayVietnam()), dayjs(todayVietnam())])}>Hôm nay</Button>,
            <Button key="all-dates" disabled={!dateRange} onClick={() => setDateRange(null)}>Tất cả ngày</Button>,
            <Select
              key="elder"
              placeholder="Chọn người cao tuổi"
              style={{ width: 230 }}
              allowClear
              showSearch
              optionFilterProp="label"
              value={selectedElder}
              onChange={setSelectedElder}
              options={elders.map((elder) => ({ value: elder.id, label: elder.hoTen }))}
            />,
            <Select
              key="status"
              placeholder="Tất cả trạng thái"
              style={{ width: 185 }}
              allowClear
              value={filterStatus || undefined}
              onChange={(value) => setFilterStatus(value || '')}
            >
              <Option value="CHUA_DEN_GIO">Chưa xác nhận uống</Option>
              <Option value="DA_UONG">Đã uống</Option>
              <Option value="BO_LO">Bỏ lỡ</Option>
              <Option value="TU_CHOI">Từ chối</Option>
            </Select>,
          ]}
        />

        <div className="schedule-shift-filter">
          <span>Ca uống:</span>
          <div>
            {SHIFT_OPTIONS.map((shift) => (
              <button
                type="button"
                key={shift.key}
                className={selectedShift === shift.key ? 'is-active' : ''}
                onClick={() => setSelectedShift(shift.key)}
                title={shift.range}
              >
                {shift.label}{shift.range && <small>{shift.range}</small>}
              </button>
            ))}
          </div>
        </div>

        <DataTable
          columns={visibleColumns}
          dataSource={filteredSchedules}
          rowKey="id"
          loading={loading}
          emptyDescription="Chưa có lịch uống thuốc phù hợp"
          onRow={(record) => ({ onClick: () => setDetailRecord(record) })}
          rowClassName={(record) => (
            ['BO_LO', 'TU_CHOI'].includes(record.trangThaiHom_nay) ? 'row-danger' : ''
          )}
        />
      </section>

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
          { label: 'Thời gian dự kiến', key: 'thoiGianDuKien', render: (value) => value ? dayjs(value).format('HH:mm DD/MM/YYYY') : '—' },
          { label: 'Trạng thái', key: 'trangThaiHom_nay', render: (value, record) => <StatusTag {...getMedStatusMap(value, record.thoiGianDuKien, displayNow)} /> },
          ...(hasConfirmerData ? [
            { label: 'Người xác nhận', key: 'nguoiXacNhanTen' },
            { label: 'Thời gian thực tế', key: 'thoiGianThucTe', render: (value) => value ? dayjs(value).format('HH:mm DD/MM/YYYY') : '—' },
          ] : []),
          { label: 'Ghi chú', key: 'ghiChu', span: 2 },
        ]}
      />

      <ModalForm
        title="Tạo đơn thuốc"
        subtitle="Kê nhiều thuốc và tự động sinh lịch uống theo ngày, giờ đã chọn"
        icon={<MedicineBoxOutlined />}
        open={prescriptionModalOpen}
        onCancel={() => setPrescriptionModalOpen(false)}
        onFinish={handleCreatePrescription}
        loading={saving}
        saveLabel="Tạo đơn thuốc"
        width={980}
        form={prescriptionForm}
      >
        <FormSection title="Thông tin đơn thuốc" description="Chọn người cao tuổi và khoảng thời gian áp dụng">
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="nguoiCaoTuoiId" label="Người cao tuổi" rules={[{ required: true, message: 'Vui lòng chọn người cao tuổi' }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Chọn người cao tuổi"
                  options={elders.map((elder) => ({ value: elder.id, label: elder.hoTen }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="bacSiKeDon" label="Bác sĩ kê đơn" rules={[{ max: 100, message: 'Tên bác sĩ tối đa 100 ký tự' }]}>
                <Input placeholder="Nhập tên bác sĩ kê đơn" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="ngayBatDau"
                label="Ngày bắt đầu"
                rules={[
                  { required: true, message: 'Vui lòng chọn ngày bắt đầu' },
                  {
                    validator(_, value) {
                      if (!value || value.format('YYYY-MM-DD') >= todayVietnam()) return Promise.resolve();
                      return Promise.reject(new Error('Ngày bắt đầu không được trước ngày hiện tại'));
                    },
                  },
                ]}
              >
                <DatePicker
                  format="DD/MM/YYYY"
                  style={{ width: '100%' }}
                  disabledDate={(date) => date && date.format('YYYY-MM-DD') < todayVietnam()}
                  onChange={(date) => {
                    const end = prescriptionForm.getFieldValue('ngayKetThuc');
                    if (date && end?.isBefore(date, 'day')) prescriptionForm.setFieldValue('ngayKetThuc', null);
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="ngayKetThuc"
                label="Ngày kết thúc (không chọn sẽ sinh lịch 30 ngày)"
                dependencies={['ngayBatDau']}
                rules={[({ getFieldValue }) => ({
                  validator(_, value) {
                    const start = getFieldValue('ngayBatDau');
                    if (!value) return Promise.resolve();
                    if (value.format('YYYY-MM-DD') < todayVietnam()) {
                      return Promise.reject(new Error('Ngày kết thúc không được trước ngày hiện tại'));
                    }
                    if (start && value.isBefore(start, 'day')) {
                      return Promise.reject(new Error('Ngày kết thúc không được trước ngày bắt đầu'));
                    }
                    return Promise.resolve();
                  },
                })]}
              >
                <DatePicker
                  format="DD/MM/YYYY"
                  style={{ width: '100%' }}
                  disabledDate={(date) => {
                    if (!date) return false;
                    const start = prescriptionForm.getFieldValue('ngayBatDau');
                    const minimum = start?.format('YYYY-MM-DD') || todayVietnam();
                    return date.format('YYYY-MM-DD') < minimum;
                  }}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="ghiChu" label="Ghi chú" rules={[{ max: 500, message: 'Ghi chú tối đa 500 ký tự' }]}>
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} placeholder="Lưu ý thêm cho đơn thuốc (nếu có)" />
          </Form.Item>
        </FormSection>

        <FormSection title="Danh sách thuốc" description="Mỗi thuốc chỉ chọn một lần trong đơn. Nếu uống nhiều cữ, tăng Số lần/ngày và chọn các giờ uống tương ứng.">
          <Form.List name="danhSachThuoc">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <PrescriptionMedicationRow
                    key={field.key}
                    field={field}
                    form={prescriptionForm}
                    medications={medications}
                    onRemove={() => remove(field.name)}
                    canRemove={fields.length > 1}
                  />
                ))}
                <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({ soLanMoiNgay: 1, gioUong: [null] })}>
                  Thêm thuốc
                </Button>
              </>
            )}
          </Form.List>
        </FormSection>
      </ModalForm>
    </div>
  );
};

export default MedicationSchedulePage;
