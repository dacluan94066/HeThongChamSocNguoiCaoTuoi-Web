import React from 'react';
import { Typography } from 'antd';

const { Title, Text } = Typography;

const PageHeader = ({
  title,
  subtitle,
  extra,
  icon,
  badge,
  count,
  countLabel = 'mục',
  style,
}) => (
  <div className="page-header" style={style}>
    <div className="page-header-info">
      <div className="page-title-row">
        {icon && <span className="page-title-icon">{icon}</span>}
        <Title level={2} className="page-title">{title}</Title>
        {badge && <span className="page-title-badge">{badge}</span>}
        {count !== undefined && (
          <span className="page-count-badge">{count} {countLabel}</span>
        )}
      </div>
      {subtitle && <Text className="page-subtitle">{subtitle}</Text>}
    </div>
    {extra && <div className="page-header-actions">{extra}</div>}
  </div>
);

export default PageHeader;
