import { createElement, useEffect, useRef } from 'react';
import { App, Button } from 'antd';
import { useNavigate } from 'react-router-dom';
import { getSocket } from '../services/socketClient';

const useRealtimeAlerts = (onAlertsChanged) => {
  const { notification } = App.useApp();
  const navigate = useNavigate();
  const callbackRef = useRef(onAlertsChanged);

  useEffect(() => {
    callbackRef.current = onAlertsChanged;
  }, [onAlertsChanged]);

  useEffect(() => {
    const socket = getSocket();

    const handleNewAlert = (alert) => {
      const isEmergency = alert?.loaiCanhBao === 'KhanCap'
        || alert?.mucDo === 'KHAN_CAP';
      const elderlyName = alert?.nguoiCaoTuoiTen
        ? ` của ${alert.nguoiCaoTuoiTen}`
        : '';
      const alertId = alert?.canhBaoId ?? alert?.id;
      const key = `emergency-alert-${alertId || Date.now()}`;
      const openAlert = () => {
        notification.destroy(key);
        if (alertId) navigate(`/canh-bao?highlight=${encodeURIComponent(alertId)}`);
        else navigate('/canh-bao');
      };

      if (isEmergency) {
        notification.error({
          key,
          message: `Cảnh báo SOS khẩn cấp${elderlyName}`,
          description: alert?.moTa || 'Người cao tuổi vừa gửi yêu cầu hỗ trợ khẩn cấp.',
          placement: 'topRight',
          duration: 0,
          onClick: openAlert,
          btn: createElement(
            Button,
            {
              danger: true,
              type: 'primary',
              size: 'small',
              onClick: (event) => {
                event.stopPropagation();
                openAlert();
              },
            },
            'Xem chi tiết',
          ),
        });
      } else {
        notification.warning({
          key,
          message: `Có cảnh báo mới${elderlyName}`,
          description: alert?.moTa || 'Vui lòng kiểm tra danh sách cảnh báo.',
          placement: 'topRight',
          duration: 8,
        });
      }

      callbackRef.current?.(alert);
    };

    const handleUpdatedAlert = (alert) => callbackRef.current?.(alert);
    socket.on('canhbao:new', handleNewAlert);
    socket.on('canhbao:updated', handleUpdatedAlert);
    return () => {
      socket.off('canhbao:new', handleNewAlert);
      socket.off('canhbao:updated', handleUpdatedAlert);
    };
  }, [navigate, notification]);
};

export default useRealtimeAlerts;
