import React, { useCallback, useEffect } from 'react';
import { useLocation, useOutletContext } from 'react-router-dom';
import { Tag } from 'antd';
import { TeamOutlined, UserOutlined } from '@ant-design/icons';
import api from '../../services/elderlyCareService';
import { useElderlyResource } from '../../hooks/useElderlyResource';
import { getNameInitials } from '../../utils/displayUtils';
import { CareSection, PageIntro, Refresh, ResourceState } from './ElderlyCareUi';
import './ElderlyRelatives.css';

const relativeScopeLabels = { hoSoCoBan: 'Hồ sơ cơ bản', chiSoSucKhoe: 'Chỉ số sức khỏe',
  lichThuoc: 'Lịch thuốc', lichKham: 'Lịch khám', canhBao: 'Cảnh báo & SOS',
  benhNen: 'Bệnh nền', diUng: 'Dị ứng', ketQuaKham: 'Kết quả khám' };

export function ElderlyRelativesPage() {
  const { profile } = useOutletContext(), location = useLocation();
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      document.getElementById('elderly-web-content')?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
    return () => cancelAnimationFrame(frame);
  }, [location.key]);
  return <>
    <PageIntro title="Người thân của tôi" icon={<TeamOutlined />} eyebrow="CARESENIOR · KẾT NỐI GIA ĐÌNH"
      description="Xem Người thân đang được phép theo dõi và phạm vi thông tin bạn đã đồng ý chia sẻ." />
    <ElderlyRelatives profileId={profile.id} />
  </>;
}

export default function ElderlyRelatives({ profileId }) {
  // Reuse foreground/reconnect invalidation for the existing profile-care topic.
  const resource = useElderlyResource(useCallback(signal => api.relatives(profileId, signal), [profileId]), `profile-care:relatives:${profileId}`);
  return <CareSection title="Người thân được phép theo dõi" action={<Refresh onClick={resource.refresh} loading={resource.loading} />}>
    <p>Những Người thân đang được liên kết với hồ sơ của bạn. Quyền theo dõi do Admin quản lý theo sự đồng ý chia sẻ.</p>
    <ResourceState resource={resource} empty="Chưa có Người thân được liên kết. Bạn có thể liên hệ Admin để được hỗ trợ.">
      <div className="elderly-relatives-list">{resource.data?.map(row => {
        const scope = row.phamViChiaSe || {};
        const privateLabels = ['benhNen', 'diUng', 'ketQuaKham'].filter(key => scope[key] !== true).map(key => relativeScopeLabels[key]);
        return <article className="elderly-relative-card" key={row.id}>
          <div className="elderly-relative-identity"><span className="elderly-caregiver-avatar" aria-hidden="true">{getNameInitials(row.hoTen || '') || <UserOutlined />}</span>
            <div><h3>{row.hoTen || 'Chưa cập nhật họ tên'}</h3><p>{row.moiQuanHe || 'Chưa cập nhật quan hệ'} · Đang liên kết</p>
              <p>Số điện thoại: {row.soDienThoai ? <a href={`tel:${String(row.soDienThoai).replace(/[^+\d]/g, '')}`}>{row.soDienThoai}</a> : 'Chưa cập nhật'}</p></div></div>
          <div><strong>Được xem</strong><div className="elderly-relative-scope">{Object.entries(relativeScopeLabels).filter(([key]) => scope[key] === true)
            .map(([key, label]) => <Tag color="green" key={key}>{label}</Tag>)}
            {!Object.keys(relativeScopeLabels).some(key => scope[key] === true) && <span>Hiện chưa có quyền xem dữ liệu.</span>}</div></div>
          <p className="elderly-relative-private">{privateLabels.length ? `Không chia sẻ: ${privateLabels.join(', ')}.` : 'Bệnh nền, dị ứng và kết quả khám đã được đồng ý chia sẻ.'}</p>
        </article>;
      })}</div>
    </ResourceState>
  </CareSection>;
}
