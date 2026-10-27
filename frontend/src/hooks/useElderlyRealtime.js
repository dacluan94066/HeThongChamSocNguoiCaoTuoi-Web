import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSocket } from '../services/socketClient';
import { subscribeElderlyRealtime } from '../utils/elderlyRealtime';
import { webSession } from '../utils/webSession';

export default function useElderlyRealtime({ userId, profileId, enabled, canAlerts }) {
  const scope = `${userId}:${profileId}`, bridge = useRef(null);
  const [state, setState] = useState({ scope, connection: 'connecting', revisions: {} });
  useEffect(() => {
    if (!enabled) return;
    const stamp = webSession.capture();
    const instance = subscribeElderlyRealtime({ socket: getSocket(), browser: window, document, userId, profileId, canAlerts,
      current: () => webSession.isCurrent(stamp),
      onChange: topics => setState(previous => {
        const revisions = previous.scope === scope ? { ...previous.revisions } : {};
        for (const topic of topics) revisions[topic] = (revisions[topic] || 0) + 1;
        return { scope, connection: previous.scope === scope ? previous.connection : 'connecting', revisions };
      }),
      onConnection: connection => setState(previous => ({ scope, connection, revisions: previous.scope === scope ? previous.revisions : {} })),
    });
    bridge.current = instance;
    return () => { instance.dispose(); if (bridge.current === instance) bridge.current = null; };
  }, [scope, enabled, canAlerts, userId, profileId]);
  const refreshLive = useCallback(() => bridge.current?.refresh(), []);
  return useMemo(() => ({ ...(state.scope === scope ? state : { scope, revisions: {}, connection: 'connecting' }), refreshLive }), [state, scope, refreshLive]);
}
