import React, { useState, useMemo } from 'react';
import { Button, DatePicker, Empty, Progress, Space, Tag, Segmented } from 'antd';
import {
  CalendarOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import StatusTag, { getMedStatusMap } from './StatusTag';
import { formatPortalTime } from '../utils/relativePortalData';

const SHIFTS = [
  {
    key: 'MORNING',
    label: 'Buổi Sáng',
    icon: '🌅',
    range: '05:00 - 10:59',
    badgeColor: '#e6f7ff',
    border: '#91d5ff',
    tagColor: 'cyan',
  },
  {
    key: 'NOON',
    label: 'Buổi Trưa',
    icon: '☀️',
    range: '11:00 - 13:59',
    badgeColor: '#fffbe6',
    border: '#ffe58f',
    tagColor: 'gold',
  },
  {
    key: 'AFTERNOON',
    label: 'Buổi Chiều',
    icon: '🌤️',
    range: '14:00 - 17:59',
    badgeColor: '#fff7e6',
    border: '#ffd591',
    tagColor: 'orange',
  },
  {
    key: 'EVENING',
    label: 'Buổi Tối & Đêm',
    icon: '🌙',
    range: '18:00 - 04:59',
    badgeColor: '#f9f0ff',
    border: '#d3adf7',
    tagColor: 'purple',
  },
];

const getShiftKey = (timeStr) => {
  if (!timeStr) return 'MORNING';
  const time = timeStr.includes('T') ? timeStr.split('T')[1].slice(0, 5) : timeStr.slice(11, 16);
  if (!time) return 'MORNING';
  const hour = parseInt(time.split(':')[0], 10);
  if (hour >= 5 && hour < 11) return 'MORNING';
  if (hour >= 11 && hour < 14) return 'NOON';
  if (hour >= 14 && hour < 18) return 'AFTERNOON';
  return 'EVENING';
};

const formatDateLabel = (dateStr) => {
  if (!dateStr) return '';
  const today = dayjs().format('YYYY-MM-DD');
  const tomorrow = dayjs().add(1, 'day').format('YYYY-MM-DD');
  const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');

  const d = dayjs(dateStr);
  const formatted = d.format('DD/MM/YYYY');
  const dayOfWeekNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const dayOfWeek = dayOfWeekNames[d.day()];

  if (dateStr === today) return `Hôm nay · ${dayOfWeek}, ${formatted}`;
  if (dateStr === tomorrow) return `Ngày mai · ${dayOfWeek}, ${formatted}`;
  if (dateStr === yesterday) return `Hôm qua · ${dayOfWeek}, ${formatted}`;
  return `${dayOfWeek}, ${formatted}`;
};

const MedicationCard = ({ row }) => (
  <article
    key={row.id}
    className="relative-portal-card"
    style={{
      marginBottom: 12,
      borderLeft: '4px solid #167763',
      background: '#fff',
      padding: '14px 18px',
      borderRadius: 10,
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    }}
  >
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 8,
        flexWrap: 'wrap',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0d4f43' }}>
          {row.tenThuoc || 'Chưa có tên thuốc'}
        </h4>
        <Tag icon={<ClockCircleOutlined />} color="blue" style={{ fontSize: 13, padding: '1px 8px' }}>
          {row.thoiGianDuKien ? row.thoiGianDuKien.slice(11, 16) : 'Chưa có giờ'}
        </Tag>
      </div>
      <StatusTag {...getMedStatusMap(row.trangThai, row.thoiGianDuKien)} />
    </div>

    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '6px 16px',
        fontSize: 14,
        marginTop: 6,
      }}
    >
      <div>
        <span style={{ color: '#666' }}>Liều dùng: </span>
        <strong>{row.lieuDung || 'Chưa có dữ liệu'}{row.donViTinh ? ` · ${row.donViTinh}` : ''}</strong>
      </div>
      {row.cachDung && (
        <div>
          <span style={{ color: '#666' }}>Cách dùng: </span>
          <span>{row.cachDung}</span>
        </div>
      )}
      <div>
        <span style={{ color: '#666' }}>Dự kiến uống: </span>
        <span>{formatPortalTime(row.thoiGianDuKien)}</span>
      </div>
      {row.thoiGianThucTe && (
        <div>
          <span style={{ color: '#135200' }}>Ghi nhận thực tế: </span>
          <strong style={{ color: '#135200' }}>{formatPortalTime(row.thoiGianThucTe)}</strong>
        </div>
      )}
    </div>
  </article>
);

