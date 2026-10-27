import React from 'react';
import { Alert, Button, Form, Space } from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import { ElderlyPersonalFields, ElderlyHealthFields } from '../../components/ElderlyProfileFields';

export default function ElderlyProfileCompletion({ user, state, store, canComplete, onLogout }) {
  return <section className="elderly-web-completion" aria-labelledby="complete-profile-title">
    <div className="elderly-web-section-icon"><SafetyCertificateOutlined /></div>
    <h1 id="complete-profile-title">Hoàn thiện hồ sơ của bạn</h1>
    <p>Tài khoản đã đăng nhập thành công. Vui lòng bổ sung hồ sơ để tiếp tục sử dụng CareSenior trên Web và Mobile.</p>
    <p className="elderly-web-account-note">Tài khoản: <strong>{user.tenDangNhap || user.hoTen}</strong>. Chỉ bổ sung hồ sơ cho chính bạn.</p>
    {!canComplete ? <Alert type="warning" showIcon title="Chưa có quyền hoàn thiện hồ sơ" description="Vui lòng liên hệ quản trị viên để được hỗ trợ." />
      : <Form layout="vertical" initialValues={{ hoTen: user.hoTen, soDienThoai: user.soDienThoai }}
        disabled={state.phase === 'saving'} onFinish={values => store.complete(values)} scrollToFirstError>
        {state.notice && <Alert role="alert" type="error" showIcon title={state.notice} style={{ marginBottom: 20 }} />}
        <ElderlyPersonalFields />
        <ElderlyHealthFields />
        <p className="elderly-web-account-note">Thông tin được kiểm tra bằng quy tắc hồ sơ hiện có của hệ thống. Không tạo thêm tài khoản đăng nhập.</p>
        <Button type="primary" size="large" htmlType="submit" loading={state.phase === 'saving'} block>Lưu hồ sơ và tiếp tục</Button>
      </Form>}
    <Space wrap style={{ marginTop: 20 }}><Button onClick={onLogout}>Đăng xuất</Button></Space>
  </section>;
}
