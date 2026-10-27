import React, { useEffect, useMemo, useState } from 'react';
import { Button, DatePicker, Form, Input, message, Select, Space, Tag } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertOutlined, CheckCircleOutlined, CheckOutlined, ClockCircleOutlined,
  EnvironmentOutlined, EyeOutlined, MedicineBoxOutlined, PhoneOutlined,
  SearchOutlined, SafetyCertificateOutlined, UserOutlined, WarningOutlined,
} from '@ant-design/icons';
import { parseAlertTime, formatAlertTime, vietnamAlertParts, alertElapsedMinutes } from '../../utils/alertTime';
import {
  getAlerts, getEmergencyAlerts, markAlertSeen, markEmergencyAlertSeen,
  resolveAlert, resolveEmergencyAlert,
} from '../../services/alertService';
import { getCurrentUser } from '../../services/authService';
import { getElders } from '../../services/elderlyService';
import { getCaregivers } from '../../services/caregiverService';
import DataTable from '../../components/DataTable';
import ModalForm, { FormSection } from '../../components/ModalForm';
import StatusTag, { getAlertLevelStatus, getAlertStatusMap } from '../../components/StatusTag';
import usePermission from '../../hooks/usePermission';
import TableAvatar from '../../components/TableAvatar';
import { formatEntityCode } from '../../utils/displayUtils';
import RecordDetailModal from '../../components/RecordDetailModal';
import { getSocket } from '../../services/socketClient';

const MUC_DO_ORDER = { THAP: 1, TRUNG_BINH: 2, CAO: 3, KHAN_CAP: 4 };

const sortAlerts = (items) => [...items].sort((a, b) => {
  const severity = (MUC_DO_ORDER[b.mucDo] || 0) - (MUC_DO_ORDER[a.mucDo] || 0);
  if (severity !== 0) return severity;
  return (parseAlertTime(b.thoiGianPhatHien)?.getTime() || 0) - (parseAlertTime(a.thoiGianPhatHien)?.getTime() || 0);
});

const settledValue = (result) => (result.status === 'fulfilled' && Array.isArray(result.value) ? result.value : []);

const fetchAlertBundle = async () => {
  const results = await Promise.allSettled([
    getAlerts(),
    getEmergencyAlerts(),
    getElders(),
    getCaregivers(),
  ]);
  const rawHealthAlerts = settledValue(results[0]);
  const rawEmergencyAlerts = settledValue(results[1]);
  const elders = settledValue(results[2]);
  const caregivers = settledValue(results[3]);
  const elderById = new Map(elders.map((item) => [Number(item.id), item]));
  const caregiverById = new Map(caregivers.map((item) => [Number(item.id), item]));

  const enrich = (item, sourceType) => {
    const elder = elderById.get(Number(item.nguoiCaoTuoiId));
    const caregiver = elder?.nguoiChamSocId
      ? caregiverById.get(Number(elder.nguoiChamSocId))
      : null;
    return {
      ...item,
      sourceType,
      nguoiCaoTuoiTen: item.nguoiCaoTuoiTen || elder?.hoTen || 'Chưa cập nhật',
      nguoiChamSocTen: elder?.nguoiChamSocTen || caregiver?.hoTen || '',
      nguoiChamSocSoDienThoai: caregiver?.soDienThoai || '',
    };
  };

  // SOS có bản ghi liên kết trong CanhBao; loại khỏi tab sức khỏe để không hiển thị trùng.
  const healthAlerts = rawHealthAlerts
    .filter((item) => item.nguonBang !== 'CanhBaoKhanCap')
    .map((item) => enrich(item, 'health'));
  const emergencyAlerts = rawEmergencyAlerts.map((item) => enrich(item, 'sos'));

  return {
    healthAlerts: sortAlerts(healthAlerts),
    emergencyAlerts: sortAlerts(emergencyAlerts),
    rawHealthAlerts,
  };
};

