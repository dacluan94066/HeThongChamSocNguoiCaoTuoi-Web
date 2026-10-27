import { useEffect, useMemo, useSyncExternalStore } from 'react';
import api from '../services/elderlyWorkspaceService';
import { createElderlyWorkspaceStore } from '../utils/elderlyWorkspace';
import { webSession } from '../utils/webSession';

export default function useElderlyWorkspace(userId) {
  const store = useMemo(() => {
    const stamp = webSession.capture();
    return createElderlyWorkspaceStore(api, userId, () => webSession.isCurrent(stamp));
  }, [userId]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => { void store.check(); return () => store.dispose(); }, [store]);
  return { state, store };
}
