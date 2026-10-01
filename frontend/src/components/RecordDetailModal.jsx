import React from 'react';
import { Button, Descriptions, Modal } from 'antd';

const RecordDetailModal = ({ open, onClose, title, record, fields = [], width = 720 }) => (
  <Modal
    title={title}
    open={open}
    onCancel={onClose}
    width={width}
    centered
    footer={<Button onClick={onClose}>Đóng</Button>}
  >
    {record && (
      <Descriptions bordered column={2} size="middle" style={{ marginTop: 16 }}>
        {fields.map((field) => {
          const value = typeof field.render === 'function'
            ? field.render(record[field.key], record)
            : record[field.key];
          return (
            <Descriptions.Item key={field.key || field.label} label={field.label} span={field.span || 1}>
              {value === null || value === undefined || value === ''
                ? <span className="muted-value">Chưa cập nhật</span>
                : value}
            </Descriptions.Item>
          );
        })}
      </Descriptions>
    )}
  </Modal>
);

export default RecordDetailModal;