const formatRelativeTime = (value) => {
  const minutes = alertElapsedMinutes(value);
  if (minutes == null) return 'Thời gian chưa hợp lệ';
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày trước`;
  return formatAlertTime(value);
};

const getDurationMinutes = (item) => {
  const createdAt = item.sourceType === 'sos' ? item.ngayTao : item.thoiGianPhatHien;
  if (!createdAt || !item.thoiGianXuLy) return null;
  return alertElapsedMinutes(createdAt, item.thoiGianXuLy);
};

const formatDuration = (minutes) => {
  if (minutes === null || minutes === undefined) return '—';
  if (minutes < 1) return 'Dưới 1 phút';
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours} giờ ${remainingMinutes} phút` : `${hours} giờ`;
};

const AlertCard = ({ alert, canEdit, onAccept, onResolve, onDetail, onProfile }) => {
  const level = getAlertLevelStatus(alert.mucDo);
  const status = getAlertStatusMap(alert.trangThai);
  const phoneHref = alert.nguoiChamSocSoDienThoai
    ? `tel:${alert.nguoiChamSocSoDienThoai.replace(/[^+\d]/g, '')}`
    : undefined;
  const hasCoordinates = alert.sourceType === 'sos'
    && alert.viDo !== null && alert.viDo !== undefined
    && alert.kinhDo !== null && alert.kinhDo !== undefined;

  return (
    <article
      className={`alert-center-card severity-${String(alert.mucDo || '').toLowerCase()}`}
      onClick={() => onDetail(alert)}
    >
      <header className="alert-card-header">
        <div className="alert-card-person">
          <TableAvatar name={alert.nguoiCaoTuoiTen} size={48} />
          <div>
            <div className="alert-card-person-name">
              <strong>{alert.nguoiCaoTuoiTen}</strong>
              <span>{formatEntityCode('NCT', alert.nguoiCaoTuoiId)}</span>
            </div>
            <small>{alert.loaiCanhBaoLabel || 'Cảnh báo sức khỏe'}</small>
          </div>
        </div>
        <Space size={[6, 6]} wrap>
          <StatusTag {...level} size="small" />
          <StatusTag {...status} size="small" />
        </Space>
      </header>

      <div className="alert-card-body">
        <div className="alert-card-content">
          <small>Nội dung cảnh báo</small>
          <p>{alert.moTa || 'Không có nội dung chi tiết.'}</p>
          <div className="alert-card-time">
            <ClockCircleOutlined />
            <strong>{formatRelativeTime(alert.thoiGianPhatHien)}</strong>
            <span>{formatAlertTime(alert.thoiGianPhatHien)}</span>
          </div>
        </div>

        <aside className="alert-card-caregiver">
          <small>Người chăm sóc</small>
          {alert.nguoiChamSocTen ? (
            <>
              <strong>{alert.nguoiChamSocTen}</strong>
              <span>{alert.nguoiChamSocSoDienThoai || 'Chưa cập nhật số điện thoại'}</span>
            </>
          ) : <span>Chưa gán người chăm sóc</span>}
        </aside>
      </div>

      {hasCoordinates && (
        <div className="alert-location-block">
          <EnvironmentOutlined />
          <div>
            <strong>Vị trí gửi SOS</strong>
            <span>{alert.viDo}, {alert.kinhDo}</span>
          </div>
          <a
            href={`https://www.google.com/maps?q=${alert.viDo},${alert.kinhDo}`}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
          >
            Mở Google Maps
          </a>
        </div>
      )}

      <footer className="alert-card-actions" onClick={(event) => event.stopPropagation()}>
        {canEdit && alert.trangThai === 'CHUA_XU_LY' && (
          <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => onAccept(alert)}>Tiếp nhận</Button>
        )}
        {canEdit && alert.trangThai === 'DA_XEM' && (
          <Button type="primary" icon={<CheckOutlined />} onClick={() => onResolve(alert)}>Đánh dấu đã xử lý</Button>
        )}
        <Button icon={<PhoneOutlined />} href={phoneHref} disabled={!phoneHref}>Gọi người chăm sóc</Button>
        <Button icon={<EyeOutlined />} onClick={() => onProfile(alert)}>Xem hồ sơ</Button>
      </footer>
    </article>
  );
};

