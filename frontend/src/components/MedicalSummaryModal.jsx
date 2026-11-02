import React, { useEffect, useMemo, useState } from 'react';
import { Button, Modal, Spin, message } from 'antd';
import {
  CheckCircleOutlined,
  CloseOutlined,
  FileTextOutlined,
  PrinterOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getElderById } from '../services/elderlyService';
import { getCaregiverById } from '../services/caregiverService';
import { getEmergencyContacts } from '../services/emergencyService';
import { getHealthMetrics } from '../services/healthMetricService';
import { getPrescriptions } from '../services/scheduleService';
import { useAuth } from '../context/AuthContext';
import { formatEntityCode } from '../utils/displayUtils';
import './MedicalSummaryModal.css';

// Chuẩn tham chiếu y khoa tiêu chuẩn
const VITAL_METRIC_CONFIGS = [
  {
    key: 'HUYET_AP',
    label: 'Huyết áp',
    refRange: '90/60 - 139/89 mmHg',
    unit: 'mmHg',
  },
  {
    key: 'NHIP_TIM',
    label: 'Nhịp tim',
    refRange: '60 - 100 lần/phút',
    unit: 'lần/phút',
  },
  {
    key: 'SPO2',
    label: 'Nồng độ Oxy máu (SpO2)',
    refRange: '95 - 100 %',
    unit: '%',
  },
  {
    key: 'DUONG_HUYET',
    label: 'Đường huyết (lúc đói)',
    refRange: '70 - 130 mg/dL',
    unit: 'mg/dL',
  },
  {
    key: 'NHIET_DO',
    label: 'Nhiệt độ cơ thể',
    refRange: '36.5 - 37.5 °C',
    unit: '°C',
  },
  {
    key: 'CAN_NANG',
    label: 'Cân nặng',
    refRange: 'Theo dõi thể trạng / BMI',
    unit: 'kg',
  },
];

