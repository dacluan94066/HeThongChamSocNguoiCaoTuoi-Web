import React, { useState, useEffect } from 'react';
import { Modal, Form, Select, Input, DatePicker, TimePicker, Row, Col, Alert, message, notification } from 'antd';
import { HeartOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import relativePortalService from '../services/relativePortalService';

export default function RelativeHealthMetricModal({ open, onClose, onSuccess, elderly }) {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [types, setTypes] = useState([]);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const selectedTypeId = Form.useWatch('loaiChiSoId', form);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const fetchTypes = async () => {
      setLoadingTypes(true);
      try {
        const data = await relativePortalService.getMetricTypes();
        if (active) setTypes(data);
      } catch (err) {
        console.error('Không tải được danh mục chỉ số:', err);
      } finally {
        if (active) setLoadingTypes(false);
      }
    };
    fetchTypes();
    form.setFieldsValue({
      ngayDo: dayjs(),
      gioDo: dayjs(),
    });
    return () => { active = false; };
  }, [open, form]);

  const selectedType = types.find(t => t.id === selectedTypeId);

  const getPlaceholder = () => {
    if (!selectedType) return 'VD: 120/80 hoặc 75';
    if (selectedType.tenChiSo === 'Huyết áp') return 'VD: 120/80 (Tâm thu / Tâm trương)';
    if (selectedType.tenChiSo === 'Nhịp tim') return 'VD: 75 (lần/phút)';
    if (selectedType.tenChiSo === 'Đường huyết') return 'VD: 105 (mg/dL)';
    if (selectedType.tenChiSo === 'Nhiệt độ cơ thể') return 'VD: 36.8 (°C)';
    if (selectedType.tenChiSo === 'SpO2') return 'VD: 98 (%)';
    if (selectedType.tenChiSo === 'Cân nặng') return 'VD: 60 (kg)';
    return `Nhập giá trị (${selectedType.donVi || ''})`;
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const payload = {
        loaiChiSoId: values.loaiChiSoId,
        giaTri: values.giaTri.trim(),
        ngayDo: values.ngayDo ? values.ngayDo.format('YYYY-MM-DD') : undefined,
        gioDo: values.gioDo ? values.gioDo.format('HH:mm') : undefined,
        ghiChu: values.ghiChu ? values.ghiChu.trim() : undefined,
      };

      const result = await relativePortalService.createHealthMetric(elderly.id, payload);
      message.success(result?.message || 'Ghi nhận chỉ số sức khỏe thành công');

      if (result?.data?.alertCreated) {
        notification.warning({
          message: 'Cảnh báo chỉ số bất thường',
          description: 'Chỉ số đo vượt ngưỡng theo dõi an toàn. Hệ thống đã tự động gửi cảnh báo tới Người chăm sóc và Quản trị viên.',
          duration: 6,
        });
      }

      form.resetFields();
      onClose();
      if (onSuccess) onSuccess(result?.data);
    } catch (err) {
      if (err?.errorFields) return; // Validation error
      const errorMsg = err?.response?.data?.message || err?.message || 'Không thể ghi nhận chỉ số. Vui lòng thử lại.';
      message.error(errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <HeartOutlined style={{ color: '#e63946', fontSize: 20 }} />
          <span>Ghi nhận chỉ số sức khỏe{elderly?.hoTen ? ` - ${elderly.hoTen}` : ''}</span>
        </div>
      }
      open={open}
      onCancel={() => { form.resetFields(); onClose(); }}
      onOk={handleSubmit}
      confirmLoading={submitting}
      okText="Lưu chỉ số"
      cancelText="Hủy"
      destroyOnClose
      width={560}
    >
      <Alert
        showIcon
        type="info"
        style={{ marginBottom: 16 }}
        message="Gia đình đo và ghi nhận chỉ số"
        description="Số đo sẽ được ghi nhận vào hồ sơ theo dõi sức khỏe và tự động đối chiếu ngưỡng y tế an toàn."
      />
      <Form form={form} layout="vertical">
        <Form.Item
          name="loaiChiSoId"
          label="Loại chỉ số đo"
          rules={[{ required: true, message: 'Vui lòng chọn loại chỉ số' }]}
        >
          <Select
            placeholder="Chọn loại chỉ số sức khỏe"
            loading={loadingTypes}
            options={types.map(t => ({
              value: t.id,
              label: `${t.tenChiSo}${t.donVi ? ` (${t.donVi})` : ''}`,
            }))}
          />
        </Form.Item>

        <Form.Item
          name="giaTri"
          label={selectedType ? `Giá trị đo (${selectedType.donVi})` : 'Giá trị đo'}
          rules={[
            { required: true, message: 'Vui lòng nhập giá trị đo' },
            {
              pattern: /^\d+(\.\d+)?(\/\d+(\.\d+)?)?$/,
              message: 'Giá trị không hợp lệ. Ví dụ: 75 hoặc 120/80',
            },
          ]}
        >
          <Input placeholder={getPlaceholder()} size="large" />
        </Form.Item>

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item
              name="ngayDo"
              label="Ngày đo"
              rules={[{ required: true, message: 'Vui lòng chọn ngày đo' }]}
            >
              <DatePicker
                format="DD/MM/YYYY"
                style={{ width: '100%' }}
                disabledDate={current => current && current > dayjs().endOf('day')}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              name="gioDo"
              label="Giờ đo"
              rules={[{ required: true, message: 'Vui lòng chọn giờ đo' }]}
            >
              <TimePicker
                format="HH:mm"
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          name="ghiChu"
          label="Ghi chú thêm"
          rules={[{ max: 300, message: 'Ghi chú tối đa 300 ký tự' }]}
        >
          <Input.TextArea
            rows={3}
            placeholder="Nhập tình trạng khi đo (VD: đo sau khi ăn sáng, đo lúc nghỉ ngơi...)"
            maxLength={300}
            showCount
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

