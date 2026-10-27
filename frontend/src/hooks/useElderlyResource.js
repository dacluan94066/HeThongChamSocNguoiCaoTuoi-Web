import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import ElderlyLiveContext from '../context/ElderlyLiveContext';
import { resourceTopic } from '../utils/elderlyRealtime';
import { webSession } from '../utils/webSession';
import { createSingleFlight, ownError } from '../utils/elderlyCare';

// Memory-only data, cleared immediately on a new selection. Axios also rejects
// responses from a replaced Web session. Abort/generation covers filter races.
export function useElderlyResource(load, key) {
  const [revision, setRevision] = useState(0);
  const live = useContext(ElderlyLiveContext);
  const requestKey = `${key}:${revision}:${live.revisions[resourceTopic(key)] || 0}`;
  const [result, setResult] = useState({ key: requestKey, loading: true, data: null, error: '' });
  useEffect(() => {
    const controller = new AbortController(), stamp = webSession.capture();
    let current = true;
    Promise.resolve().then(() => {
      if (!current || !webSession.isCurrent(stamp)) return;
      setResult({ key: requestKey, loading: true, data: null, error: '' });
      return load(controller.signal);
    }).then(data => {
      if (current && webSession.isCurrent(stamp)) setResult({ key: requestKey, loading: false, data, error: '' });
    }).catch(error => {
      if (current && webSession.isCurrent(stamp) && error.code !== 'ERR_CANCELED') setResult({ key: requestKey, loading: false, data: null, error: ownError(error) });
    });
    return () => { current = false; controller.abort(); };
  }, [load, requestKey]);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  return { ...(result.key === requestKey ? result : { loading: true, data: null, error: '' }), refresh };
}

export function useElderlyMutation() {
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(null);
  const flight = useRef(createSingleFlight()), life = useRef(null);
  const ownerSession = useRef(webSession.capture());
  useEffect(() => {
    const controller = new AbortController(); life.current = controller;
    return () => controller.abort();
  }, []);
  const run = async (work, success) => flight.current(async () => {
    const controller = life.current, stamp = ownerSession.current;
    if (!controller || controller.signal.aborted || !webSession.isCurrent(stamp)) return;
    setBusy(true); setNotice(null);
    try {
      const data = await work(controller.signal);
      if (!controller.signal.aborted && webSession.isCurrent(stamp)) {
        setNotice({ type: 'success', text: 'Đã lưu thành công theo xác nhận từ máy chủ.' });
        success?.(data);
      }
    } catch (error) {
      if (!controller.signal.aborted && webSession.isCurrent(stamp) && error.code !== 'ERR_CANCELED') setNotice({ type: 'error', text: ownError(error) });
    } finally { if (!controller.signal.aborted && webSession.isCurrent(stamp)) setBusy(false); }
  });
  return { busy, notice, run, clearNotice: () => setNotice(null) };
}
