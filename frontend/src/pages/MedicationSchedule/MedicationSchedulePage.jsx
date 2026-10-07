// Trang lịch uống thuốc - Theo từng người cao tuổi, trạng thái màu sắc
import React, { useState, useEffect } from 'react';
import {
  Button, Card, Col, DatePicker, Form, Input, InputNumber, Row,
  Select, Space, Tag, TimePicker, Typography, message,
} from 'antd';
import {
  ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined,
  DeleteOutlined, EyeOutlined, MedicineBoxOutlined, PlusOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  createPrescription, getSchedules, updateScheduleStatus,
} from '../../services/scheduleService';
import { getElders } from '../../services/elderlyService';
import { getMedications } from '../../services/medicationService';
import PageHeader from '../../components/PageHeader';
import TableToolbar from '../../components/TableToolbar';
import DataTable from '../../components/DataTable';
import StatusTag, { getMedStatusMap } from '../../components/StatusTag';
import usePermission from '../../hooks/usePermission';
import TableAvatar from '../../components/TableAvatar';
import TableActionButton from '../../components/TableActionButton';
import { formatEntityCode } from '../../utils/displayUtils';
import RecordDetailModal from '../../components/RecordDetailModal';
import ModalForm, { FormSection } from '../../components/ModalForm';
import { getSocket } from '../../services/socketClient';

const { Option } = Select;

const PrescriptionMedicationRow = ({ field, form, medications, onRemove, canRemove }) => {
  const timesPerDay = Form.useWatch(
    ['danhSachThuoc', field.name, 'soLanMoiNgay'],
    form,
  ) || 1;

  const updateTimesPerDay = (value) => {
    const count = Math.max(1, Math.min(24, Number(value) || 1));
    const currentTimes = form.getFieldValue([
      'danhSachThuoc', field.name, 'gioUong',
    ]) || [];
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
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={onRemove}
        >
          Xóa
        </Button>
      )}
      style={{ marginBottom: 16 }}
    >
      <Row gutter={16}>
        <Col xs={24} md={10}>
          <Form.Item
            name={[field.name, 'thuocId']}
            label="Thuốc"
            rules={[{ required: true, message: 'Vui lòng chọn thuốc' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Chọn thuốc trong danh mục"
              options={medications.map((medication) => ({
                value: medication.id,
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
              <TimePicker
                format="HH:mm"
                minuteStep={1}
                placeholder="Chọn giờ"
                style={{ width: '100%' }}
              />
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
  const [selectedElder, setSelectedElder] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [detailRecord, setDetailRecord] = useState(null);
  const [prescriptionModalOpen, setPrescriptionModalOpen] = useState(false);
  const [prescriptionForm] = Form.useForm();

  useEffect(() => {
    Promise.all([getElders(), getMedications()]).then(([elderlyList, medicationList]) => {
      setElders(elderlyList);
      setMedications(
        medicationList.filter((medication) => medication.trangThai !== 'NGUNG_SU_DUNG'),
      );
    }).catch(() => {
      setElders([]);
      setMedications([]);
    });
  }, []);

  const loadSchedules = (elderlyId = selectedElder, status = filterStatus) => {
    setLoading(true);
    return getSchedules({
      nguoiCaoTuoiId: elderlyId,
      trangThai: status || undefined,
    })
      .then(setSchedules)
      .catch(() => setSchedules([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    getSchedules({
      nguoiCaoTuoiId: selectedElder,
      trangThai: filterStatus || undefined,
    })
      .then(setSchedules)
      .catch(() => setSchedules([]))
      .finally(() => setLoading(false));
  }, [selectedElder, filterStatus]);

  useEffect(() => {
    const socket = getSocket();
    const handleScheduleUpdated = (event) => {
      if (selectedElder
          && Number(event?.nguoiCaoTuoiId) !== Number(selectedElder)) return;
      getSchedules({
        nguoiCaoTuoiId: selectedElder,
        trangThai: filterStatus || undefined,
      }).then(setSchedules).catch(() => setSchedules([]));
    };

    socket.on('lichuongthuoc:updated', handleScheduleUpdated);
    return () => socket.off('lichuongthuoc:updated', handleScheduleUpdated);
  }, [selectedElder, filterStatus]);

  const handleElderFilterChange = (value) => {
    setLoading(true);
    setSelectedElder(value);
  };

  const handleStatusFilterChange = (value) => {
    setLoading(true);
    setFilterStatus(value || '');
  };

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
      if (selectedElder !== values.nguoiCaoTuoiId) {
        setLoading(true);
        setSelectedElder(values.nguoiCaoTuoiId);
      } else {
        await loadSchedules(values.nguoiCaoTuoiId, filterStatus);
      }
    } catch {
      // Axios interceptor da hien thi thong bao loi tu backend.
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    const { label } = getMedStatusMap(newStatus);
    await updateScheduleStatus(id, newStatus);
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
        extra={canCreate && (
          <Button
            type="primary"
            size="large"
            icon={<PlusOutlined />}
            onClick={openPrescriptionModal}
          >
            Tạo đơn thuốc
          </Button>
        )}
      />

      <TableToolbar
        filters={[
          <Select
            key="elder"
            placeholder="Chọn người cao tuổi"
            style={{ width: 240 }}
            allowClear
            value={selectedElder}
            onChange={handleElderFilterChange}
          >
            {elders.map((e) => <Option key={e.id} value={e.id}>{e.hoTen}</Option>)}
          </Select>,
          <Select
            key="status"
            placeholder="Lọc trạng thái"
            style={{ width: 180 }}
            allowClear
            onChange={handleStatusFilterChange}
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
        <FormSection
          title="Thông tin đơn thuốc"
          description="Chọn người cao tuổi và khoảng thời gian áp dụng"
        >
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                name="nguoiCaoTuoiId"
                label="Người cao tuổi"
                rules={[{ required: true, message: 'Vui lòng chọn người cao tuổi' }]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Chọn người cao tuổi"
                  options={elders.map((elder) => ({ value: elder.id, label: elder.hoTen }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="bacSiKeDon"
                label="Bác sĩ kê đơn"
                rules={[{ max: 100, message: 'Tên bác sĩ tối đa 100 ký tự' }]}
              >
                <Input placeholder="Nhập tên bác sĩ kê đơn" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="ngayBatDau"
                label="Ngày bắt đầu"
                rules={[{ required: true, message: 'Vui lòng chọn ngày bắt đầu' }]}
              >
                <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
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
                    if (!value || !start || !value.isBefore(start, 'day')) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('Ngày kết thúc không được trước ngày bắt đầu'));
                  },
                })]}
              >
                <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="ghiChu"
            label="Ghi chú"
            rules={[{ max: 500, message: 'Ghi chú tối đa 500 ký tự' }]}
          >
            <Input.TextArea
              autoSize={{ minRows: 2, maxRows: 4 }}
              placeholder="Lưu ý thêm cho đơn thuốc (nếu có)"
            />
          </Form.Item>
        </FormSection>

        <FormSection
          title="Danh sách thuốc"
          description="Số ô giờ uống luôn khớp với số lần uống mỗi ngày"
        >
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
                <Button
                  type="dashed"
                  block
                  icon={<PlusOutlined />}
                  onClick={() => add({ soLanMoiNgay: 1, gioUong: [null] })}
                >
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