const AlertsPage = () => {
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const canEdit = hasPermission('QLCANHBAO', 'sua');
  const [healthAlerts, setHealthAlerts] = useState([]);
  const [emergencyAlerts, setEmergencyAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterLevel, setFilterLevel] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [historyDates, setHistoryDates] = useState(null);
  const [resolveModal, setResolveModal] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [detailRecord, setDetailRecord] = useState(null);
  const [form] = Form.useForm();
  const currentUser = getCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightedAlertId = searchParams.get('highlight');
  const activeTab = searchParams.get('tab') === 'sos' ? 'sos' : 'health';

  const applyBundle = (bundle) => {
    setHealthAlerts(bundle.healthAlerts);
    setEmergencyAlerts(bundle.emergencyAlerts);
  };

  const refreshData = async () => {
    setLoading(true);
    try {
      applyBundle(await fetchAlertBundle());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    fetchAlertBundle()
      .then((bundle) => { if (active) applyBundle(bundle); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!highlightedAlertId) return undefined;
    let cancelled = false;
    fetchAlertBundle()
      .then((bundle) => {
        if (cancelled) return;
        applyBundle(bundle);
        const linkedHealthAlert = bundle.rawHealthAlerts.find(
          (item) => String(item.id) === String(highlightedAlertId),
        );
        const emergencyTarget = linkedHealthAlert?.nguonBang === 'CanhBaoKhanCap'
          ? bundle.emergencyAlerts.find((item) => String(item.canhBaoId) === String(highlightedAlertId)
            || String(item.id) === String(linkedHealthAlert.nguonId))
          : bundle.emergencyAlerts.find((item) => String(item.canhBaoId) === String(highlightedAlertId));
        const healthTarget = bundle.healthAlerts.find((item) => String(item.id) === String(highlightedAlertId));
        const target = emergencyTarget || healthTarget;
        if (target) setDetailRecord(target);
        else message.warning('Không tìm thấy cảnh báo cần xem hoặc bạn không có quyền truy cập.');

        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('highlight');
        if (emergencyTarget) nextParams.set('tab', 'sos');
        else nextParams.delete('tab');
        setSearchParams(nextParams, { replace: true });
      })
      .catch(() => {
        if (!cancelled) message.error('Không thể tải chi tiết cảnh báo. Vui lòng thử lại.');
      });
    return () => { cancelled = true; };
  }, [highlightedAlertId, searchParams, setSearchParams]);

  useEffect(() => {
    const socket = getSocket();
    const refreshAlerts = () => {
      fetchAlertBundle().then(applyBundle);
    };
    socket.on('canhbao:new', refreshAlerts);
    socket.on('canhbao:updated', refreshAlerts);
    return () => {
      socket.off('canhbao:new', refreshAlerts);
      socket.off('canhbao:updated', refreshAlerts);
    };
  }, []);

  const allAlerts = useMemo(
    () => sortAlerts([...emergencyAlerts, ...healthAlerts]),
    [emergencyAlerts, healthAlerts],
  );

  const filteredCards = useMemo(() => {
    const source = activeTab === 'sos' ? emergencyAlerts : healthAlerts;
    const keyword = search.trim().toLocaleLowerCase('vi');
    return source.filter((item) => {
      const matchesSearch = !keyword || [
        item.nguoiCaoTuoiTen,
        formatEntityCode('NCT', item.nguoiCaoTuoiId),
        item.moTa,
        item.nguoiChamSocTen,
      ].some((value) => String(value || '').toLocaleLowerCase('vi').includes(keyword));
      return matchesSearch
        && (!filterLevel || item.mucDo === filterLevel)
        && (!filterStatus || item.trangThai === filterStatus);
    });
  }, [activeTab, emergencyAlerts, filterLevel, filterStatus, healthAlerts, search]);

  const historyAlerts = useMemo(() => allAlerts.filter((item) => {
    if (!historyDates?.[0] || !historyDates?.[1]) return true;
    const day = vietnamAlertParts(item.thoiGianPhatHien)?.dayKey;
    return day != null && day >= historyDates[0].format('YYYY-MM-DD')
      && day <= historyDates[1].format('YYYY-MM-DD');
  }), [allAlerts, historyDates]);

  const kpi = useMemo(() => {
    const resolvedDurations = allAlerts
      .filter((item) => item.trangThai === 'DA_XU_LY')
      .map(getDurationMinutes)
      .filter((value) => value !== null);
    return {
      unresolved: allAlerts.filter((item) => item.trangThai === 'CHUA_XU_LY').length,
      accepted: allAlerts.filter((item) => item.trangThai === 'DA_XEM').length,
      resolvedToday: allAlerts.filter((item) => (
        item.trangThai === 'DA_XU_LY'
        && item.thoiGianXuLy
        && vietnamAlertParts(item.thoiGianXuLy)?.dayKey === vietnamAlertParts(new Date().toISOString())?.dayKey
      )).length,
      averageMinutes: resolvedDurations.length
        ? Math.round(resolvedDurations.reduce((sum, value) => sum + value, 0) / resolvedDurations.length)
        : null,
    };
  }, [allAlerts]);

  const setTab = (tab) => {
    const nextParams = new URLSearchParams(searchParams);
    if (tab === 'sos') nextParams.set('tab', 'sos');
    else nextParams.delete('tab');
    setSearchParams(nextParams, { replace: true });
  };

  const handleMarkSeen = async (alert) => {
    if (alert.sourceType === 'sos') await markEmergencyAlertSeen(alert.id);
    else await markAlertSeen(alert.id, currentUser?.hoTen || 'Hệ thống');
    message.success('Đã tiếp nhận cảnh báo');
    await refreshData();
  };

  const openResolveModal = (alert) => {
    setSelectedAlert(alert);
    form.resetFields();
    setResolveModal(true);
  };

  const handleResolve = async (values) => {
    setSaving(true);
    try {
      if (selectedAlert.sourceType === 'sos') await resolveEmergencyAlert(selectedAlert.id, values.ghiChu);
      else await resolveAlert(selectedAlert.id, currentUser?.hoTen || 'Hệ thống', values.ghiChu);
      message.success('Đã xử lý cảnh báo thành công');
      setResolveModal(false);
      form.resetFields();
      await refreshData();
    } finally {
      setSaving(false);
    }
  };

  const historyColumns = [
    {
      title: 'Thời gian', dataIndex: 'thoiGianPhatHien', key: 'thoiGianPhatHien', width: 150,
      render: (value) => formatAlertTime(value),
    },
    {
      title: 'Người cao tuổi', key: 'elderly', width: 220,
      render: (_, record) => (
        <div className="history-elder-cell">
          <TableAvatar name={record.nguoiCaoTuoiTen} size={34} />
          <span><strong>{record.nguoiCaoTuoiTen}</strong><small>{formatEntityCode('NCT', record.nguoiCaoTuoiId)}</small></span>
        </div>
      ),
    },
    {
      title: 'Loại', dataIndex: 'loaiCanhBaoLabel', key: 'loaiCanhBaoLabel', width: 160,
      render: (value) => <Tag className="alert-type-tag">{value || 'Cảnh báo sức khỏe'}</Tag>,
    },
    {
      title: 'Mức độ', dataIndex: 'mucDo', key: 'mucDo', width: 130,
      render: (value) => <StatusTag {...getAlertLevelStatus(value)} size="small" />,
    },
    {
      title: 'Người xử lý', dataIndex: 'nguoiXuLy', key: 'nguoiXuLy', width: 160,
      render: (value) => value || <span className="muted-value">Chưa tiếp nhận</span>,
    },
    {
      title: 'Thời gian xử lý', key: 'duration', width: 145,
      render: (_, record) => formatDuration(getDurationMinutes(record)),
    },
    {
      title: 'Kết quả xử lý', dataIndex: 'ghiChuXuLy', key: 'ghiChuXuLy', width: 240,
      render: (value) => value || <span className="muted-value">Chưa có kết quả</span>,
    },
    {
      title: 'Trạng thái', dataIndex: 'trangThai', key: 'trangThai', width: 140,
      render: (value) => <StatusTag {...getAlertStatusMap(value)} size="small" />,
    },
  ];

  return (
    <div className="alert-center-page">
      <section className="alert-center-heading">
        <div>
          <span className="alert-center-eyebrow"><span /> Trung tâm điều phối cảnh báo</span>
          <h1>Trung tâm Tiếp nhận & Điều phối Cảnh báo</h1>
          <p>Giám sát, tiếp nhận và xử lý cảnh báo SOS cùng các bất thường sức khỏe.</p>
        </div>
      </section>

      <section className="alert-kpi-grid">
        <article className="alert-kpi-card is-unresolved">
          <span><AlertOutlined /></span>
          <div><small>Chưa xử lý</small><strong>{kpi.unresolved}</strong><em>cảnh báo</em></div>
        </article>
        <article className="alert-kpi-card is-accepted">
          <span><UserOutlined /></span>
          <div><small>Đang tiếp nhận</small><strong>{kpi.accepted}</strong><em>cảnh báo</em></div>
        </article>
        <article className="alert-kpi-card is-resolved">
          <span><CheckCircleOutlined /></span>
          <div><small>Đã xử lý hôm nay</small><strong>{kpi.resolvedToday}</strong><em>cảnh báo</em></div>
        </article>
        {kpi.averageMinutes !== null && (
          <article className="alert-kpi-card is-time">
            <span><ClockCircleOutlined /></span>
            <div><small>Thời gian xử lý trung bình</small><strong>{formatDuration(kpi.averageMinutes)}</strong><em>Từ lúc tạo đến khi xử lý</em></div>
          </article>
        )}
      </section>

      <section className="alert-workspace">
        <div className="alert-tab-list" role="tablist">
          <button type="button" className={activeTab === 'sos' ? 'is-active is-sos' : ''} onClick={() => setTab('sos')}>
            <WarningOutlined /> SOS khẩn cấp <b>{emergencyAlerts.length}</b>
          </button>
          <button type="button" className={activeTab === 'health' ? 'is-active' : ''} onClick={() => setTab('health')}>
            <MedicineBoxOutlined /> Cảnh báo sức khỏe <b>{healthAlerts.length}</b>
          </button>
        </div>

        <div className="alert-filter-bar">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Tìm theo tên, mã NCT, nội dung cảnh báo"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select
            value={filterLevel || undefined}
            placeholder="Tất cả mức độ"
            allowClear
            onChange={(value) => setFilterLevel(value || '')}
            options={[
              { value: 'THAP', label: 'Thấp' },
              { value: 'TRUNG_BINH', label: 'Trung bình' },
              { value: 'CAO', label: 'Cao' },
              { value: 'KHAN_CAP', label: 'Khẩn cấp' },
            ]}
          />
          <Select
            value={filterStatus || undefined}
            placeholder="Tất cả trạng thái"
            allowClear
            onChange={(value) => setFilterStatus(value || '')}
            options={[
              { value: 'CHUA_XU_LY', label: 'Chưa xử lý' },
              { value: 'DA_XEM', label: 'Đang tiếp nhận' },
              { value: 'DA_XU_LY', label: 'Đã xử lý' },
              { value: 'BO_QUA', label: 'Bỏ qua' },
            ]}
          />
        </div>

        <div className="alert-card-list" aria-busy={loading}>
          {filteredCards.map((alert) => (
            <AlertCard
              key={`${alert.sourceType}-${alert.id}`}
              alert={alert}
              canEdit={canEdit}
              onAccept={handleMarkSeen}
              onResolve={openResolveModal}
              onDetail={setDetailRecord}
              onProfile={(item) => navigate(`/ho-so-nguoi-cao-tuoi?keyword=${encodeURIComponent(formatEntityCode('NCT', item.nguoiCaoTuoiId))}`)}
            />
          ))}
          {!loading && filteredCards.length === 0 && (
            <div className="alert-empty-state">
              <SafetyCertificateOutlined />
              <strong>Không có cảnh báo phù hợp</strong>
              <span>Hãy thay đổi từ khóa hoặc điều kiện lọc.</span>
            </div>
          )}
        </div>
      </section>

      <section className="alert-history-panel">
        <header>
          <div>
            <h2>Lịch sử cảnh báo</h2>
            <p>Theo dõi toàn bộ quá trình tiếp nhận và kết quả xử lý.</p>
          </div>
          <DatePicker.RangePicker
            format="DD/MM/YYYY"
            placeholder={['Từ ngày', 'Đến ngày']}
            value={historyDates}
            onChange={setHistoryDates}
          />
        </header>
        <DataTable
          columns={historyColumns}
          dataSource={historyAlerts}
          rowKey={(record) => `${record.sourceType}-${record.id}`}
          loading={loading}
          pageSize={8}
          emptyDescription="Chưa có lịch sử cảnh báo"
        />
      </section>

      <RecordDetailModal
        open={!!detailRecord}
        onClose={() => setDetailRecord(null)}
        title={`Chi tiết cảnh báo — ${detailRecord?.nguoiCaoTuoiTen || ''}`}
        record={detailRecord}
        fields={[
          { label: 'Mã cảnh báo', key: 'id', render: (value, record) => formatEntityCode(record.sourceType === 'sos' ? 'SOS' : 'CB', value) },
          { label: 'Người cao tuổi', key: 'nguoiCaoTuoiTen' },
          { label: 'Mã NCT', key: 'nguoiCaoTuoiId', render: (value) => formatEntityCode('NCT', value) },
          { label: 'Loại cảnh báo', key: 'loaiCanhBaoLabel' },
          { label: 'Mức độ', key: 'mucDo', render: (value) => <StatusTag {...getAlertLevelStatus(value)} /> },
          { label: 'Trạng thái', key: 'trangThai', render: (value) => <StatusTag {...getAlertStatusMap(value)} /> },
          { label: 'Thời gian', key: 'thoiGianPhatHien', render: (value) => formatAlertTime(value) },
          { label: 'Nội dung', key: 'moTa', span: 2 },
          { label: 'Người chăm sóc', key: 'nguoiChamSocTen' },
          { label: 'SĐT người chăm sóc', key: 'nguoiChamSocSoDienThoai' },
          {
            label: 'Vị trí', key: 'viDo', span: 2,
            render: (value, record) => value !== null && value !== undefined && record.kinhDo !== null && record.kinhDo !== undefined
              ? <a href={`https://www.google.com/maps?q=${value},${record.kinhDo}`} target="_blank" rel="noreferrer">{value}, {record.kinhDo} · Mở Google Maps</a>
              : null,
          },
          { label: 'Người xử lý', key: 'nguoiXuLy' },
          { label: 'Thời gian xử lý', key: 'thoiGianXuLy', render: (value) => value ? formatAlertTime(value) : null },
          { label: 'Kết quả xử lý', key: 'ghiChuXuLy', span: 2 },
        ]}
      />

      <ModalForm
        title="Xử lý cảnh báo"
        subtitle="Ghi nhận nội dung và kết quả xử lý cảnh báo"
        icon={<AlertOutlined />}
        saveIcon={<CheckOutlined />}
        open={resolveModal}
        onCancel={() => { setResolveModal(false); form.resetFields(); }}
        onFinish={handleResolve}
        loading={saving}
        saveLabel="Xác nhận xử lý"
        form={form}
      >
        {selectedAlert && (
          <div className="alert-resolve-summary">
            <strong>{selectedAlert.nguoiCaoTuoiTen}</strong>
            <span>{selectedAlert.moTa}</span>
          </div>
        )}
        <FormSection title="Kết quả xử lý" description="Mô tả hành động đã thực hiện và tình trạng sau xử lý">
          <Form.Item
            name="ghiChu"
            label="Ghi chú xử lý"
            rules={[{ required: true, message: 'Vui lòng nhập ghi chú xử lý cảnh báo' }]}
          >
            <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} placeholder="Mô tả cách đã xử lý cảnh báo và kết quả hiện tại..." />
          </Form.Item>
        </FormSection>
      </ModalForm>
    </div>
  );
};

export default AlertsPage;