const MedicalSummaryModal = ({ open, elderly, onClose }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [fullElder, setFullElder] = useState(null);
  const [caregiver, setCaregiver] = useState(null);
  const [emergencyContacts, setEmergencyContacts] = useState([]);
  const [healthMetrics, setHealthMetrics] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);

  useEffect(() => {
    if (!open || !elderly?.id) return;

    let active = true;
    setLoading(true);

    Promise.allSettled([
      getElderById(elderly.id),
      getEmergencyContacts({ nguoiCaoTuoiId: elderly.id }),
      getHealthMetrics({ nguoiCaoTuoiId: elderly.id }),
      getPrescriptions(elderly.id),
    ]).then(async ([elderRes, contactsRes, metricsRes, rxRes]) => {
      if (!active) return;

      const elderData = elderRes.status === 'fulfilled' && elderRes.value ? elderRes.value : elderly;
      setFullElder(elderData);

      if (elderData.nguoiChamSocId) {
        try {
          const cg = await getCaregiverById(elderData.nguoiChamSocId);
          if (active) setCaregiver(cg);
        } catch {
          if (active) setCaregiver(null);
        }
      } else {
        setCaregiver(null);
      }

      setEmergencyContacts(contactsRes.status === 'fulfilled' && Array.isArray(contactsRes.value) ? contactsRes.value : []);
      setHealthMetrics(metricsRes.status === 'fulfilled' && Array.isArray(metricsRes.value) ? metricsRes.value : []);
      setPrescriptions(rxRes.status === 'fulfilled' && Array.isArray(rxRes.value) ? rxRes.value : []);
    }).catch(() => {
      if (active) message.error('Không thể nạp đầy đủ dữ liệu hồ sơ y tế');
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [open, elderly]);

  // Kết hợp thông tin hồ sơ
  const profile = useMemo(() => {
    return {
      ...elderly,
      ...fullElder,
      nguoiChamSocTen: caregiver?.hoTen || fullElder?.nguoiChamSocTen || elderly?.nguoiChamSocTen || '',
      nguoiChamSocSoDienThoai: caregiver?.soDienThoai || fullElder?.nguoiChamSocSoDienThoai || '',
    };
  }, [elderly, fullElder, caregiver]);

  // Lọc chỉ số sinh hiệu mới nhất của mỗi loại
  const latestVitals = useMemo(() => {
    if (!healthMetrics?.length) return [];

    return VITAL_METRIC_CONFIGS.map((cfg) => {
      // Tìm bản ghi mới nhất khớp với key hoặc tên chỉ số
      const match = healthMetrics.find((m) =>
        m.loaiChiSo === cfg.key ||
        (m.loaiChiSoLabel && m.loaiChiSoLabel.toLowerCase().includes(cfg.label.toLowerCase()))
      );

      if (!match) {
        return {
          ...cfg,
          hasData: false,
          giaTri: '—',
          thoiGianDo: null,
          nguoiDoTen: '—',
          status: 'none',
          statusLabel: 'Chưa đo',
        };
      }

      const isCritical = match.trangThaiDanhGia === 'KhanCap' || (match.ghiChu && match.ghiChu.includes('[CẤP CỨU NGUY KỊCH]'));
      const isAbnormal = match.laBatThuong || isCritical;

      return {
        ...cfg,
        hasData: true,
        giaTri: `${match.giaTri} ${match.donVi || cfg.unit}`,
        thoiGianDo: match.thoiGianDo ? dayjs(match.thoiGianDo).format('DD/MM/YYYY HH:mm') : '—',
        nguoiDoTen: match.nguoiDoTen || 'Điều dưỡng phụ trách',
        status: isCritical ? 'critical' : isAbnormal ? 'warning' : 'normal',
        statusLabel: isCritical ? 'Nguy kịch' : isAbnormal ? 'Bất thường' : 'Bình thường',
        ghiChu: match.ghiChu,
      };
    });
  }, [healthMetrics]);

  // Danh sách thuốc đang sử dụng (thuộc đơn đang có hiệu lực)
  const currentMedications = useMemo(() => {
    if (!prescriptions?.length) return [];
    const today = dayjs().startOf('day');

    return prescriptions
      .filter((rx) => {
        const startsOn = rx.ngayBatDau ? dayjs(rx.ngayBatDau).startOf('day') : null;
        const endsOn = rx.ngayKetThuc ? dayjs(rx.ngayKetThuc).endOf('day') : null;
        return (!startsOn || !today.isBefore(startsOn)) && (!endsOn || !today.isAfter(endsOn));
      })
      .flatMap((rx) => (rx.danhSachThuoc || []).map((med, idx) => ({
        ...med,
        key: `${rx.id}-${med.id || med.thuocId || idx}`,
        bacSiKeDon: rx.bacSiKeDon || 'Bác sĩ điều trị',
        ngayBatDau: rx.ngayBatDau ? dayjs(rx.ngayBatDau).format('DD/MM/YYYY') : '',
        ngayKetThuc: rx.ngayKetThuc ? dayjs(rx.ngayKetThuc).format('DD/MM/YYYY') : 'Dài hạn',
        rxNote: rx.ghiChu || '',
      })));
  }, [prescriptions]);

  const allergies = useMemo(() => {
    if (!profile?.diUng) return [];
    if (Array.isArray(profile.diUng)) return profile.diUng;
    return String(profile.diUng).split(',').map((s) => s.trim()).filter(Boolean);
  }, [profile?.diUng]);

  const diseases = useMemo(() => {
    if (!profile?.benhNen) return [];
    if (Array.isArray(profile.benhNen)) return profile.benhNen;
    return String(profile.benhNen).split(',').map((s) => s.trim()).filter(Boolean);
  }, [profile?.benhNen]);

  const emergencyContactsSummary = useMemo(() => {
    if (!emergencyContacts?.length) return 'Chưa ghi nhận người thân khẩn cấp';
    return emergencyContacts.map((c) =>
      `${c.hoTen} (${c.moiQuanHe || 'Người thân'}${c.soDienThoai ? ` · ${c.soDienThoai}` : ''}${c.laChinh ? ' — Liên hệ chính' : ''})`
    ).join('; ');
  }, [emergencyContacts]);

  const handlePrint = () => {
    const originalTitle = document.title;
    const cleanName = (profile?.hoTen || 'NCT').replace(/[^a-zA-Z0-9\u00C0-\u1EF9]/g, '_');
    const code = formatEntityCode('NCT', profile?.id);
    document.title = `Tom_Tat_Benh_An_${cleanName}_${code}`;

    document.body.classList.add('printing-medical-summary');
    window.print();

    // Khôi phục sau khi in
    const cleanup = () => {
      document.body.classList.remove('printing-medical-summary');
      document.title = originalTitle;
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(cleanup, 1500);
  };

  const printDate = useMemo(() => dayjs().format('DD/MM/YYYY HH:mm'), []);
  const todayDay = useMemo(() => dayjs().format('DD'), []);
  const todayMonth = useMemo(() => dayjs().format('MM'), []);
  const todayYear = useMemo(() => dayjs().format('YYYY'), []);

  return (
    <Modal
      className="medical-summary-modal"
      open={open}
      onCancel={onClose}
      footer={null}
      width={900}
      centered
      destroyOnClose
    >
      <div className="medical-summary-toolbar">
        <div className="medical-summary-toolbar-title">
          <FileTextOutlined style={{ color: '#0f766e', fontSize: 18 }} />
          <span>Bản xem trước Phiếu tóm tắt bệnh án y tế</span>
          <span className="toolbar-badge">Khổ in tiêu chuẩn A4</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button
            type="primary"
            icon={<PrinterOutlined />}
            size="middle"
            onClick={handlePrint}
            style={{ background: '#0f766e', borderColor: '#0f766e', fontWeight: 600 }}
          >
            In phiếu / Lưu PDF
          </Button>
          <Button icon={<CloseOutlined />} onClick={onClose}>
            Đóng
          </Button>
        </div>
      </div>

      <div className="medical-summary-preview-wrap">
        <Spin spinning={loading}>
          <div className="medical-summary-sheet" id="printable-medical-summary">
            {/* Header cơ sở y tế */}
            <header className="doc-header">
              <div>
                <div className="doc-org-name">HỆ THỐNG QUẢN LÝ SỨC KHỎE NGƯỜI CAO TUỔI CARESENIOR</div>
                <div className="doc-org-sub">Trung tâm Dữ liệu Sức khỏe & Điều phối Chăm sóc Y tế Người cao tuổi</div>
                <div className="doc-org-contact">Hotline Y tế: 1900-8888 • Cấp cứu y tế: 115 • Email: yte@caresenior.vn</div>
              </div>
              <div className="doc-meta-badge">
                <div className="doc-meta-code">{formatEntityCode('NCT', profile?.id)}</div>
                <div className="doc-meta-date">Ngày trích xuất: {printDate}</div>
                <div className="doc-meta-date">Trạng thái: <strong>{profile?.trangThaiLabel || 'Đang theo dõi'}</strong></div>
              </div>
            </header>

            {/* Tiêu đề tài liệu */}
            <div className="doc-title-block">
              <h1>PHIẾU TÓM TẮT BỆNH ÁN & THEO DÕI SỨC KHỎE</h1>
              <p>(Tài liệu tổng hợp dùng cho khám chữa bệnh, hội chẩn chuyển viện & xử trí cấp cứu)</p>
            </div>

            {/* Phần I: Thông tin hành chính & liên hệ */}
            <section className="doc-section">
              <div className="doc-section-heading">I. Thông tin hành chính & liên hệ</div>
              <div className="doc-info-grid">
                <div className="doc-info-row">
                  <span className="doc-info-label">Họ và tên:</span>
                  <strong className="doc-info-value" style={{ textTransform: 'uppercase', fontSize: '13px' }}>
                    {profile?.hoTen || '—'}
                  </strong>
                </div>
                <div className="doc-info-row">
                  <span className="doc-info-label">Ngày sinh:</span>
                  <span className="doc-info-value">
                    {profile?.ngaySinh ? `${dayjs(profile.ngaySinh).format('DD/MM/YYYY')} (${profile.tuoi ?? '—'} tuổi)` : '—'}
                  </span>
                </div>
                <div className="doc-info-row">
                  <span className="doc-info-label">Giới tính:</span>
                  <span className="doc-info-value">{profile?.gioiTinh || '—'}</span>
                </div>
                <div className="doc-info-row">
                  <span className="doc-info-label">Nhóm máu:</span>
                  <strong className="doc-info-value" style={{ color: '#b91c1c' }}>
                    {profile?.nhomMau || 'Chưa ghi nhận'}
                  </strong>
                </div>
                <div className="doc-info-row">
                  <span className="doc-info-label">CMND / CCCD:</span>
                  <span className="doc-info-value">{profile?.cmnd || '—'}</span>
                </div>
                <div className="doc-info-row">
                  <span className="doc-info-label">Số điện thoại:</span>
                  <span className="doc-info-value">{profile?.soDienThoai || '—'}</span>
                </div>
                <div className="doc-info-row doc-info-full">
                  <span className="doc-info-label">Địa chỉ thường trú:</span>
                  <span className="doc-info-value">{profile?.diaChiThuongTru || '—'}</span>
                </div>
                <div className="doc-info-row doc-info-full">
                  <span className="doc-info-label">Người chăm sóc chính:</span>
                  <span className="doc-info-value">
                    {profile?.nguoiChamSocTen || 'Chưa phân công'}
                    {profile?.nguoiChamSocSoDienThoai ? ` (SĐT: ${profile.nguoiChamSocSoDienThoai})` : ''}
                  </span>
                </div>
                <div className="doc-info-row doc-info-full">
                  <span className="doc-info-label">Người liên hệ khẩn cấp:</span>
                  <span className="doc-info-value">{emergencyContactsSummary}</span>
                </div>
              </div>
            </section>

            {/* Phần II: Cảnh báo y tế & Tiền sử bệnh lý */}
            <section className="doc-section">
              <div className="doc-section-heading">II. Tiền sử bệnh lý & Cảnh báo an toàn y tế</div>
              
              {/* Khung cảnh báo dị ứng */}
              <div className={`doc-allergy-alert-box ${allergies.length ? '' : 'is-safe'}`}>
                {allergies.length > 0 ? (
                  <>
                    <WarningOutlined style={{ color: '#dc2626', fontSize: 18, marginTop: 2 }} />
                    <div>
                      <div className="doc-allergy-title">CẢNH BÁO TIỀN SỬ DỊ ỨNG (BẮT BUỘC LƯU Ý KHI KÊ ĐƠN & DÙNG THUỐC)</div>
                      <div className="doc-allergy-content" style={{ marginTop: 4 }}>
                        {allergies.map((alg) => (
                          <span key={alg} className="doc-allergy-tag">⚠️ {alg}</span>
                        ))}
                      </div>
                      <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 4, fontStyle: 'italic' }}>
                        * Tuyệt đối không chỉ định các thuốc hoặc thực phẩm có nguy cơ phản ứng chéo với danh mục dị ứng trên.
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <CheckCircleOutlined style={{ color: '#16a34a', fontSize: 18, marginTop: 2 }} />
                    <div>
                      <div className="doc-allergy-title">KHÔNG GHI NHẬN TIỀN SỬ DỊ ỨNG THUỐC HOẶC THỰC PHẨM</div>
                      <div className="doc-allergy-content">
                        Hồ sơ hiện tại chưa ghi nhận phản ứng dị ứng hoặc sốc phản vệ trước đây.
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="doc-info-grid">
                <div className="doc-info-row doc-info-full">
                  <span className="doc-info-label">Bệnh nền mãn tính:</span>
                  <span className="doc-info-value">
                    {diseases.length > 0 ? (
                      <strong>{diseases.join(' • ')}</strong>
                    ) : (
                      'Chưa ghi nhận bệnh nền mãn tính'
                    )}
                  </span>
                </div>
                <div className="doc-info-row doc-info-full">
                  <span className="doc-info-label">Tiền sử bệnh lý & Phẫu thuật:</span>
                  <span className="doc-info-value">{profile?.tieuSuBenhLy || 'Không ghi nhận tiền sử đặc biệt'}</span>
                </div>
                {profile?.ghiChu && (
                  <div className="doc-info-row doc-info-full">
                    <span className="doc-info-label">Ghi chú y tế:</span>
                    <span className="doc-info-value">{profile.ghiChu}</span>
                  </div>
                )}
              </div>
            </section>

            {/* Phần III: Bảng sinh hiệu gần nhất */}
            <section className="doc-section">
              <div className="doc-section-heading">III. Chỉ số sinh hiệu ghi nhận gần nhất</div>
              <table className="doc-table">
                <thead>
                  <tr>
                    <th style={{ width: '22%' }}>Chỉ số theo dõi</th>
                    <th style={{ width: '18%' }}>Kết quả đo mới nhất</th>
                    <th style={{ width: '22%' }}>Khoảng tham chiếu chuẩn</th>
                    <th style={{ width: '15%' }}>Đánh giá</th>
                    <th style={{ width: '23%' }}>Thời gian & Người đo</th>
                  </tr>
                </thead>
                <tbody>
                  {latestVitals.map((item) => (
                    <tr key={item.key}>
                      <td><strong>{item.label}</strong></td>
                      <td>
                        <strong style={{
                          color: item.status === 'critical' ? '#dc2626' : item.status === 'warning' ? '#d97706' : '#0f172a'
                        }}>
                          {item.giaTri}
                        </strong>
                      </td>
                      <td style={{ color: '#475569', fontSize: 11.5 }}>{item.refRange}</td>
                      <td>
                        {item.hasData ? (
                          <span className={`doc-status-pill ${item.status}`}>
                            {item.statusLabel}
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>Chưa có dữ liệu</span>
                        )}
                      </td>
                      <td style={{ fontSize: 11, color: '#475569' }}>
                        {item.hasData ? (
                          <div>
                            <div>{item.thoiGianDo}</div>
                            <small style={{ color: '#64748b' }}>Đo bởi: {item.nguoiDoTen}</small>
                          </div>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {/* Phần IV: Phác đồ thuốc đang điều trị */}
            <section className="doc-section">
              <div className="doc-section-heading">IV. Phác đồ thuốc đang điều trị hiện tại</div>
              {currentMedications.length > 0 ? (
                <table className="doc-table">
                  <thead>
                    <tr>
                      <th style={{ width: '5%', textAlign: 'center' }}>STT</th>
                      <th style={{ width: '25%' }}>Tên thuốc & Hàm lượng</th>
                      <th style={{ width: '15%' }}>Liều dùng</th>
                      <th style={{ width: '15%' }}>Số lần / Ngày</th>
                      <th style={{ width: '18%' }}>Thời điểm uống</th>
                      <th style={{ width: '22%' }}>Bác sĩ kê đơn & Thời hạn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentMedications.map((med, index) => (
                      <tr key={med.key}>
                        <td style={{ textAlign: 'center' }}>{index + 1}</td>
                        <td>
                          <strong>{med.tenThuoc}</strong>
                          {med.rxNote && <div style={{ fontSize: 11, color: '#64748b' }}>{med.rxNote}</div>}
                        </td>
                        <td>{med.lieuDung || 'Theo chỉ định'}</td>
                        <td>{med.soLanMoiNgay ? `${med.soLanMoiNgay} lần/ngày` : '—'}</td>
                        <td>
                          {med.gioUong?.length > 0
                            ? med.gioUong.join(', ')
                            : 'Theo hướng dẫn điều dưỡng'}
                        </td>
                        <td style={{ fontSize: 11 }}>
                          <div><strong>{med.bacSiKeDon}</strong></div>
                          <span style={{ color: '#64748b' }}>{med.ngayBatDau} → {med.ngayKetThuc}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="doc-note-box" style={{ textAlign: 'center', color: '#64748b', fontStyle: 'italic' }}>
                  Hiện tại người cao tuổi không có đơn thuốc đang điều trị còn hiệu lực trên hệ thống.
                </div>
              )}
            </section>

            {/* Phần V: Lời dặn y tế & Chữ ký */}
            <section className="doc-section">
              <div className="doc-section-heading">V. Lời dặn y tế & Ký nhận chuyên môn</div>
              <div className="doc-note-box">
                <strong>Lời dặn chăm sóc & theo dõi:</strong>
                <div>
                  Duy trì uống thuốc đúng giờ và đúng liều lượng theo phác đồ. Thực hiện đo huyết áp và nhịp tim định kỳ hàng ngày.
                  Hạn chế muối và đường trong khẩu phần ăn, uống đủ nước và vận động nhẹ nhàng.
                  Khi xuất hiện các triệu chứng bất thường (khó thở, đau tức ngực, huyết áp tăng cao đột ngột hoặc SpO2 dưới 94%),
                  cần bấm nút SOS khẩn cấp hoặc liên hệ ngay với người chăm sóc và cơ sở y tế gần nhất.
                </div>
              </div>

              {/* Khối chữ ký xác nhận */}
              <div className="doc-signature-block">
                <div className="doc-signature-col">
                  <div className="doc-signature-role">NGƯỜI LẬP PHIẾU / ĐIỀU DƯỠNG</div>
                  <div className="doc-signature-sub">(Ký và ghi rõ họ tên)</div>
                  <div className="doc-signature-space" />
                  <div className="doc-signature-name">{user?.hoTen || 'Người chăm sóc phụ trách'}</div>
                </div>
                <div className="doc-signature-col">
                  <div style={{ fontSize: 11.5, color: '#475569', marginBottom: 4 }}>
                    Ngày {todayDay} tháng {todayMonth} năm {todayYear}
                  </div>
                  <div className="doc-signature-role">BÁC SĨ / ĐẠI DIỆN CƠ SỞ Y TẾ</div>
                  <div className="doc-signature-sub">(Ký, đóng dấu và ghi rõ họ tên)</div>
                  <div className="doc-signature-space" />
                  <div className="doc-signature-name">BS. Chuyên khoa Lão khoa</div>
                </div>
              </div>
            </section>

            {/* Footer */}
            <footer className="doc-footer-meta">
              <span>Hệ thống Quản lý Sức khỏe Người cao tuổi CareSenior — www.caresenior.vn</span>
              <span>Phiếu in có giá trị tham khảo chuyên môn y khoa tại thời điểm trích xuất</span>
            </footer>
          </div>
        </Spin>
      </div>
    </Modal>
  );
};

export default MedicalSummaryModal;

