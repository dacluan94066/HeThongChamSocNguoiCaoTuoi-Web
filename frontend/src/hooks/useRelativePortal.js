import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useAuth } from '../context/AuthContext';
import portalApi from '../services/relativePortalService';
import { getSocket } from '../services/socketClient';
import { createRelativePortalStore } from '../utils/relativePortalStore';

export default function useRelativePortal(requestedId) {
  const { user } = useAuth();
  const userId = user?.userId ?? user?.id;
  const store = useMemo(() => createRelativePortalStore(portalApi, userId), [userId]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    let active = true;
    const refresh = () => { if (active && document.visibilityState !== 'hidden') void store.reload(requestedId); };
    const visibility = () => { if (document.visibilityState === 'hidden') store.clear('suspended'); else refresh(); };
    const disconnected = () => store.clear('offline', 'Kết nối cập nhật quyền bị gián đoạn. Dữ liệu đã được đóng; hãy tải lại khi kết nối ổn định.');
    const socket = getSocket();
    // Access invalidation only. No SOS listener, audio, new room, or acknowledgement.
    socket.on('relatives:access-changed', refresh);
    socket.on('connect', refresh);
    socket.on('disconnect', disconnected);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visibility);
    const timer = window.setInterval(refresh, 60000);
    Promise.resolve().then(() => { if (active) refresh(); });
    return () => {
      active = false; window.clearInterval(timer);
      socket.off('relatives:access-changed', refresh); socket.off('connect', refresh); socket.off('disconnect', disconnected);
      window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visibility);
      store.clear();
    };
  }, [store, requestedId]);
  return { state, store };
}
