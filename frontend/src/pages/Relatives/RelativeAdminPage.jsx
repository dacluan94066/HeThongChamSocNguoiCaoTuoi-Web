import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Empty, Input, Result, Select, Space, Spin, Tag } from 'antd';
import { ReloadOutlined, SearchOutlined, TeamOutlined, UserAddOutlined } from '@ant-design/icons';
import { useAuth } from '../../context/AuthContext';
import { getUsers } from '../../services/userService';
import { getRelativeLinks } from '../../services/relativeService';
import { canViewRelativeAdmin, isFamilyAccount, relativeErrorInfo } from '../../utils/relativeAdmin';
import RelativeLinksPanel, { RelativeUnavailable } from '../../components/RelativeLinksPanel';
import TableAvatar from '../../components/TableAvatar';
import './RelativeAdmin.css';

const RelativeAdminPage = () => {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const allowed = canViewRelativeAdmin(user, hasPermission);
  const [accounts, setAccounts] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState(null);
  const [schemaError, setSchemaError] = useState(null), [schemaReady, setSchemaReady] = useState(false);
  const [search, setSearch] = useState(''), [status, setStatus] = useState('all'), [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!allowed) return;
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return null;
      setLoading(true); setError(null); setSchemaReady(false); setSchemaError(null);
      return Promise.allSettled([getUsers({ vaiTro: 'NGUOI_THAN' }), getRelativeLinks({ limit: 1 })]);
    }).then(result => {
      if (!active || !result) return;
      const [users, readiness] = result;
      if (users.status === 'fulfilled') setAccounts(users.value.filter(isFamilyAccount));
      else { setAccounts([]); setError(users.reason); }
      if (readiness.status === 'fulfilled') setSchemaReady(true);
      else setSchemaError(readiness.reason);
      setLoading(false);
    });
    return () => { active = false; };
  }, [allowed, revision]);
  const filtered = useMemo(() => accounts.filter(account => (status === 'all' || account.trangThai === status)
    && (!search.trim() || [account.hoTen, account.username, account.email].some(value => String(value || '')
      .toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi'))))), [accounts, search, status]);
  const selectedId = Number(params.get('userId'));
  const selected = accounts.find(account => Number(account.id) === selectedId) || (!selectedId ? filtered[0] : null);
  if (!allowed) return <Result status="403" title="Chỉ Quản trị viên được quản lý Người thân" />;
  const setSelected = account => { const next = new URLSearchParams(params); next.set('userId', String(account.id)); setParams(next); };
  return <div className="relative-admin-page">
    <header className="relative-page-heading"><div><span className="relative-eyebrow"><TeamOutlined /> Quản trị · Quyền theo dõi</span>
      <h1>Quản lý Người thân</h1><p>Quản lý tài khoản và việc chia sẻ dữ liệu NCT theo sự đồng ý đã xác minh.</p></div>
      <Space wrap><Button icon={<ReloadOutlined />} loading={loading} onClick={reload}>Tải lại</Button>
        {hasPermission('QLNGUOIDUNG', 'them') && <Button type="primary" icon={<UserAddOutlined />} disabled={!schemaReady || loading}
          onClick={() => navigate('/nguoi-dung?role=NGUOI_THAN&create=1&from=relatives')}>Tạo tài khoản Người thân</Button>}</Space></header>
    {schemaError && <RelativeUnavailable error={schemaError} onRetry={reload} />}
    {error && <RelativeUnavailable error={error} onRetry={reload} />}
    <div className="relative-admin-summary"><span><strong>{accounts.length}</strong> tài khoản Người thân</span>
      <span><strong>{accounts.filter(account => account.trangThai === 'HOAT_DONG').length}</strong> đang hoạt động</span>
      <span>Liên kết chỉ cấp sau khi có sự đồng ý</span></div>
    <div className="relative-admin-workspace">
      <section className="relative-accounts-panel" aria-label="Danh sách tài khoản Người thân"><h2>Tài khoản Người thân</h2>
        <Input prefix={<SearchOutlined />} aria-label="Tìm tài khoản Người thân" placeholder="Tìm tên, tài khoản, email" allowClear value={search} onChange={event => setSearch(event.target.value)} />
        <Select aria-label="Trạng thái tài khoản Người thân" value={status} onChange={setStatus} options={[
          { value: 'all', label: 'Tất cả trạng thái' }, { value: 'HOAT_DONG', label: 'Hoạt động' },
          { value: 'KHOA', label: 'Đã khóa' }, { value: 'CHO_DUYET', label: 'Chờ duyệt' }]} />
        <Spin spinning={loading}><div className="relative-account-list">{filtered.length ? filtered.map(account => <button type="button"
          key={account.id} className={selected?.id === account.id ? 'is-selected' : ''} aria-pressed={selected?.id === account.id} onClick={() => setSelected(account)}>
          <TableAvatar name={account.hoTen} size={38} /><span><strong>{account.hoTen}</strong><small>{account.username}</small>
            <Tag color={account.trangThai === 'HOAT_DONG' ? 'green' : 'default'}>{account.trangThaiLabel || account.trangThai}</Tag></span>
        </button>) : <Empty description={loading ? 'Đang tải tài khoản...' : error ? relativeErrorInfo(error).message : 'Chưa có tài khoản phù hợp'} />}</div></Spin>
        <Button block onClick={() => navigate('/nguoi-dung?role=NGUOI_THAN')}>Mở quản lý tài khoản</Button>
      </section>
      <div className="relative-selected-panel">{!schemaReady ? <Empty description={loading ? 'Đang kiểm tra chức năng...' : 'Liên kết chưa sẵn sàng'} />
        : selected ? <><div className="relative-selected-account"><h2>{selected.hoTen}</h2><p>{selected.username}</p></div>
          <RelativeLinksPanel key={selected.id} relative={selected} /></>
          : <Empty description={selectedId ? 'Không tìm thấy tài khoản được chọn. Hãy chọn tài khoản trong danh sách.' : 'Chọn tài khoản để xem và quản lý các NCT được theo dõi.'} />}</div>
    </div>
  </div>;
};
export default RelativeAdminPage;
