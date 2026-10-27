import React, { useCallback, useState } from 'react';
import { Alert, Button, Form, Input, Modal } from 'antd';
import dayjs from 'dayjs';
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ElderlyHealthFields, ElderlyPersonalFields } from '../../components/ElderlyProfileFields';
import { editableProfile } from '../../utils/elderlyCare';
import { formatAlertTime } from '../../utils/alertTime';
import api from '../../services/elderlyCareService';
import { useElderlyMutation, useElderlyResource } from '../../hooks/useElderlyResource';
import { Caregivers, CareSection, MutationNotice } from './ElderlyCareUi';
import GoogleWebAuth from '../../components/GoogleWebAuth';

export function ElderlyProfilePage() {
  const { profile, user, refreshProfile, openPassword } = useOutletContext(), { logout, hasPermission } = useAuth();
  const [editing, setEditing] = useState(false), [form] = Form.useForm();
  const mutation = useElderlyMutation();
  const caregivers = useElderlyResource(useCallback(signal => api.caregivers(signal), []), `profile-care:${profile.id}`);
  const startEdit = () => { mutation.clearNotice(); form.resetFields(); form.setFieldsValue({ ...editableProfile(profile), ngaySinh: profile.ngaySinh ? dayjs(profile.ngaySinh.slice(0, 10)) : null }); setEditing(true); };
  const close = () => { if (!mutation.busy) setEditing(false); };
  const items = [['Họ và tên', profile.hoTen], ['Ngày sinh', profile.ngaySinh ? dayjs(profile.ngaySinh.slice(0, 10)).format('DD/MM/YYYY') : null],
    ['Giới tính', profile.gioiTinh], ['Email', profile.email], ['Số điện thoại', profile.soDienThoai], ['Địa chỉ', profile.diaChi],
    ['Nhóm máu', profile.nhomMau], ['Bệnh nền', profile.benhNen], ['Dị ứng', profile.diUng], ['Ngày tạo hồ sơ', formatAlertTime(profile.ngayTao)]];
  return <>
    <div className="elderly-web-welcome"><h1>Hồ sơ của tôi</h1><p>Thông tin được dùng chung trên Web và Mobile.</p></div>
    <MutationNotice mutation={mutation} />
    <CareSection title="Thông tin cá nhân" action={hasPermission('QLHOSONCT', 'sua') && <Button type="primary" onClick={startEdit}>Chỉnh sửa hồ sơ</Button>}>
      <dl className="elderly-care-details">{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{Array.isArray(value) ? value.join(', ') || 'Chưa có dữ liệu' : value || 'Chưa có dữ liệu'}</dd></div>)}</dl>
      <Button onClick={refreshProfile}>Tải lại hồ sơ</Button>
    </CareSection>
    <Caregivers resource={caregivers} />
    <CareSection title="Tài khoản và bảo mật"><p>Tên đăng nhập: <strong>{user.tenDangNhap}</strong> · Người cao tuổi</p><div className="elderly-care-actions"><Button onClick={openPassword}>Đổi mật khẩu</Button><Button onClick={logout}>Đăng xuất</Button></div></CareSection>
    <GoogleWebAuth mode="link" />
    <Modal className="elderly-care-modal" title="Cập nhật hồ sơ của tôi" open={editing} onCancel={close} footer={null} width={760} closable={!mutation.busy} maskClosable={!mutation.busy}>
      <Alert type="info" showIcon title="Chỉ cập nhật thông tin hồ sơ của chính bạn" description="CCCD và thông tin quản lý không được chỉnh sửa tại đây." />
      <MutationNotice mutation={mutation} />
      <Form form={form} initialValues={{ ...editableProfile(profile), ngaySinh: profile.ngaySinh ? dayjs(profile.ngaySinh.slice(0, 10)) : null }} name="elderly-profile-edit" layout="vertical" disabled={mutation.busy} onFinish={values => mutation.run(signal => api.updateProfile({ ...values, nhomMau: values.nhomMau ?? null }, signal), () => {
        // Reload via the existing owner-verified gate instead of trusting form values.
        setEditing(false); refreshProfile();
      })}>
        <ElderlyPersonalFields showCccd={false} />
        <Form.Item name="email" label="Email" rules={[{ required: true, message: 'Vui lòng nhập email' }, { type: 'email', message: 'Email không hợp lệ' }, { max: 100, message: 'Email tối đa 100 ký tự' }]}><Input maxLength={100} type="email" /></Form.Item>
        <ElderlyHealthFields />
        <div className="elderly-care-actions"><Button onClick={close}>Hủy</Button><Button type="primary" htmlType="submit" loading={mutation.busy}>Lưu thay đổi</Button></div>
      </Form>
    </Modal>
  </>;
}
