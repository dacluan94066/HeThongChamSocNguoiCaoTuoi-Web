// src/components/PageHeader.jsx
// Header chuẩn cho mọi trang — title + subtitle + action button bên phải
import React from 'react';
import { Typography, Space } from 'antd';

const { Title, Text } = Typography;

/**
 * @param {string}      title       - Tiêu đề trang (h1)
 * @param {string}      subtitle    - Mô tả ngắn phía dưới
 * @param {ReactNode}   extra       - Nút hành động bên phải (VD: Button Thêm mới)
 * @param {ReactNode}   icon        - Icon bên cạnh title (tuỳ chọn)
 * @param {ReactNode}   badge       - Badge số lượng cạnh title (VD: số cảnh báo chưa xử lý)
 */
const PageHeader = ({ title, subtitle, extra, icon, badge, style }) => {
  return (
    <div className="page-header" style={style}>
      <div className="page-header-info">
        <div className="page-title-row">
          {icon && <span className="page-title-icon">{icon}</span>}
          <Title level={2} className="page-title">
            {title}
          </Title>
          {badge && <span className="page-title-badge">{badge}</span>}
        </div>
        {subtitle && (
          <Text className="page-subtitle">{subtitle}</Text>
        )}
      </div>
      {extra && (
        <div className="page-header-actions">
          {extra}
        </div>
      )}
    </div>
  );
};

export default PageHeader;
