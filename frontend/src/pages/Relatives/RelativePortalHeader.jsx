import React, { useId, useRef, useState } from 'react';
import { Avatar, Dropdown } from 'antd';
import { DownOutlined, HeartFilled, LockOutlined, LogoutOutlined, TeamOutlined } from '@ant-design/icons';
import { getNameInitials } from '../../utils/displayUtils';
import './RelativePortalHeader.css';

export default function RelativePortalHeader({ user, onHome, onChangePassword, onLogout }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const accountButton = useRef(null);
  const name = user?.hoTen?.trim() || user?.tenDangNhap?.trim() || 'Người thân';
  const closeMenu = () => {
    setOpen(false);
    accountButton.current?.focus();
  };

  return <header className="relative-family-header">
    <div className="relative-family-header-inner">
      <button type="button" className="relative-family-brand" onClick={onHome} aria-label="CareSenior — về Người thân của tôi">
        <span className="relative-family-brand-mark" aria-hidden="true"><HeartFilled /></span>
        <span className="relative-family-brand-copy"><strong>CareSenior</strong><small>Kết nối cùng gia đình</small></span>
      </button>
      <nav className="relative-family-navigation" aria-label="Điều hướng Người thân">
        <button type="button" aria-current="page" onClick={onHome}>
          <TeamOutlined aria-hidden="true" /><span>Người thân của tôi</span>
        </button>
      </nav>
      <Dropdown open={open} onOpenChange={setOpen} trigger={['click']} placement="bottomRight" autoAdjustOverflow autoFocus destroyOnHidden
        classNames={{ root: 'relative-family-account-popup' }}
        menu={{ id: menuId, 'aria-label': 'Tài khoản Người thân', items: [
          { key: 'password', icon: <LockOutlined />, label: 'Đổi mật khẩu' },
          { type: 'divider' },
          { key: 'logout', icon: <LogoutOutlined />, label: 'Đăng xuất', danger: true },
        ], onClick: ({ key }) => {
          closeMenu();
          if (key === 'password') onChangePassword();
          if (key === 'logout') onLogout();
        } }}
        popupRender={menu => <div className="relative-family-account-menu" tabIndex={-1} onFocus={event => {
          if (event.target === event.currentTarget) event.currentTarget.querySelector('[role="menuitem"]')?.focus();
        }} onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeMenu(); }
        }}>
          <div className="relative-family-menu-identity"><strong>{name}</strong><span>Người thân · Chỉ xem</span></div>
          {menu}
        </div>}>
        <button ref={accountButton} type="button" className={`relative-family-account-trigger${open ? ' is-open' : ''}`}
          aria-label={`Tài khoản ${name}`} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
          title={name} onKeyDown={event => {
            if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); }
            if (event.key === 'Escape') closeMenu();
          }}>
          <Avatar className="relative-family-avatar" size={40} aria-hidden="true">{getNameInitials(name)}</Avatar>
          <span className="relative-family-account-copy"><strong>{name}</strong><small><i aria-hidden="true" />Người thân</small></span>
          <DownOutlined className="relative-family-account-caret" aria-hidden="true" />
        </button>
      </Dropdown>
    </div>
  </header>;
}
