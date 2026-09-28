// Trang nhật ký chăm sóc - Dạng timeline theo ngày
import React, { useState, useEffect } from 'react';
import { Timeline, Button, Select, Card, DatePicker, Form, Input, message, Empty } from 'antd';
import {
  PlusOutlined, BookOutlined, AlertOutlined, HeartOutlined, MedicineBoxOutlined,
} from '@ant-design/icons';
import { getCareNotes, createCareNote } from '../../services/careNoteService';
import { getElders } from '../../services/elderlyService';
import { getCurrentUser } from '../../services/authService';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import TableToolbar from '../../components/TableToolbar';
import ModalForm from '../../components/ModalForm';

const { Option } = Select;

const LOAI_NK_CONFIG = {
  CHAM_SOC_HANG_NGAY: { icon: <HeartOutlined />,    color: '#4CAF93', label: 'Chăm sóc hàng ngày' },
  SU_CO:              { icon: <AlertOutlined />,     color: '#E15554', label: 'Sự cố' },
  VAT_LY_TRI_LIEU:    { icon: <MedicineBoxOutlined />, color: '#2E7D9A', label: 'Vật lý trị liệu' },
  CANH_BAO:           { icon: <AlertOutlined />,     color: '#F5A623', label: 'Cảnh báo' },
};

const CareNotesPage = () => {
  const [notes, setNotes] = useState([]);
  const [elders, setElders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedElder, setSelectedElder] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const currentUser = getCurrentUser();

  useEffect(() => { getElders().then(setElders); }, []);
  useEffect(() => {
    setLoading(true);
    getCareNotes({ nguoiCaoTuoiId: selectedElder, ngay: selectedDate?.format('YYYY-MM-DD') })
      .then(setNotes).finally(() => setLoading(false));
  }, [selectedElder, selectedDate]);

  const handleSave = async (values) => {
    setSaving(true);
    try {
      const elder = elders.find((e) => e.id === values.nguoiCaoTuoiId);
      await createCareNote({
        ...values,
        nguoiCaoTuoiTen: elder?.hoTen || '',
        nguoiChamSocId: currentUser?.id,
        nguoiChamSocTen: currentUser?.hoTen,
        ngay: new Date().toISOString().slice(0, 10),
        thoiGian: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        trangThai: 'HOAN_THANH',
        trangThaiLabel: 'Hoàn thành',
      });
      message.success('Đã thêm nhật ký');
      setModalOpen(false);
      form.resetFields();
      getCareNotes({ nguoiCaoTuoiId: selectedElder }).then(setNotes);
    } finally {
      setSaving(false);
    }
  };

  const timelineItems = notes.map((note) => {
    const cfg = LOAI_NK_CONFIG[note.loaiNhatKy] || {
      icon: <BookOutlined />, color: '#8C8C8C', label: note.loaiNhatKyLabel,
    };
    return {
      dot: React.cloneElement(cfg.icon, { style: { color: cfg.color, fontSize: 16 } }),
      color: cfg.color,
      children: (
        <Card
          size="small"
          style={{
            borderRadius: 10,
            marginBottom: 12,
            borderLeft: `4px solid ${cfg.color}`,
            boxShadow: '0 2px 8px rgba(46,125,154,0.07)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <strong style={{ fontSize: 15, color: '#1A2E3B' }}>{note.tieuDe}</strong>
              <span style={{
                marginLeft: 10,
                fontSize: 12,
                padding: '2px 8px',
                borderRadius: 5,
                background: `${cfg.color}18`,
                color: cfg.color,
                fontWeight: 600,
                border: `1px solid ${cfg.color}40`,
              }}>
                {cfg.label}
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#7A93A3', textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
              <div>{dayjs(note.ngay).format('DD/MM/YYYY')}</div>
              <div>{note.thoiGian}</div>
            </div>
          </div>
          <div style={{ fontSize: 14, color: '#3D5263', marginTop: 10, lineHeight: 1.65 }}>
            {note.noiDung}
          </div>
          <div style={{ fontSize: 13, color: '#7A93A3', marginTop: 8 }}>
            👤 {note.nguoiChamSocTen} • {note.nguoiCaoTuoiTen}
          </div>
        </Card>
      ),
    };
  });

  return (
    <div>
      <PageHeader
        title="Nhật ký chăm sóc"
        subtitle="Timeline hoạt động chăm sóc theo ngày"
        icon={<BookOutlined />}
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => { form.resetFields(); setModalOpen(true); }}
            size="large"
          >
            Thêm nhật ký
          </Button>
        }
      />

      <TableToolbar
        filters={[
          <Select
            key="elder"
            placeholder="Lọc theo người cao tuổi"
            style={{ width: 240 }}
            allowClear
            onChange={setSelectedElder}
          >
            {elders.map((e) => <Option key={e.id} value={e.id}>{e.hoTen}</Option>)}
          </Select>,
          <DatePicker
            key="date"
            placeholder="Lọc theo ngày"
            format="DD/MM/YYYY"
            onChange={setSelectedDate}
            allowClear
          />,
        ]}
        count={notes.length}
        countLabel="nhật ký"
      />

      {notes.length === 0 ? (
        <Empty
          description={<span style={{ color: '#7A93A3', fontSize: 15 }}>Chưa có nhật ký nào</span>}
          style={{ padding: '60px 0' }}
        />
      ) : (
        <div style={{
          background: '#fff',
          borderRadius: 12,
          padding: '28px 28px 8px',
          boxShadow: 'var(--shadow-card)',
          border: '1px solid var(--color-border-light)',
        }}>
          <Timeline items={timelineItems} />
        </div>
      )}

      <ModalForm
        title="Thêm nhật ký chăm sóc"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onFinish={handleSave}
        loading={saving}
        saveLabel="Lưu nhật ký"
        form={form}
        width={560}
      >
        <Form.Item name="nguoiCaoTuoiId" label="Người cao tuổi" rules={[{ required: true, message: 'Vui lòng chọn' }]}>
          <Select placeholder="Chọn người cao tuổi">
            {elders.map((e) => <Option key={e.id} value={e.id}>{e.hoTen}</Option>)}
          </Select>
        </Form.Item>
        <Form.Item name="loaiNhatKy" label="Loại nhật ký" rules={[{ required: true, message: 'Vui lòng chọn loại' }]}>
          <Select placeholder="Chọn loại">
            {Object.entries(LOAI_NK_CONFIG).map(([k, v]) => (
              <Option key={k} value={k}>{v.label}</Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item name="tieuDe" label="Tiêu đề" rules={[{ required: true, message: 'Vui lòng nhập tiêu đề' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="noiDung" label="Nội dung chi tiết" rules={[{ required: true, message: 'Vui lòng nhập nội dung' }]}>
          <Input.TextArea rows={5} placeholder="Mô tả chi tiết hoạt động chăm sóc..." />
        </Form.Item>
      </ModalForm>
    </div>
  );
};

export default CareNotesPage;
