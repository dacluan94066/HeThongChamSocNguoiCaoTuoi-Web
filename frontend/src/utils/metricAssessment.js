export function metricAssessment(row) {
  if (row?.laBatThuong === true || row?.laBatThuong === 1 || row?.binhThuong === false)
    return { state: 'BAT_THUONG', color: 'orange', status: 'danger', label: 'Ngoài ngưỡng theo dõi' };
  if (row?.trangThaiDanhGia === 'BINH_THUONG')
    return { state: 'BINH_THUONG', color: 'green', status: 'success', label: 'Trong ngưỡng theo dõi' };
  return { state: 'CHUA_CO_NGUONG', color: 'default', status: 'inactive', label: 'Chưa có ngưỡng đánh giá' };
}