export default function RelativeMedicationsView({ rows }) {
  const today = dayjs().format('YYYY-MM-DD');
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedShift, setSelectedShift] = useState('ALL');

  // Available dates in rows
  const availableDates = useMemo(() => {
    const set = new Set();
    rows.forEach(r => {
      if (r.thoiGianDuKien) set.add(r.thoiGianDuKien.slice(0, 10));
    });
    return Array.from(set).sort().reverse();
  }, [rows]);

  // Filter rows by date
  const filteredRows = useMemo(() => {
    if (selectedDate === 'ALL') return rows;
    return rows.filter(r => r.thoiGianDuKien && r.thoiGianDuKien.slice(0, 10) === selectedDate);
  }, [rows, selectedDate]);

  // Summary stats for the selected date
  const dayStats = useMemo(() => {
    const total = filteredRows.length;
    const taken = filteredRows.filter(r => r.trangThai === 'DaUong').length;
    const missed = filteredRows.filter(r => r.trangThai === 'BoLo').length;
    const pending = total - taken - missed;
    const percent = total > 0 ? Math.round((taken / total) * 100) : 0;
    return { total, taken, missed, pending, percent };
  }, [filteredRows]);

  // Group filtered rows by shift
  const shiftGroups = useMemo(() => {
    const groups = {
      MORNING: [],
      NOON: [],
      AFTERNOON: [],
      EVENING: [],
    };
    filteredRows.forEach(row => {
      const shift = getShiftKey(row.thoiGianDuKien);
      if (groups[shift]) groups[shift].push(row);
      else groups.MORNING.push(row);
    });
    // Sort ascending by time within each shift
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => (a.thoiGianDuKien || '').localeCompare(b.thoiGianDuKien || ''));
    });
    return groups;
  }, [filteredRows]);

  const displayedShifts = selectedShift === 'ALL'
    ? SHIFTS
    : SHIFTS.filter(s => s.key === selectedShift);

  return (
    <div className="relative-medications-view">
      {/* ── 1. Controls bar: Select Date & Quick Filters ── */}
      <div
        className="relative-portal-card"
        style={{
          marginBottom: 20,
          background: '#fff',
          padding: '16px 20px',
          borderRadius: 14,
          border: '1px solid #d9f2e6',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 14,
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 17, color: '#0d4f43', display: 'flex', alignItems: 'center', gap: 8 }}>
              <CalendarOutlined style={{ color: '#167763' }} />
              <span>{selectedDate === 'ALL' ? 'Lịch uống thuốc · Tất cả các ngày' : formatDateLabel(selectedDate)}</span>
            </h3>
            <span style={{ fontSize: 13, color: '#666' }}>
              Theo dõi lịch uống thuốc theo từng cữ trong ngày của người thân
            </span>
          </div>

          {/* Date controls */}
          <Space wrap>
            <Button
              type={selectedDate === today ? 'primary' : 'default'}
              style={selectedDate === today ? { background: '#167763', borderColor: '#167763' } : {}}
              onClick={() => setSelectedDate(today)}
            >
              Hôm nay
            </Button>
            <Button
              type={selectedDate === dayjs().add(1, 'day').format('YYYY-MM-DD') ? 'primary' : 'default'}
              style={selectedDate === dayjs().add(1, 'day').format('YYYY-MM-DD') ? { background: '#167763', borderColor: '#167763' } : {}}
              onClick={() => setSelectedDate(dayjs().add(1, 'day').format('YYYY-MM-DD'))}
            >
              Ngày mai
            </Button>
            <DatePicker
              format="DD/MM/YYYY"
              placeholder="Chọn ngày khác"
              value={selectedDate !== 'ALL' ? dayjs(selectedDate) : null}
              onChange={date => setSelectedDate(date ? date.format('YYYY-MM-DD') : today)}
              allowClear={false}
              style={{ width: 140 }}
            />
            <Button
              type={selectedDate === 'ALL' ? 'primary' : 'default'}
              style={selectedDate === 'ALL' ? { background: '#167763', borderColor: '#167763' } : {}}
              onClick={() => setSelectedDate('ALL')}
            >
              Tất cả ngày
            </Button>
          </Space>
        </div>

        {/* ── 2. Daily progress summary (when viewing a specific date) ── */}
        {selectedDate !== 'ALL' && (
          <div
            style={{
              background: '#f6ffed',
              border: '1px solid #b7eb8f',
              borderRadius: 10,
              padding: '12px 18px',
              marginTop: 10,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
                marginBottom: 6,
              }}
            >
              <div>
                <strong style={{ color: '#135200', fontSize: 15 }}>
                  Tiến độ uống thuốc trong ngày:
                </strong>
                <span style={{ marginLeft: 8, fontSize: 14, color: '#237804' }}>
                  {dayStats.total > 0
                    ? `Đã uống ${dayStats.taken}/${dayStats.total} cữ thuốc`
                    : 'Chưa có cữ thuốc nào được lên lịch trong ngày này'}
                </span>
              </div>
              <Space size="middle">
                <span style={{ color: '#52c41a', fontSize: 13 }}>
                  <CheckCircleOutlined /> Đã uống: {dayStats.taken}
                </span>
                <span style={{ color: '#faad14', fontSize: 13 }}>
                  <ClockCircleOutlined /> Chưa uống: {dayStats.pending}
                </span>
                {dayStats.missed > 0 && (
                  <span style={{ color: '#ff4d4f', fontSize: 13 }}>
                    <CloseCircleOutlined /> Bỏ lỡ: {dayStats.missed}
                  </span>
                )}
              </Space>
            </div>
            {dayStats.total > 0 && (
              <Progress
                percent={dayStats.percent}
                strokeColor="#167763"
                size="small"
                status={dayStats.percent === 100 ? 'success' : 'active'}
              />
            )}
          </div>
        )}

        {/* ── 3. Session / Buổi filter bar ── */}
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#444' }}>Lọc theo buổi:</span>
          <Segmented
            value={selectedShift}
            onChange={setSelectedShift}
            options={[
              { label: 'Tất cả các buổi', value: 'ALL' },
              { label: '🌅 Sáng (05:00-11:00)', value: 'MORNING' },
              { label: '☀️ Trưa (11:00-14:00)', value: 'NOON' },
              { label: '🌤️ Chiều (14:00-18:00)', value: 'AFTERNOON' },
              { label: '🌙 Tối (18:00-05:00)', value: 'EVENING' },
            ]}
          />
        </div>
      </div>

      {/* ── 4. Main Sessions View: Grouped by Shifts ── */}
      {filteredRows.length === 0 ? (
        <div className="relative-portal-card" style={{ textAlign: 'center', padding: '40px 20px', background: '#fff', borderRadius: 14 }}>
          <Empty
            description={
              selectedDate === 'ALL'
                ? 'Chưa có dữ liệu lịch uống thuốc'
                : `Không có lịch uống thuốc nào cho ngày ${formatDateLabel(selectedDate)}`
            }
          />
          {selectedDate !== 'ALL' && (
            <Button
              type="primary"
              style={{ marginTop: 14, background: '#167763', borderColor: '#167763' }}
              onClick={() => setSelectedDate('ALL')}
            >
              Xem tất cả các ngày có lịch thuốc
            </Button>
          )}
        </div>
      ) : (
        displayedShifts.map(shift => {
          const shiftItems = shiftGroups[shift.key] || [];
          return (
            <section
              key={shift.key}
              style={{
                marginBottom: 20,
                background: '#fff',
                borderRadius: 14,
                border: `1px solid ${shift.border}`,
                overflow: 'hidden',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              }}
            >
              {/* Shift header */}
              <div
                style={{
                  padding: '12px 20px',
                  background: shift.badgeColor,
                  borderBottom: `1px solid ${shift.border}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 22 }}>{shift.icon}</span>
                  <div>
                    <strong style={{ fontSize: 16, color: '#1a3330' }}>{shift.label}</strong>
                    <span style={{ marginLeft: 10, color: '#666', fontSize: 13 }}>
                      Khung giờ: {shift.range}
                    </span>
                  </div>
                </div>
                <Tag
                  color={shiftItems.length > 0 ? shift.tagColor : 'default'}
                  style={{
                    fontWeight: 600,
                    borderRadius: 12,
                    padding: '2px 12px',
                    fontSize: 13,
                  }}
                >
                  {shiftItems.length > 0 ? `${shiftItems.length} cữ thuốc` : 'Không có thuốc'}
                </Tag>
              </div>

              {/* Shift items */}
              <div style={{ padding: '16px 20px' }}>
                {shiftItems.length > 0 ? (
                  shiftItems.map(row => <MedicationCard key={row.id} row={row} />)
                ) : (
                  <div
                    style={{
                      color: '#888',
                      fontStyle: 'italic',
                      padding: '10px 0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                    <span>Không có cữ thuốc nào cần uống trong {shift.label.toLowerCase()} ({shift.range})</span>
                  </div>
                )}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

