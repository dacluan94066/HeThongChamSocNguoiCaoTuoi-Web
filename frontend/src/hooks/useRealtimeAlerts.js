import { createElement, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { App, Button, Space } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getSocket } from '../services/socketClient';
import { formatSosTime, getSosAlarmController, normalizeSos } from '../utils/sosAlarm';

const useRealtimeAlerts = (onAlertsChanged) => {
  const { notification } = App.useApp();
  const navigate = useNavigate();
  const { user, hasPermission, permissionsLoading, authLoading } = useAuth();
  const alarm = useMemo(() => getSosAlarmController(), []);
  const soundState = useSyncExternalStore(alarm.subscribe, alarm.getSnapshot, alarm.getSnapshot);
  const callbackRef = useRef(onAlertsChanged);
  const uiRef = useRef({ navigate, notification });
  const canReceive = Boolean(user?.userId && !permissionsLoading && !authLoading
    && hasPermission('QLCANHBAO', 'xem'));

  useEffect(() => {
    callbackRef.current = onAlertsChanged;
  }, [onAlertsChanged]);
  useEffect(() => { uiRef.current = { navigate, notification }; }, [navigate, notification]);

  useEffect(() => {
    alarm.configure({ userId: user?.userId, authorized: canReceive });
    const socket = getSocket();
    const sosKeys = new Set();

    const displaySos = (sos) => {
      const { navigate, notification } = uiRef.current;
        const key = `care-sos-${user.userId}-${sos.id}`;
        sosKeys.add(key);
        const openAlert = () => {
          notification.destroy(key);
          const highlight = sos.alertId ? `&highlight=${encodeURIComponent(sos.alertId)}` : '';
          navigate(`/canh-bao?tab=sos${highlight}`);
        };
        notification.error({
          key,
          title: `SOS khẩn cấp — ${sos.name}`,
          description: createElement('div', null,
            createElement('p', null, sos.content),
            createElement('p', null, `Thời gian: ${formatSosTime(sos.time)} (giờ Việt Nam)`),
            createElement('strong', null, `Trạng thái: ${sos.statusLabel}`)),
          placement: 'bottomRight', duration: 0,
          actions: createElement(Space, { wrap: true },
            createElement(Button, { danger: true, type: 'primary', onClick: openAlert }, 'Xem chi tiết'),
            createElement(Button, { onClick: () => alarm.silence(),
              title: 'Chỉ tắt âm thanh, không tiếp nhận hoặc xử lý SOS' }, 'Tắt chuông')),
        });
    };
    const handleNewAlert = (alert) => {
      if (!canReceive) return;
      const sos = normalizeSos(alert);
      if (sos) {
        if (!alarm.receive(alert)) { callbackRef.current?.(alert); return; }
        displaySos(sos);
      } else {
        const { notification } = uiRef.current;
        if (alert?.nguonBang === 'CanhBaoKhanCap' || alert?.canhBaoKhanCapId != null) return;
        const elderlyName = alert?.nguoiCaoTuoiTen ? ` của ${alert.nguoiCaoTuoiTen}` : '';
        const emergencyLevel = alert?.loaiCanhBao === 'KhanCap' || alert?.mucDo === 'KHAN_CAP';
        const key = `emergency-alert-${alert?.canhBaoId ?? alert?.id ?? Date.now()}`;
        // Severity alone never starts SOS audio. Ordinary counters/alerts stay on their existing path.
        notification[emergencyLevel ? 'error' : 'warning']({
          key, title: `${emergencyLevel ? 'Cảnh báo khẩn cấp' : 'Có cảnh báo mới'}${elderlyName}`,
          description: alert?.moTa || 'Vui lòng kiểm tra danh sách cảnh báo.',
          placement: 'topRight', duration: emergencyLevel ? 0 : 8,
        });
      }

      callbackRef.current?.(alert);
    };

    const handleUpdatedAlert = (alert) => {
      if (!canReceive) return;
      const updated = alarm.update(alert);
      if (updated) displaySos(updated);
      callbackRef.current?.(alert);
    };
    socket.on('canhbao:new', handleNewAlert);
    socket.on('canhbao:updated', handleUpdatedAlert);
    return () => {
      socket.off('canhbao:new', handleNewAlert);
      socket.off('canhbao:updated', handleUpdatedAlert);
      for (const key of sosKeys) uiRef.current.notification.destroy(key);
      alarm.configure({ userId: null, authorized: false });
    };
  }, [alarm, canReceive, user?.userId]);

  return { soundState, canReceive, enableSound: alarm.enable,
    disableSound: alarm.disable, silenceAlarm: alarm.silence };
};

export default useRealtimeAlerts;
