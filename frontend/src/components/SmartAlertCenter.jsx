import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Progress,
  Segmented,
  Skeleton,
  Space,
  Tag,
  message,
} from 'antd';
import {
  AlertOutlined,
  BulbOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  FireOutlined,
  RightOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { getAlerts, markAlertSeen, resolveAlert } from '../services/alertService';
import { getCurrentUser } from '../services/authService';
import usePermission from '../hooks/usePermission';
import ModalForm, { FormSection } from './ModalForm';

const PRIORITY_META = {
  KHAN_CAP: { label: 'Khẩn cấp', color: '#C0392B', bg: '#FFF1F0' },
  CAO: { label: 'Ưu tiên cao', color: '#E15554', bg: '#FDEEEE' },
  TRUNG_BINH: { label: 'Cần theo dõi', color: '#B97808', bg: '#FFF7E6' },
  THAP: { label: 'Theo dõi', color: '#2E7D9A', bg: '#EBF5FB' },
};

const formatWaitingTime = (minutes = 0) => {
  if (minutes < 1) return 'Vừa ghi nhận';
  if (minutes < 60) return `${minutes} phút`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút`;
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  return `${days} ngày${hours ? ` ${hours} giờ` : ''}`;
};

const SmartAlertCenter = ({ onChanged }) => {
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const canEdit = hasPermission('QLCANHBAO', 'sua');
  const currentUser = getCurrentUser();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [form] = Form.useForm();

  const loadAlerts = useCallback(async () => {
    try {
      const data = await getAlerts();
      setAlerts(data);
      setLastUpdated(dayjs());
    } catch {
      message.error('Không thể tải trung tâm cảnh báo');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAlerts();
    const timer = window.setInterval(loadAlerts, 30000);
    return () => window.clearInterval(timer);
  }, [loadAlerts]);

  const openAlerts = useMemo(() => alerts
    .filter((item) => item.trangThai === 'CHUA_XU_LY' || item.trangThai === 'DA_XEM')
    .sort((a, b) => (b.diemUuTien || 0) - (a.diemUuTien || 0)
      || new Date(a.thoiGianPhatHien) - new Date(b.thoiGianPhatHien)), [alerts]);

  const summary = useMemo(() => ({
    total: openAlerts.length,
    urgent: openAlerts.filter((item) => item.uuTien === 'KHAN_CAP').length,
    high: openAlerts.filter((item) => item.uuTien === 'CAO').length,
    overdue: openAlerts.filter((item) => item.quaSla).length,
  }), [openAlerts]);

  const filteredAlerts = useMemo(() => {
    if (filter === 'SLA') return openAlerts.filter((item) => item.quaSla);
    if (filter === 'ALL') return openAlerts;
    return openAlerts.filter((item) => item.uuTien === filter);
  }, [filter, openAlerts]);

  const refreshAll = async () => {
    await loadAlerts();
    onChanged?.();
  };

  const handleSeen = async (alertItem) => {
    try {
      await markAlertSeen(alertItem.id, currentUser?.hoTen || 'Hệ thống');
      message.success(`Đã tiếp nhận cảnh báo của ${alertItem.nguoiCaoTuoiTen}`);
      await refreshAll();
    } catch {
      message.error('Không thể tiếp nhận cảnh báo');
    }
  };

  const handleResolve = async (values) => {
    setSaving(true);
    try {
      await resolveAlert(selectedAlert.id, currentUser?.hoTen || 'Hệ thống', values.ghiChu);
      message.success('Đã xử lý và lưu kết quả cảnh báo');
      setSelectedAlert(null);
      form.resetFields();
      await refreshAll();
    } catch {
      message.error('Không thể xử lý cảnh báo');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card className="smart-alert-center" bordered={false}>
        <div className="smart-alert-header">
          <div>
            <div className="smart-alert-eyebrow">
              <span className="smart-live-dot" /> ĐANG THEO DÕI
            </div>
            <h2><SafetyCertificateOutlined /> Trung tâm cảnh báo thông minh</h2>
            <p>Tự động xếp hạng theo mức độ, thời gian chờ và tần suất cảnh báo trong 7 ngày.</p>
          </div>
          <Button type="link" onClick={() => navigate('/canh-bao')}>
            Xem toàn bộ <RightOutlined />
          </Button>
        </div>

        <div className="smart-alert-summary">
          <div className="smart-summary-item smart-summary-total">
            <AlertOutlined />
            <div><strong>{summary.total}</strong><span>Đang chờ xử lý</span></div>
          </div>
          <div className="smart-summary-item smart-summary-urgent">
            <FireOutlined />
            <div><strong>{summary.urgent}</strong><span>Ưu tiên khẩn</span></div>
          </div>
          <div className="smart-summary-item smart-summary-high">
            <SafetyCertificateOutlined />
            <div><strong>{summary.high}</strong><span>Ưu tiên cao</span></div>
          </div>
          <div className="smart-summary-item smart-summary-overdue">
            <ClockCircleOutlined />
            <div><strong>{summary.overdue}</strong><span>Quá thời gian phản hồi</span></div>
          </div>
        </div>

        <div className="smart-alert-filter">
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { label: `Tất cả (${summary.total})`, value: 'ALL' },
              { label: `Khẩn (${summary.urgent})`, value: 'KHAN_CAP' },
              { label: `Ưu tiên cao (${summary.high})`, value: 'CAO' },
              { label: `Quá hạn (${summary.overdue})`, value: 'SLA' },
            ]}
          />
          <span>Cập nhật {lastUpdated?.format('HH:mm') || '—'} · tự làm mới 30 giây</span>
        </div>

        {loading ? (
          <div className="smart-alert-loading"><Skeleton active paragraph={{ rows: 5 }} /></div>
        ) : filteredAlerts.length === 0 ? (
          <Empty
            className="smart-alert-empty"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={filter === 'ALL'
              ? 'Chưa có cảnh báo đang chờ. Hãy nhập chỉ số sức khỏe để hệ thống tự đánh giá.'
              : 'Không có cảnh báo trong nhóm này'}
          >
            {filter === 'ALL' && (
              <Button type="primary" onClick={() => navigate('/chi-so-suc-khoe')}>
                Nhập chỉ số sức khỏe
              </Button>
            )}
          </Empty>
        ) : (
          <div className="smart-alert-list">
            {filteredAlerts.slice(0, 6).map((item) => {
              const meta = PRIORITY_META[item.uuTien] || PRIORITY_META.THAP;
              return (
                <article
                  key={item.id}
                  className={`smart-alert-item smart-priority-${item.uuTien?.toLowerCase() || 'thap'}`}
                >
                  <div className="smart-score">
                    <Progress
                      type="circle"
                      percent={item.diemUuTien || 0}
                      size={58}
                      strokeWidth={9}
                      strokeColor={meta.color}
                      trailColor="#E9EEF1"
                      format={(value) => <span>{value}</span>}
                    />
                    <small>điểm</small>
                  </div>

                  <div className="smart-alert-main">
                    <div className="smart-alert-title-row">
                      <div>
                        <h3>{item.nguoiCaoTuoiTen}</h3>
                        <span>{item.loaiCanhBaoLabel}</span>
                      </div>
                      <Space size={6} wrap>
                        <Tag style={{ color: meta.color, background: meta.bg, borderColor: `${meta.color}55` }}>
                          {item.uuTienLabel}
                        </Tag>
                        {item.quaSla && <Tag color="error">Quá SLA</Tag>}
                        <Tag color={item.trangThai === 'DA_XEM' ? 'gold' : 'blue'}>
                          {item.trangThai === 'DA_XEM' ? 'Đã tiếp nhận' : 'Chưa tiếp nhận'}
                        </Tag>
                      </Space>
                    </div>

                    <p className="smart-alert-description">{item.moTa}</p>

                    <div className="smart-alert-insight">
                      <div>
                        <BulbOutlined />
                        <span><strong>Vì sao ưu tiên:</strong> {(item.lyDoUuTien || []).join(' • ')}</span>
                      </div>
                      <div>
                        <CheckCircleOutlined />
                        <span><strong>Đề xuất:</strong> {item.khuyenNghi}</span>
                      </div>
                    </div>

                    <div className="smart-alert-footer">
                      <span className={item.quaSla ? 'smart-wait-overdue' : ''}>
                        <ClockCircleOutlined /> Chờ {formatWaitingTime(item.thoiGianChoPhut)} · SLA {formatWaitingTime(item.slaPhut)}
                      </span>
                      {canEdit && (
                        <Space>
                          {item.trangThai === 'CHUA_XU_LY' && (
                            <Button size="small" icon={<EyeOutlined />} onClick={() => handleSeen(item)}>
                              Tiếp nhận
                            </Button>
                          )}
                          <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => setSelectedAlert(item)}>
                            Xử lý
                          </Button>
                        </Space>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
            {filteredAlerts.length > 6 && (
              <Button block type="text" onClick={() => navigate('/canh-bao')}>
                Xem thêm {filteredAlerts.length - 6} cảnh báo <RightOutlined />
              </Button>
            )}
          </div>
        )}

        <Alert
          className="smart-alert-note"
          type="info"
          showIcon
          message="Điểm ưu tiên là gợi ý hỗ trợ điều phối, được tính từ mức độ cảnh báo, thời gian chờ, loại cảnh báo và tần suất lặp lại. Nhân viên y tế vẫn là người quyết định xử lý."
        />
      </Card>

      <ModalForm
        title="Xử lý nhanh cảnh báo"
        subtitle={selectedAlert ? `${selectedAlert.nguoiCaoTuoiTen} — ${selectedAlert.loaiCanhBaoLabel}` : ''}
        icon={<AlertOutlined />}
        saveIcon={<CheckCircleOutlined />}
        open={!!selectedAlert}
        onCancel={() => { setSelectedAlert(null); form.resetFields(); }}
        onFinish={handleResolve}
        loading={saving}
        saveLabel="Hoàn tất xử lý"
        form={form}
      >
        {selectedAlert && (
          <div className="smart-resolve-context">
            <strong>{selectedAlert.moTa}</strong>
            <span>{selectedAlert.khuyenNghi}</span>
          </div>
        )}
        <FormSection title="Kết quả xử lý" description="Ghi rõ hành động đã thực hiện để phục vụ theo dõi và đối soát">
          <Form.Item
            name="ghiChu"
            label="Ghi chú xử lý"
            rules={[
              { required: true, message: 'Vui lòng nhập ghi chú xử lý' },
              { max: 500, message: 'Ghi chú tối đa 500 ký tự' },
            ]}
          >
            <Input.TextArea
              autoSize={{ minRows: 4, maxRows: 8 }}
              placeholder="Ví dụ: Đã liên hệ người chăm sóc, đo lại huyết áp và chuyển bác sĩ đánh giá..."
              showCount
              maxLength={500}
            />
          </Form.Item>
        </FormSection>
      </ModalForm>
    </>
  );
};

export default SmartAlertCenter;
