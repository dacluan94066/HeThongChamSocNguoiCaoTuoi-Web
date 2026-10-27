import React from 'react';
import { Button } from 'antd';
import { Link } from 'react-router-dom';
export { ElderlyHomePage, ElderlyHealthPage } from './ElderlyHomeHealth';
export { ElderlySchedulePage } from './ElderlySchedule';
export { ElderlyProfilePage } from './ElderlyPersonalProfile';
export { ElderlySosPage } from './ElderlySos';
export { ElderlyAlertsPage } from './ElderlyAlerts';
export { ElderlyAssistantPage } from './ElderlyAssistant';
export function ElderlyNotFoundPage() { return <section className="elderly-web-card"><h1>Không tìm thấy trang</h1><Link to="/ca-nhan"><Button type="primary">Về Trang chủ của tôi</Button></Link></section>; }
