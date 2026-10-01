import React from 'react';
import { Empty, Table } from 'antd';

const DataTable = ({
  columns,
  dataSource = [],
  rowKey = 'id',
  loading = false,
  pageSize = 10,
  rowClassName,
  onRow,
  pagination,
  emptyDescription = 'Chưa có dữ liệu phù hợp',
  emptyAction,
  style,
  ...rest
}) => {
  const defaultPagination = {
    pageSize,
    showSizeChanger: true,
    pageSizeOptions: ['10', '20', '50'],
    hideOnSinglePage: false,
  };

  const resolvedPagination = pagination === false
    ? false
    : { ...defaultPagination, ...(pagination || {}) };

  const resolvedRowClassName = (record, index) => {
    const customClass = typeof rowClassName === 'function'
      ? rowClassName(record, index)
      : (rowClassName || '');
    return [customClass, onRow ? 'table-row-clickable' : ''].filter(Boolean).join(' ');
  };

  return (
    <div className="data-table-wrapper" style={style}>
      <Table
        columns={columns}
        dataSource={dataSource}
        rowKey={rowKey}
        loading={loading}
        scroll={{ x: 'max-content' }}
        pagination={resolvedPagination}
        rowClassName={resolvedRowClassName}
        onRow={onRow}
        locale={{
          emptyText: (
            <div className="table-empty-state">
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyDescription} />
              {emptyAction && <div className="table-empty-action">{emptyAction}</div>}
            </div>
          ),
        }}
        {...rest}
      />
    </div>
  );
};

export default DataTable;
