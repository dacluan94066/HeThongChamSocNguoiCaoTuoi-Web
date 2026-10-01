import React from 'react';
import { Avatar } from 'antd';
import { getNameColor, getNameInitials } from '../utils/displayUtils';

const TableAvatar = ({ name, src, size = 40 }) => (
  <Avatar
    src={src || undefined}
    size={size}
    className="table-person-avatar"
    style={{ backgroundColor: src ? undefined : getNameColor(name), flexShrink: 0 }}
  >
    {!src && getNameInitials(name)}
  </Avatar>
);

export default TableAvatar;
