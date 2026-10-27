import React from 'react';
import { Col, DatePicker, Form, Input, Row, Select } from 'antd';
import dayjs from 'dayjs';
import { FormSection } from './ModalForm';

export const ElderlyPersonalFields = ({ showStatus = false, showCccd = true }) => (
  <FormSection title="Thông tin cá nhân" description="Thông tin nhận diện cơ bản của người cao tuổi">
    <Row gutter={18}>
      <Col xs={24} md={12}><Form.Item name="hoTen" label="Họ và tên" rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập họ và tên' }, { max: 100, message: 'Họ tên tối đa 100 ký tự' }]}><Input maxLength={100} placeholder="VD: Nguyễn Văn An" /></Form.Item></Col>
      <Col xs={24} md={12}><Form.Item name="ngaySinh" preserve={false} label="Ngày sinh" rules={[{ required: true, message: 'Vui lòng chọn ngày sinh' }]}><DatePicker disabledDate={(date) => date && date.isAfter(dayjs(), 'day')} format="DD/MM/YYYY" placeholder="Chọn ngày sinh" style={{ width: '100%' }} /></Form.Item></Col>
      <Col xs={24} md={12}><Form.Item name="gioiTinh" preserve={false} label="Giới tính" rules={[{ required: true, message: 'Vui lòng chọn giới tính' }]}><Select placeholder="Chọn giới tính" options={[{ value: 'Nam' }, { value: 'Nữ' }, { value: 'Khác' }]} /></Form.Item></Col>
      {showCccd && <Col xs={24} md={12}><Form.Item name="cccd" preserve={false} label="CCCD" rules={[{ pattern: /^\d{12}$/, message: 'CCCD phải gồm đúng 12 chữ số' }]}><Input maxLength={12} placeholder="VD: 079123456789" /></Form.Item></Col>}
      <Col xs={24} md={12}><Form.Item name="soDienThoai" label="Số điện thoại" rules={[{ pattern: /^0\d{9}$/, message: 'Số điện thoại phải có 10 số và bắt đầu bằng 0' }]}><Input maxLength={10} placeholder="VD: 0901234567" /></Form.Item></Col>
      {showStatus && <Col xs={24} md={12}><Form.Item name="trangThai" label="Trạng thái"><Select options={[{ value: 'DangTheoDoi', label: 'Đang theo dõi' }, { value: 'CanChamSocDacBiet', label: 'Cần chăm sóc đặc biệt' }, { value: 'NgungTheoDoi', label: 'Ngừng theo dõi' }]} /></Form.Item></Col>}
    </Row>
    <Form.Item name="diaChi" preserve={false} label="Địa chỉ thường trú" rules={[{ max: 255, message: 'Địa chỉ tối đa 255 ký tự' }]}><Input maxLength={255} placeholder="Nhập số nhà, đường, phường/xã, quận/huyện, tỉnh/thành" /></Form.Item>
  </FormSection>
);

export const ElderlyHealthFields = () => (
  <FormSection title="Thông tin sức khỏe" description="Nhóm máu, bệnh nền và dị ứng cần lưu ý">
    <Row gutter={18}><Col xs={24} md={12}><Form.Item name="nhomMau" preserve={false} label="Nhóm máu"><Select placeholder="Chọn nhóm máu" allowClear options={['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((value) => ({ value }))} /></Form.Item></Col></Row>
    <Form.Item name="benhNen" preserve={false} label="Bệnh nền" rules={[{ max: 500, message: 'Bệnh nền tối đa 500 ký tự' }]}><Input.TextArea maxLength={500} autoSize={{ minRows: 2, maxRows: 5 }} placeholder="VD: Tăng huyết áp, tiểu đường (phân cách bằng dấu phẩy)" /></Form.Item>
    <Form.Item name="diUng" preserve={false} label="Dị ứng" rules={[{ max: 300, message: 'Dị ứng tối đa 300 ký tự' }]}><Input.TextArea maxLength={300} autoSize={{ minRows: 2, maxRows: 5 }} placeholder="VD: Penicillin, hải sản (phân cách bằng dấu phẩy)" /></Form.Item>
  </FormSection>
);
