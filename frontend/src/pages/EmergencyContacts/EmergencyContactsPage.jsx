import React, { useEffect, useMemo, useState } from 'react';
import {
  Button, Col, Form, Input, message, Popconfirm, Row, Select, Spin, Tag,
} from 'antd';
import {
  ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, EditOutlined,
  EnvironmentOutlined, MailOutlined, PhoneOutlined, PlusOutlined,
  SafetyCertificateOutlined, TeamOutlined,
} from '@ant-design/icons';
import {
  createContact, deleteContact, getEmergencyContacts, reorderEmergencyContacts, updateContact,
} from '../../services/emergencyService';
import { getElders } from '../../services/elderlyService';
import ModalForm, { FormSection } from '../../components/ModalForm';
import usePermission from '../../hooks/usePermission';
import TableAvatar from '../../components/TableAvatar';
import { formatEntityCode } from '../../utils/displayUtils';

const EmergencyContactsPage = () => {
  const { hasPermission } = usePermission();
  const canCreate = hasPermission('QLLIENHEKC', 'them');
  const canEdit = hasPermission('QLLIENHEKC', 'sua');
  const canDelete = hasPermission('QLLIENHEKC', 'xoa');
  const [contacts, setContacts] = useState([]);
  const [elders, setElders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [selectedElder, setSelectedElder] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  const selectedProfile = useMemo(
    () => elders.find((item) => Number(item.id) === Number(selectedElder)) || null,
    [elders, selectedElder],
  );

  const sortedContacts = useMemo(
    () => [...contacts].sort((a, b) => Number(a.uuTien || 999) - Number(b.uuTien || 999)),
    [contacts],
  );

  const loadContacts = async () => {
    if (!selectedElder) {
      setContacts([]);
      return;
    }
    setLoading(true);
    try {
      setContacts(await getEmergencyContacts({ nguoiCaoTuoiId: selectedElder }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    getElders()
      .then((data) => {
        if (!active) return;
        setElders(data);
        setSelectedElder((current) => current || data[0]?.id || null);
        if (!data.length) setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setElders([]);
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedElder) return undefined;
    let active = true;
    getEmergencyContacts({ nguoiCaoTuoiId: selectedElder })
      .then((data) => { if (active) setContacts(data); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedElder]);

  const handleSelectElder = (value) => {
    setLoading(true);
    setSelectedElder(value);
  };

  const handleAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      nguoiCaoTuoiId: selectedElder,
      uuTien: sortedContacts.length + 1,
    });
    setModalOpen(true);
  };

  const handleEdit = (contact) => {
    setEditing(contact);
    form.setFieldsValue({ ...contact, nguoiCaoTuoiId: selectedElder });
    setModalOpen(true);
  };

  const handleSave = async (values) => {
    setSaving(true);
    try {
      const payload = {
        ...values,
        nguoiCaoTuoiId: selectedElder,
        uuTien: editing?.uuTien || sortedContacts.length + 1,
      };
      if (editing) {
        await updateContact(editing.id, payload);
        message.success('Cập nhật liên hệ thành công');
      } else {
        await createContact(payload);
        message.success('Thêm liên hệ thành công');
      }
      setModalOpen(false);
      form.resetFields();
      await loadContacts();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    await deleteContact(id);
    const remainingIds = sortedContacts
      .filter((item) => Number(item.id) !== Number(id))
      .map((item) => item.id);
    if (remainingIds.length) await reorderEmergencyContacts(selectedElder, remainingIds);
    message.success('Xóa liên hệ thành công');
    await loadContacts();
  };

  const moveContact = async (index, direction) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= sortedContacts.length) return;
    const next = [...sortedContacts];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    const optimistic = next.map((item, position) => ({ ...item, uuTien: position + 1 }));
    setContacts(optimistic);
    setReordering(true);
    try {
      await reorderEmergencyContacts(selectedElder, optimistic.map((item) => item.id));
      message.success('Đã cập nhật thứ tự ưu tiên');
    } catch {
      await loadContacts();
      message.error('Không thể cập nhật thứ tự ưu tiên. Vui lòng thử lại.');
    } finally {
      setReordering(false);
    }
  };

  return (
    <div className="emergency-contacts-page">
      <section className="emergency-contacts-heading">
        <div>
          <span className="emergency-contacts-eyebrow"><span /> Danh bạ hỗ trợ khẩn cấp</span>
          <h1>Quản lý Liên hệ Khẩn cấp</h1>
          <p>Quản lý người thân cần liên lạc theo thứ tự ưu tiên của từng người cao tuổi.</p>
        </div>
      </section>

      <section className="selected-elder-card">
        <div className="selected-elder-copy">
          <TableAvatar name={selectedProfile?.hoTen || '?'} size={62} />
          <div>
            <small>Hồ sơ người cao tuổi được chọn</small>
            <strong>{selectedProfile?.hoTen || 'Chưa có hồ sơ'}</strong>
            {selectedProfile && (
              <span>
                {formatEntityCode('NCT', selectedProfile.id)} · {selectedProfile.tuoi ?? 'Chưa rõ tuổi'} tuổi · {selectedProfile.gioiTinh || 'Chưa cập nhật giới tính'}
              </span>
            )}
          </div>
        </div>
        <div className="selected-elder-picker">
          <label htmlFor="emergency-elder-select">Đổi người cao tuổi</label>
          <Select
            id="emergency-elder-select"
            showSearch
            optionFilterProp="label"
            value={selectedElder}
            placeholder="Chọn người cao tuổi"
            onChange={handleSelectElder}
            options={elders.map((item) => ({
              value: item.id,
              label: `${item.hoTen} · ${formatEntityCode('NCT', item.id)}`,
            }))}
          />
          <span><TeamOutlined /> {sortedContacts.length} liên hệ khẩn cấp</span>
        </div>
      </section>

      <div className="emergency-contacts-layout">
        <main className="emergency-contact-list-panel">
          <header>
            <div>
              <h2>Danh sách liên hệ theo thứ tự ưu tiên</h2>
              <p>Hệ thống ưu tiên liên hệ từ số 1 trở đi khi cần hỗ trợ.</p>
            </div>
            {canCreate && (
              <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} disabled={!selectedElder}>
                Thêm liên hệ
              </Button>
            )}
          </header>

          <Spin spinning={loading || reordering}>
            <div className="emergency-contact-list">
              {sortedContacts.map((contact, index) => (
                <article className={`emergency-contact-card priority-${index + 1}`} key={contact.id}>
                  <div className="contact-priority-column">
                    <span>{index + 1}</span>
                    {canEdit && sortedContacts.length > 1 && (
                      <div>
                        <Button
                          type="text"
                          size="small"
                          icon={<ArrowUpOutlined />}
                          disabled={index === 0 || reordering}
                          aria-label="Tăng mức ưu tiên"
                          onClick={() => moveContact(index, -1)}
                        />
                        <Button
                          type="text"
                          size="small"
                          icon={<ArrowDownOutlined />}
                          disabled={index === sortedContacts.length - 1 || reordering}
                          aria-label="Giảm mức ưu tiên"
                          onClick={() => moveContact(index, 1)}
                        />
                      </div>
                    )}
                  </div>

                  <div className="contact-card-main">
                    <header>
                      <div className="contact-identity">
                        <TableAvatar name={contact.hoTen} size={46} />
                        <div>
                          <strong>{contact.hoTen}</strong>
                          <Tag>{contact.moiQuanHe || 'Chưa cập nhật quan hệ'}</Tag>
                        </div>
                      </div>
                      <div className="contact-card-actions">
                        <Button
                          type="primary"
                          danger={index === 0}
                          icon={<PhoneOutlined />}
                          href={`tel:${String(contact.soDienThoai || '').replace(/[^+\d]/g, '')}`}
                        >
                          Gọi ngay
                        </Button>
                        {canEdit && <Button icon={<EditOutlined />} onClick={() => handleEdit(contact)}>Chỉnh sửa</Button>}
                        {canDelete && (
                          <Popconfirm
                            title="Xóa liên hệ này?"
                            description="Các liên hệ còn lại sẽ được sắp xếp lại thứ tự ưu tiên."
                            onConfirm={() => handleDelete(contact.id)}
                            okText="Xóa"
                            cancelText="Hủy"
                          >
                            <Button danger icon={<DeleteOutlined />}>Xóa</Button>
                          </Popconfirm>
                        )}
                      </div>
                    </header>

                    <div className="contact-detail-grid">
                      <div><PhoneOutlined /><span><small>SĐT chính</small><strong>{contact.soDienThoai || 'Chưa cập nhật'}</strong></span></div>
                      <div><PhoneOutlined /><span><small>SĐT phụ</small><strong>{contact.soDienThoaiPhu || 'Chưa cập nhật'}</strong></span></div>
                      <div><MailOutlined /><span><small>Email</small><strong>{contact.email || 'Chưa cập nhật'}</strong></span></div>
                      <div><EnvironmentOutlined /><span><small>Địa chỉ</small><strong>{contact.diaChi || 'Chưa cập nhật'}</strong></span></div>
                    </div>
                  </div>
                </article>
              ))}

              {!loading && sortedContacts.length === 0 && (
                <div className="emergency-contact-empty">
                  <TeamOutlined />
                  <strong>Chưa có liên hệ khẩn cấp</strong>
                  <span>Hãy thêm người thân cần liên hệ đầu tiên cho hồ sơ này.</span>
                  {canCreate && selectedElder && <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>Thêm liên hệ</Button>}
                </div>
              )}
            </div>
          </Spin>
        </main>

        <aside className="national-hotline-card">
          <header>
            <span><SafetyCertificateOutlined /></span>
            <div><h2>Số khẩn cấp quốc gia</h2><p>Gọi trực tiếp khi cần hỗ trợ.</p></div>
          </header>
          {[
            { number: '115', label: 'Cấp cứu', tone: 'medical' },
            { number: '114', label: 'Cứu hỏa', tone: 'fire' },
            { number: '113', label: 'Công an', tone: 'police' },
          ].map((hotline) => (
            <div className={`national-hotline-row is-${hotline.tone}`} key={hotline.number}>
              <div><strong>{hotline.number}</strong><span>{hotline.label}</span></div>
              <Button shape="circle" icon={<PhoneOutlined />} href={`tel:${hotline.number}`} aria-label={`Gọi ${hotline.label}`} />
            </div>
          ))}
          <small>Chỉ gọi các số trên trong tình huống cần hỗ trợ khẩn cấp.</small>
        </aside>
      </div>

      <ModalForm
        title={editing ? 'Chỉnh sửa liên hệ khẩn cấp' : 'Thêm liên hệ khẩn cấp'}
        subtitle={`Liên hệ cho ${selectedProfile?.hoTen || 'người cao tuổi đã chọn'}`}
        icon={<PhoneOutlined />}
        mode={editing ? 'edit' : 'create'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onFinish={handleSave}
        loading={saving}
        form={form}
      >
        <Form.Item name="nguoiCaoTuoiId" hidden><Input /></Form.Item>
        <Form.Item name="uuTien" hidden><Input /></Form.Item>
        <FormSection title="Thông tin liên hệ" description="Họ tên và mối quan hệ với người cao tuổi">
          <Row gutter={18}>
            <Col xs={24} md={12}>
              <Form.Item name="hoTen" label="Họ và tên người liên hệ" rules={[{ required: true, message: 'Vui lòng nhập họ và tên người liên hệ' }]}>
                <Input placeholder="VD: Nguyễn Văn Minh" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="moiQuanHe" label="Mối quan hệ" rules={[{ required: true, message: 'Vui lòng nhập mối quan hệ' }]}>
                <Input placeholder="VD: Con trai, con gái" />
              </Form.Item>
            </Col>
          </Row>
        </FormSection>

        <FormSection title="Kênh liên lạc" description="Số điện thoại, email và địa chỉ liên hệ">
          <Row gutter={18}>
            <Col xs={24} md={12}>
              <Form.Item name="soDienThoai" label="Số điện thoại chính" rules={[{ required: true, message: 'Vui lòng nhập số điện thoại chính' }, { pattern: /^0\d{9}$/, message: 'Số điện thoại phải có 10 số và bắt đầu bằng 0' }]}>
                <Input placeholder="VD: 0901234567" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="soDienThoaiPhu" label="Số điện thoại phụ" rules={[{ pattern: /^0\d{9}$/, message: 'Số điện thoại phải có 10 số và bắt đầu bằng 0' }]}>
                <Input placeholder="Số điện thoại dự phòng" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Email không đúng định dạng' }]}>
                <Input placeholder="VD: lienhe@email.com" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="diaChi" label="Địa chỉ">
                <Input placeholder="Nhập địa chỉ liên hệ" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="ghiChu" label="Ghi chú">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="Thông tin cần lưu ý khi liên hệ" />
          </Form.Item>
        </FormSection>
      </ModalForm>
    </div>
  );
};

export default EmergencyContactsPage;
