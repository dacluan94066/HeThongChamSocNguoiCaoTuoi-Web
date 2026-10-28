import React, { useEffect, useState } from 'react';
import { Alert, Button, Radio, Select } from 'antd';
import { getLinkedRelativeContacts } from '../services/emergencyService';
import './LinkedRelativeContactPicker.css';

export default function LinkedRelativeContactPicker({ elderlyId, disabled, onChoose }) {
  const [mode, setMode] = useState('manual');
  const [resource, setResource] = useState({ loading: false, rows: [], error: '' });
  const [selected, setSelected] = useState(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (mode !== 'linked') return undefined;
    let active = true;
    const abort = new AbortController();
    getLinkedRelativeContacts(elderlyId, abort.signal).then(rows => {
      if (active) setResource({ loading: false, rows, error: '' });
    }).catch(error => {
      if (active && error.code !== 'ERR_CANCELED') setResource({ loading: false, rows: [],
        error: error.response?.data?.message || 'Không thể tải Người thân. Vui lòng thử lại hoặc nhập thủ công.' });
    });
    return () => { active = false; abort.abort(); };
  }, [elderlyId, mode, refresh]);
  return <section className="linked-contact-picker" aria-label="Nguồn thông tin liên hệ">
    <strong>Cách thêm liên hệ</strong>
    <Radio.Group value={mode} disabled={disabled} onChange={event => {
      setMode(event.target.value);
      if (event.target.value === 'linked') {
        setSelected(null);
        setResource({ loading: true, rows: [], error: '' });
      }
    }}>
      <Radio.Button value="manual">Nhập thủ công</Radio.Button>
      <Radio.Button value="linked">Chọn từ Người thân đã liên kết</Radio.Button>
    </Radio.Group>
    {mode === 'linked' && <div className="linked-contact-picker-content">
      <label htmlFor="linked-relative-contact">Người thân của NCT đang chọn</label>
      <Select id="linked-relative-contact" showSearch optionFilterProp="label" value={selected}
        placeholder="Chọn Người thân để điền thông tin" loading={resource.loading}
        disabled={disabled || resource.loading || Boolean(resource.error)}
        notFoundContent="Chưa có Người thân còn liên kết và tài khoản đang hoạt động"
        options={resource.rows.map(row => ({ value: row.id, label: `${row.hoTen} · ${row.moiQuanHe}${row.soDienThoai ? ` · ${row.soDienThoai}` : ' · Chưa có SĐT'}` }))}
        onChange={value => {
          const row = resource.rows.find(item => item.id === value);
          if (!row) return;
          setSelected(value);
          onChoose({ hoTen: row.hoTen || '', moiQuanHe: row.moiQuanHe || '',
            soDienThoai: row.soDienThoai || '', email: row.email || '' });
        }} />
      {resource.error && <Alert type="warning" showIcon title={resource.error}
        action={<Button disabled={disabled} onClick={() => {
          setSelected(null);
          setResource({ loading: true, rows: [], error: '' });
          setRefresh(value => value + 1);
        }}>Tải lại</Button>} />}
      {!resource.loading && !resource.error && !resource.rows.length && <p role="status">Chưa có Người thân đủ điều kiện. Bạn có thể chọn “Nhập thủ công”.</p>}
      {selected != null && <Alert type="info" showIcon title="Kiểm tra số điện thoại trước khi lưu"
        description="Liên hệ lưu độc lập, không tự đồng bộ. Thêm hoặc xóa liên hệ không thay đổi quyền theo dõi NCT." />}
    </div>}
  </section>;
}
