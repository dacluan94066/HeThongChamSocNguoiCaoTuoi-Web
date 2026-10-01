import React from 'react';
import { Button, Tooltip } from 'antd';

const TableActionButton = ({ type = 'view', tooltip, icon, onClick, ...rest }) => (
  <Tooltip title={tooltip}>
    <Button
      shape="circle"
      type="text"
      size="small"
      icon={icon}
      className={`table-action-button action-${type}`}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
      {...rest}
    />
  </Tooltip>
);

export default TableActionButton;
