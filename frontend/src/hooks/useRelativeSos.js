import { createElement, useEffect, useMemo, useSyncExternalStore } from 'react';
import { App, Button, Space } from 'antd';
import { useAuth } from '../context/AuthContext';
import { getSocket } from '../services/socketClient';
import api from '../services/relativePortalService';
import { getSosAlarmController, formatSosTime } from '../utils/sosAlarm';
import { createRelativeSosController } from '../utils/relativeSos';

export default function useRelativeSos(onChanged) {
  const { user, hasPermission, authLoading, permissionsLoading } = useAuth();
  const { notification } = App.useApp();
  const userId = user?.userId ?? user?.id;
  const allowed = user?.tenVaiTro === 'NguoiThan' && !authLoading && !permissionsLoading && hasPermission('QLCANHBAO', 'xem');
  const alarm = useMemo(() => getSosAlarmController(), []);
  const manager = useMemo(() => createRelativeSosController({ api, alarm }), [alarm]);
  useEffect(() => manager.setCallbacks({
    onChanged: id => onChanged?.(id),
    onDestroy: id => notification.destroy(`relative-sos-${userId}-${id}`),
    onNotice: sos => notification.error({ key: `relative-sos-${userId}-${sos.id}`, duration: 0,
      title: `SOS khẩn cấp — ${sos.name}`, placement: 'bottomRight',
      description: createElement('div', null, createElement('p', null, 'Người cao tuổi đã gửi SOS.'),
        createElement('p', null, `${formatSosTime(sos.time)} · ${sos.statusLabel}`)),
      actions: createElement(Space, { wrap: true },
        createElement(Button, { onClick: () => manager.openDetail(sos.id) }, 'Xem chi tiết SOS'),
        createElement(Button, { onClick: () => alarm.silence() }, 'Tắt chuông')) }),
  }), [manager, alarm, userId, onChanged, notification]);
  const state = useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getSnapshot);
  const sound = useSyncExternalStore(alarm.subscribe, alarm.getSnapshot, alarm.getSnapshot);
  useEffect(() => {
    const socket = getSocket();
    const connect = () => manager.configure(userId, allowed);
    const disconnect = () => manager.configure(userId, false);
    const received = payload => { void manager.receive(payload); };
    const updated = payload => { void manager.receive(payload, 'canhbao:updated'); };
    const access = payload => manager.accessChanged(payload);
    const check = () => { void manager.revalidate(); };
    manager.configure(userId, allowed && socket.connected);
    socket.on('connect', connect); socket.on('disconnect', disconnect);
    socket.on('canhbao:new', received); socket.on('canhbao:updated', updated); socket.on('relatives:access-changed', access);
    window.addEventListener('focus', check);
    const timer = window.setInterval(check, 15000);
    return () => {
      socket.off('connect', connect); socket.off('disconnect', disconnect);
      socket.off('canhbao:new', received); socket.off('canhbao:updated', updated); socket.off('relatives:access-changed', access);
      window.removeEventListener('focus', check); window.clearInterval(timer);
      manager.clear();
    };
  }, [allowed, userId, manager]);
  return { state, sound, manager, allowed };
}
