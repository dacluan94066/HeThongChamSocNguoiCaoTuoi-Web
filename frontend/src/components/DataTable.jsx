// src/components/DataTable.jsx
// Wrapper Table chuẩn — wrapper trắng + border-radius + shadow + scroll ngang
import React from 'react';
import { Table } from 'antd';

/**
 * @param {Array}     columns     - Cột bảng antd
 * @param {Array}     dataSource  - Dữ liệu
 * @param {string}    rowKey      - Key cho mỗi dòng (mặc định: 'id')
 * @param {boolean}   loading     - Trạng thái loading
 * @param {number}    pageSize    - Số dòng mỗi trang (mặc định: 10)
 * @param {number}    total       - Tổng số dòng (cho label phân trang)
 * @param {string}    totalLabel  - Nhãn đơn vị (VD: "người dùng", "cảnh báo")
 * @param {function}  rowClassName- Custom class cho dòng
 * @param {function}  onRow       - Event handler cho dòng
 * @param {object}    pagination  - Override pagination props
 * @param {object}    style       - Style cho wrapper ngoài
 * @param {...*}      rest        - Các prop khác truyền thẳng vào antd Table
 */
const DataTable = ({
  columns,
  dataSource = [],
  rowKey = 'id',
  loading = false,
  pageSize = 10,
  total,
  totalLabel = 'mục',
  rowClassName,
  onRow,
  pagination,
  style,
  ...rest
}) => {
  const defaultPagination = {
    pageSize,
    showTotal: (t) => `Tổng ${total ?? t} ${totalLabel}`,
    showSizeChanger: false,
    hideOnSinglePage: false,
  };

  return (
    <div className="data-table-wrapper" style={style}>
      <Table
        columns={columns}
        dataSource={dataSource}
        rowKey={rowKey}
        loading={loading}
        scroll={{ x: 'max-content' }}
        pagination={pagination !== undefined ? pagination : defaultPagination}
        rowClassName={rowClassName}
        onRow={onRow}
        {...rest}
      />
    </div>
  );
};

export default DataTable;
