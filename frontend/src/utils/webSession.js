// Client-side revision only; it does not change JWTs or revoke Mobile sessions.
export const sessionChangedError = () => Object.assign(new Error('Phiên đăng nhập đã thay đổi. Vui lòng thử lại.'), { code: 'ERR_CANCELED' });

export function createWebSession(storage, events) {
  let revision = 0;
  const listeners = new Set();
  const capture = () => ({ revision, token: storage.getItem('token') });
  const isCurrent = stamp => Boolean(stamp && stamp.revision === revision && stamp.token === storage.getItem('token'));
  const notify = () => { revision++; for (const listener of listeners) listener(); };
  const onStorage = event => {
    if (event.key === 'token' || event.key === 'user' || event.key === null) notify();
  };
  return {
    capture, isCurrent,
    clear(stamp) {
      if (stamp && !isCurrent(stamp)) return false;
      storage.removeItem('token'); storage.removeItem('user'); notify(); return true;
    },
    replace(token, user, stamp) {
      if (stamp && !isCurrent(stamp)) throw sessionChangedError();
      storage.setItem('token', token); storage.setItem('user', JSON.stringify(user)); notify();
    },
    updateUser(user, stamp) {
      if (!isCurrent(stamp)) return false;
      storage.setItem('user', JSON.stringify(user)); return true;
    },
    subscribe(listener) {
      if (!listeners.size) events?.addEventListener('storage', onStorage);
      listeners.add(listener);
      return () => { listeners.delete(listener); if (!listeners.size) events?.removeEventListener('storage', onStorage); };
    },
  };
}

export const webSession = createWebSession({
  getItem: key => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: key => window.localStorage.removeItem(key),
}, typeof window === 'undefined' ? null : window);
