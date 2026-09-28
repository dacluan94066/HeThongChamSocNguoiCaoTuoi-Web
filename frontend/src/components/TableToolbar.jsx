// src/components/TableToolbar.jsx
// Toolbar chuẩn phía trên bảng — ô tìm kiếm trái, nút action phải
import React from 'react';
import { Input, Space } from 'antd';
import { SearchOutlined } from '@ant-design/icons';

/**
 * @param {string}    search              - Giá trị tìm kiếm hiện tại
 * @param {function}  onSearch            - Callback khi search thay đổi (nhận value)
 * @param {string}    searchPlaceholder   - Placeholder ô tìm kiếm
 * @param {number}    searchWidth         - Chiều rộng ô search (default: 280)
 * @param {ReactNode[]} filters           - Mảng các Select/filter khác (hiện sau search)
 * @param {ReactNode} extra               - Nội dung bên phải (VD: nút Thêm mới)
 * @param {number}    count               - Số lượng kết quả
 * @param {string}    countLabel          - Nhãn đơn vị (VD: "người dùng", "cảnh báo")
 * @param {object}    style               - Style cho wrapper
 */
const TableToolbar = ({
  search,
  onSearch,
  searchPlaceholder = 'Tìm kiếm...',
  searchWidth = 280,
  filters,
  extra,
  count,
  countLabel = 'kết quả',
  style,
}) => {
  return (
    <div className="table-toolbar" style={style}>
      {/* Bên trái: search + filters */}
      <div className="table-toolbar-left">
        {onSearch !== undefined && (
          <Input
            placeholder={searchPlaceholder}
            prefix={<SearchOutlined style={{ color: '#7A93A3' }} />}
            style={{ width: searchWidth }}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            allowClear
            className="toolbar-search-input"
          />
        )}
        {filters && (
          <Space wrap>
            {Array.isArray(filters) ? filters : [filters]}
          </Space>
        )}
      </div>

      {/* Bên phải: count + action */}
      <div className="table-toolbar-right">
        {count !== undefined && (
          <span className="toolbar-count">
            {count} {countLabel}
          </span>
        )}
        {extra}
      </div>
    </div>
  );
};

export default TableToolbar;
