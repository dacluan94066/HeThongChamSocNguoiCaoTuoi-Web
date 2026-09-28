// App.jsx - Cấu hình routing toàn bộ ứng dụng
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntApp } from 'antd';
import viVN from 'antd/locale/vi_VN';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import themeConfig from './theme/themeConfig';

// Context
import { AuthProvider } from './context/AuthContext';

// Layout
import MainLayout from './layouts/MainLayout';
import ProtectedRoute from './components/ProtectedRoute';

// Pages
import LoginPage from './pages/Login/LoginPage';
import DashboardPage from './pages/Dashboard/DashboardPage';
import UsersPage from './pages/Users/UsersPage';
import ElderlyProfilesPage from './pages/ElderlyProfiles/ElderlyProfilesPage';
import CaregiversPage from './pages/Caregivers/CaregiversPage';
import MedicationsPage from './pages/Medications/MedicationsPage';
import MedicationSchedulePage from './pages/MedicationSchedule/MedicationSchedulePage';
import AppointmentsPage from './pages/Appointments/AppointmentsPage';
import HealthMetricsPage from './pages/HealthMetrics/HealthMetricsPage';
import AlertsPage from './pages/Alerts/AlertsPage';
import EmergencyContactsPage from './pages/EmergencyContacts/EmergencyContactsPage';
import CareNotesPage from './pages/CareNotes/CareNotesPage';
import ReportsPage from './pages/Reports/ReportsPage';

// Thiết lập ngôn ngữ tiếng Việt cho dayjs
dayjs.locale('vi');

const App = () => {
  return (
    <ConfigProvider locale={viVN} theme={themeConfig}>
      <AntApp>
        {/* AuthProvider bọc toàn bộ app để mọi component đều truy cập được thông tin user */}
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              {/* Trang đăng nhập - không dùng layout chính */}
              <Route path="/login" element={<LoginPage />} />

              {/* Các trang yêu cầu đăng nhập - dùng MainLayout */}
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <MainLayout />
                  </ProtectedRoute>
                }
              >
                {/* Redirect từ / về /dashboard */}
                <Route index element={<Navigate to="/dashboard" replace />} />

                {/* Tổng quan */}
                <Route path="dashboard" element={<DashboardPage />} />

                {/* Quản lý hệ thống */}
                <Route path="nguoi-dung" element={<UsersPage />} />
                <Route path="ho-so-nguoi-cao-tuoi" element={<ElderlyProfilesPage />} />
                <Route path="nguoi-cham-soc" element={<CaregiversPage />} />

                {/* Thuốc & Lịch */}
                <Route path="danh-muc-thuoc" element={<MedicationsPage />} />
                <Route path="lich-uong-thuoc" element={<MedicationSchedulePage />} />
                <Route path="lich-kham-benh" element={<AppointmentsPage />} />

                {/* Theo dõi sức khỏe */}
                <Route path="chi-so-suc-khoe" element={<HealthMetricsPage />} />
                <Route path="canh-bao" element={<AlertsPage />} />

                {/* Tiện ích */}
                <Route path="lien-he-khan-cap" element={<EmergencyContactsPage />} />
                <Route path="nhat-ky-cham-soc" element={<CareNotesPage />} />
                <Route path="bao-cao" element={<ReportsPage />} />
              </Route>

              {/* Fallback - redirect về dashboard */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </AntApp>
    </ConfigProvider>
  );
};

export default App;
