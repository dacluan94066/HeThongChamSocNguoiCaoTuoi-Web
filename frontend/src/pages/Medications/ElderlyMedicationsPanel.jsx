import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Input, Select, Tag } from 'antd';
import { MedicineBoxOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { getElders } from '../../services/elderlyService';
import { getPrescriptions } from '../../services/scheduleService';
import { formatEntityCode } from '../../utils/displayUtils';
import DataTable from '../../components/DataTable';
import StatusTag from '../../components/StatusTag';

const prescriptionStatus = (prescription, today) => {
  if (prescription.ngayBatDau && dayjs(prescription.ngayBatDau).isAfter(today, 'day')) return 'upcoming';
  if (prescription.ngayKetThuc && dayjs(prescription.ngayKetThuc).isBefore(today, 'day')) return 'ended';
  return 'active';
};

const statusMeta = {
  active: { status: 'success', label: 'Đang dùng' },
  upcoming: { status: 'info', label: 'Sắp dùng' },
  ended: { status: 'inactive', label: 'Đã kết thúc' },
};

const displayDate = (value) => value && dayjs(value).isValid()
  ? dayjs(value).format('DD/MM/YYYY')
  : '—';

const ElderlyMedicationsPanel = ({ canCreatePrescription }) => {
  const navigate = useNavigate();
  const [elders, setElders] = useState([]);
  const [selectedElderId, setSelectedElderId] = useState(null);
  const [prescriptions, setPrescriptions] = useState([]);
  const [loadingElders, setLoadingElders] = useState(true);
  const [loadingPrescriptions, setLoadingPrescriptions] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');

  useEffect(() => {
    let active = true;
    getElders()
      .then((list) => {
        if (!active) return;
        setElders(list);
        setSelectedElderId(list[0]?.id ?? null);
        setLoadingPrescriptions(Boolean(list[0]));
      })
      .catch(() => { if (active) setError('Không tải được danh sách người cao tuổi.'); })
      .finally(() => { if (active) setLoadingElders(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedElderId) return;
    let active = true;
    getPrescriptions(selectedElderId)
      .then((list) => {
        if (!active) return;
        setPrescriptions(list);
        setError('');
      })
      .catch(() => {
        if (!active) return;
        setPrescriptions([]);
        setError('Không tải được đơn thuốc của người cao tuổi đã chọn.');
      })
      .finally(() => { if (active) setLoadingPrescriptions(false); });
    return () => { active = false; };
  }, [selectedElderId]);

  const selectedElder = elders.find((item) => Number(item.id) === Number(selectedElderId));
  const rows = useMemo(() => {
    const today = dayjs();
    return prescriptions.flatMap((prescription) => (
      (prescription.danhSachThuoc || []).map((medicine) => ({
        ...medicine,
        key: `${prescription.id}-${medicine.id}`,
        prescriptionId: prescription.id,
        ngayKeDon: prescription.ngayKeDon,
        ngayBatDau: prescription.ngayBatDau,
        ngayKetThuc: prescription.ngayKetThuc,
        bacSiKeDon: prescription.bacSiKeDon,
        trangThaiDon: prescriptionStatus(prescription, today),
      }))
    ));
  }, [prescriptions]);
  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('vi');
    return rows.filter((row) => (
      (statusFilter === 'all' || row.trangThaiDon === statusFilter)
      && (!keyword || row.tenThuoc?.toLocaleLowerCase('vi').includes(keyword))
    ));
  }, [rows, search, statusFilter]);

  const columns = [
    {
      title: 'Thuốc trong đơn', dataIndex: 'tenThuoc', key: 'tenThuoc', width: 230,
      render: (value) => <strong>{value || '—'}</strong>,
    },
    { title: 'Liều dùng', dataIndex: 'lieuDung', key: 'lieuDung', width: 160, render: (value) => value || '—' },
    { title: 'Số lần/ngày', dataIndex: 'soLanMoiNgay', key: 'soLanMoiNgay', width: 125, render: (value) => value ?? '—' },
    {
      title: 'Giờ uống', dataIndex: 'gioUong', key: 'gioUong', width: 200,
      render: (times) => times?.length ? times.map((time) => <Tag key={time}>{time}</Tag>) : '—',
    },
    {
      title: 'Thời gian dùng', key: 'duration', width: 185,
      render: (_, row) => `${displayDate(row.ngayBatDau)} – ${row.ngayKetThuc ? displayDate(row.ngayKetThuc) : 'Chưa có ngày kết thúc'}`,
    },
    { title: 'Bác sĩ kê đơn (bên ngoài)', dataIndex: 'bacSiKeDon', key: 'bacSiKeDon', width: 195, render: (value) => value || 'Chưa cập nhật' },
    { title: 'Ngày ghi đơn', dataIndex: 'ngayKeDon', key: 'ngayKeDon', width: 140, render: displayDate },
    {
      title: 'Trạng thái đơn', dataIndex: 'trangThaiDon', key: 'trangThaiDon', width: 155,
      render: (value) => <StatusTag {...statusMeta[value]} size="small" />,
    },
  ];

  return (
    <section className="medication-list-panel elderly-medication-panel">
      <div className="medication-list-heading">
        <div>
          <h3>Thuốc theo từng người cao tuổi</h3>
          <p>Thuốc được lấy từ đơn đã nhập sau khi khám bên ngoài, không phải toàn bộ kho thuốc.</p>
        </div>
        {canCreatePrescription && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/lich-uong-thuoc')}>
            Đến trang tạo đơn thuốc
          </Button>
        )}
      </div>

      <div className="elderly-medication-filters">
        <Select
          showSearch
          optionFilterProp="label"
          placeholder="Chọn người cao tuổi"
          value={selectedElderId}
          onChange={(id) => {
            setSelectedElderId(id);
            setPrescriptions([]);
            setLoadingPrescriptions(true);
            setError('');
            setSearch('');
          }}
          options={elders.map((elder) => ({
            value: elder.id,
            label: `${elder.hoTen} · ${formatEntityCode('NCT', elder.id)}`,
          }))}
          loading={loadingElders}
          className="elderly-medication-select"
          aria-label="Chọn người cao tuổi"
        />
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'active', label: 'Đang dùng' },
            { value: 'upcoming', label: 'Sắp dùng' },
            { value: 'ended', label: 'Đã kết thúc' },
            { value: 'all', label: 'Tất cả đơn' },
          ]}
          className="elderly-medication-status"
          aria-label="Lọc trạng thái đơn thuốc"
        />
        <Input
          allowClear
          prefix={<SearchOutlined />}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Tìm thuốc trong đơn..."
          className="elderly-medication-search"
        />
      </div>

      {selectedElder && (
        <div className="elderly-medication-summary">
          <span className="medication-catalog-icon"><MedicineBoxOutlined /></span>
          <div>
            <strong>{selectedElder.hoTen}</strong>
            <span>{formatEntityCode('NCT', selectedElder.id)} · {prescriptions.length} đơn thuốc · {rows.filter((row) => row.trangThaiDon === 'active').length} thuốc đang dùng</span>
          </div>
        </div>
      )}
      {error && <Alert type="error" showIcon message={error} className="elderly-medication-error" />}
      <DataTable
        key={selectedElderId ?? 'none'}
        columns={columns}
        dataSource={filteredRows}
        rowKey="key"
        loading={loadingElders || loadingPrescriptions}
        emptyDescription={elders.length === 0
          ? 'Chưa có người cao tuổi được phân công hoặc chưa có hồ sơ'
          : statusFilter === 'active'
            ? 'Người cao tuổi này chưa có thuốc đang dùng. Chọn “Tất cả đơn” để xem lịch sử.'
            : 'Không có thuốc phù hợp trong các đơn đã nhập'}
      />
    </section>
  );
};

export default ElderlyMedicationsPanel;
