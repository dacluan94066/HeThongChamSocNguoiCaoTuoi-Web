const PROFILE_FIELDS = ['hoTen', 'ngaySinh', 'gioiTinh', 'cccd', 'soDienThoai', 'diaChi', 'nhomMau', 'benhNen', 'diUng'];
export const buildOwnProfile = values => Object.fromEntries(PROFILE_FIELDS.filter(key => values[key] != null)
  .map(key => [key, key === 'ngaySinh' && values[key]?.format ? values[key].format('YYYY-MM-DD') : values[key]]));

export function createElderlyWorkspaceApi(client) {
  return {
    getOwn: async signal => (await client.get('/elderly/me', { signal, elderlyPortalRequest: true })).data?.data,
    completeOwn: async (values, signal) => (await client.post('/elderly/me', buildOwnProfile(values), { signal, elderlyPortalRequest: true })).data?.data,
  };
}

export function createElderlyWorkspaceStore(api, ownerId, sessionCurrent = () => true) {
  let state = { phase: 'checking', profile: null, notice: '', fieldCode: null };
  let generation = 0, controller;
  const listeners = new Set();
  const publish = update => { state = { ...state, ...update }; for (const listener of listeners) listener(); };
  const begin = () => { controller?.abort(); controller = new AbortController(); return { sequence: ++generation, signal: controller.signal }; };
  const current = request => request.sequence === generation && !request.signal.aborted && sessionCurrent();
  const missing = error => error.response?.status === 404 && error.response?.data?.errorCode === 'ELDERLY_PROFILE_NOT_FOUND';
  const verify = profile => {
    if (!profile || !Number.isInteger(Number(profile.id)) || Number(profile.id) <= 0 || Number(profile.userId) !== Number(ownerId)) {
      throw new Error('Thông tin hồ sơ không khớp tài khoản đăng nhập. Vui lòng tải lại hoặc liên hệ quản trị viên.');
    }
    return profile;
  };
  const failed = (error, request, duringSave = false) => {
    if (!current(request) || error.code === 'ERR_CANCELED') return;
    const status = error.response?.status;
    publish({ phase: status === 401 ? 'expired' : status === 403 ? 'denied' : duringSave && status === 422 ? 'missing' : 'error',
      profile: null, fieldCode: error.response?.data?.errorCode || null,
      notice: error.response?.data?.message || error.message || 'Không thể tải hồ sơ. Kiểm tra kết nối và thử lại.' });
  };
  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async check() {
      const request = begin(); publish({ phase: 'checking', profile: null, notice: '', fieldCode: null });
      try {
        const profile = verify(await api.getOwn(request.signal));
        if (current(request)) publish({ phase: 'ready', profile });
      } catch (error) {
        if (current(request) && missing(error)) publish({ phase: 'missing', notice: '', profile: null });
        else failed(error, request);
      }
    },
    async complete(values) {
      if (state.phase !== 'missing' || !sessionCurrent()) return;
      const request = begin(); publish({ phase: 'saving', notice: '', fieldCode: null });
      try {
        // Read before a manual retry: a timed-out previous POST may have committed.
        // The existing server transaction also serializes Web/Mobile completion.
        let existing;
        try { existing = verify(await api.getOwn(request.signal)); }
        catch (error) { if (!missing(error)) throw error; }
        if (!current(request)) return;
        const profile = existing || verify(await api.completeOwn(buildOwnProfile(values), request.signal));
        if (current(request)) publish({ phase: 'ready', profile });
      } catch (error) { failed(error, request, true); }
    },
    dispose() { generation++; controller?.abort(); publish({ phase: 'expired', profile: null, notice: '' }); },
  };
}
