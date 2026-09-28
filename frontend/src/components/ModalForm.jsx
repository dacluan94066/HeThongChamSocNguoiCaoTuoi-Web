// src/components/ModalForm.jsx
// Modal chuẩn thêm/sửa — footer Hủy (xám) + Lưu (primary) căn phải
import React from 'react';
import { Modal, Form, Button, Space } from 'antd';

/**
 * @param {string}    title       - Tiêu đề modal
 * @param {boolean}   open        - Trạng thái mở/đóng
 * @param {function}  onCancel    - Callback đóng modal
 * @param {function}  onFinish    - Callback khi submit form thành công (nhận values)
 * @param {boolean}   loading     - Loading state cho nút Lưu
 * @param {string}    saveLabel   - Label nút Lưu (mặc định: 'Lưu')
 * @param {number}    width       - Chiều rộng modal (mặc định: 560)
 * @param {object}    form        - antd Form instance (nếu muốn kiểm soát từ ngoài)
 * @param {ReactNode} children    - Form.Items bên trong
 * @param {...*}      rest        - Các prop khác truyền vào antd Modal
 */
const ModalForm = ({
  title,
  open,
  onCancel,
  onFinish,
  loading = false,
  saveLabel = 'Lưu',
  width = 560,
  form: externalForm,
  children,
  initialValues,
  ...rest
}) => {
  const [internalForm] = Form.useForm();
  const form = externalForm || internalForm;

  const handleCancel = () => {
    form.resetFields();
    onCancel?.();
  };

  const handleOk = () => {
    form.submit();
  };

  return (
    <Modal
      title={title}
      open={open}
      onCancel={handleCancel}
      width={width}
      destroyOnClose
      footer={
        <Space style={{ justifyContent: 'flex-end', width: '100%', display: 'flex' }}>
          <Button
            onClick={handleCancel}
            size="large"
            style={{ minWidth: 100 }}
          >
            Hủy
          </Button>
          <Button
            type="primary"
            onClick={handleOk}
            loading={loading}
            size="large"
            style={{ minWidth: 120 }}
          >
            {saveLabel}
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
        style={{ marginTop: 8 }}
        size="large"
      >
        {children}
      </Form>
    </Modal>
  );
};

export default ModalForm;
