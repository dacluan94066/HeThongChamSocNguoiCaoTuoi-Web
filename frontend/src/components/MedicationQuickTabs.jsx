import React from 'react';
import { ClockCircleOutlined, MedicineBoxOutlined } from '@ant-design/icons';
import { Link, useLocation } from 'react-router-dom';
import usePermission from '../hooks/usePermission';

const MedicationQuickTabs = () => {
  const location = useLocation();
  const { hasPermission } = usePermission();
  const tabs = [
    {
      path: '/lich-uong-thuoc',
      label: 'Lịch uống thuốc',
      icon: <ClockCircleOutlined />,
      visible: hasPermission('QLLICHUONGTHUOC', 'xem'),
    },
    {
      path: '/danh-muc-thuoc',
      label: 'Thuốc của NCT',
      icon: <MedicineBoxOutlined />,
      visible: hasPermission('QLTHUOC', 'xem'),
    },
  ].filter((tab) => tab.visible);

  if (tabs.length < 2) return null;

  return (
    <nav className="medication-quick-tabs" aria-label="Chuyển trang quản lý thuốc">
      {tabs.map((tab) => (
        <Link
          key={tab.path}
          to={tab.path}
          className={`medication-quick-tab ${location.pathname === tab.path ? 'is-active' : ''}`}
        >
          {tab.icon}
          <span>{tab.label}</span>
        </Link>
      ))}
    </nav>
  );
};

export default MedicationQuickTabs;
