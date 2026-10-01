// src/components/ModalForm.jsx
// Modal chuẩn thêm/sửa — footer Hủy (xám) + Lưu (primary) căn phải
import React from 'react';
import { Modal, Form, Button, Space } from 'antd';
import { PlusOutlined, SaveOutlined } from '@ant-design/icons';

export const FormSection = ({ title, description, children }) => (
  <section className="modal-form-section">
    <div className="modal-form-section-heading">
      <div className="modal-form-section-title">{title}</div>
      {description && <div className="modal-form-section-description">{description}</div>}
    </div>
    <div className="modal-form-section-content">{children}</div>
  </section>
);

/**
 * @param {string}    title       - Tiêu đề modal
 * @param {boolean}   open        - Trạng thái mở/đóng
 * @param {function}  onCancel    - Callback đóng modal
 * @param {function}  onFinish    - Callback khi submit form thành công (nhận values)
 * @param {boolean}   loading     - Loading state cho nút Lưu
 * @param {string}    saveLabel   - Label nút chính (tự chọn theo mode nếu bỏ trống)
 * @param {number}    width       - Chiều rộng modal (mặc định: 720)
 * @param {object}    form        - antd Form instance (nếu muốn kiểm soát từ ngoài)
 * @param {ReactNode} children    - Form.Items bên trong
 * @param {...*}      rest        - Các prop khác truyền vào antd Modal
 */
const ModalForm = ({
  title,
  subtitle,
  icon,
  mode = 'create',
  saveIcon,
  open,
  onCancel,
  onFinish,
  loading = false,
  saveLabel,
  width = 720,
  form: externalForm,
  children,
  initialValues,
  ...rest
}) => {
  const [internalForm] = Form.useForm();
  const form = externalForm || internalForm;
  const primaryLabel = saveLabel || (mode === 'edit' ? 'Lưu thay đổi' : 'Thêm mới');

  const handleCancel = () => {
    if (loading) return;
    form.resetFields();
    onCancel?.();
  };

  const handleOk = () => {
    form.submit();
  };

  return (
    <Modal
      title={
        <div className="modal-form-title-wrap">
          {icon && <span className="modal-form-title-icon">{icon}</span>}
          <span>
            <span className="modal-form-title-text">{title}</span>
            {subtitle && <span className="modal-form-title-subtitle">{subtitle}</span>}
          </span>
        </div>
      }
      open={open}
      onCancel={handleCancel}
      width={width}
      centered
      destroyOnHidden
      className="app-form-modal"
      maskClosable={!loading}
      footer={
        <Space style={{ justifyContent: 'flex-end', width: '100%', display: 'flex' }}>
          <Button
            onClick={handleCancel}
            size="large"
            disabled={loading}
            className="modal-cancel-button"
          >
            Hủy
          </Button>
          <Button
            type="primary"
            onClick={handleOk}
            loading={loading}
            disabled={loading}
            icon={saveIcon || (mode === 'edit' ? <SaveOutlined /> : <PlusOutlined />)}
            size="large"
            className="modal-save-button"
          >
            {primaryLabel}
          </Button>
        </Space>
      }
      {...rest}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={initialValues}
        validateTrigger={['onChange', 'onBlur']}
        size="large"
        className="standard-modal-form"
      >
        {children}
      </Form>
    </Modal>
  );
};

export default ModalForm;
