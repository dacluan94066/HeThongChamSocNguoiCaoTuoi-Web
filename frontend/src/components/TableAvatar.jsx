import React from 'react';
import { Avatar } from 'antd';
import { getNameColor, getNameInitials } from '../utils/displayUtils';

const TableAvatar = ({ name, size = 40 }) => (
  <Avatar
    size={size}
    className="table-person-avatar"
    style={{ backgroundColor: getNameColor(name), flexShrink: 0 }}
  >
    {getNameInitials(name)}
  </Avatar>
);

export default TableAvatar;
