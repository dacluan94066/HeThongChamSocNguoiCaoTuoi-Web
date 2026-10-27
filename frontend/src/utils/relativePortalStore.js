import { portalError, portalId, PORTAL_SECTIONS } from './relativePortalData.js';

const PAGE_SIZE = 100;
const emptySection = () => ({ status: 'idle', rows: [], more: false, error: null });
const emptySections = () => Object.fromEntries(Object.keys(PORTAL_SECTIONS).map(key => [key, emptySection()]));
const initial = (phase = 'idle', notice = null) => ({ phase, notice, list: [], listMore: false, listLoading: false,
  selectedId: null, profile: null, profileLoading: false, sections: emptySections() });

// This store is session-local and is never serialized. Epochs reject late replies, even if abort is ignored.
export const createRelativePortalStore = (api, sessionKey = null) => {
  let state = initial(), epoch = 0;
  const listeners = new Set(), requests = new Set(), sectionTickets = {};
  const publish = next => { state = next; for (const listener of listeners) listener(); };
  const patch = values => publish({ ...state, ...values });
  const abort = () => { epoch++; for (const controller of requests) controller.abort(); requests.clear(); };
  const request = () => { const controller = new AbortController(); requests.add(controller); return controller; };
  const valid = ticket => ticket === epoch;
  const clear = (phase = 'idle', notice = null) => { abort(); publish(initial(phase, notice)); };
  const fail = error => { const info = portalError(error); clear(info.kind, info.message); };
  const loadSection = async (section, append = false) => {
    if (!Object.hasOwn(PORTAL_SECTIONS, section) || !state.profile || state.phase !== 'ready') return;
    const previous = state.sections[section];
    if (previous.status === 'loading' || append && !previous.more) return;
    const ticket = epoch, serial = (sectionTickets[section] || 0) + 1;
    sectionTickets[section] = serial;
    const profile = state.profile, controller = request(), offset = append ? previous.rows.length : 0;
    patch({ sections: { ...state.sections, [section]: { ...previous, status: 'loading', error: null,
      rows: append ? previous.rows : [] } } });
    try {
      const rows = await api.read(profile.id, section, profile, { limit: PAGE_SIZE, offset }, controller.signal);
      if (!valid(ticket) || serial !== sectionTickets[section]) return;
      patch({ sections: { ...state.sections, [section]: { status: 'ready', rows: append ? [...previous.rows, ...rows] : rows,
        more: rows.length === PAGE_SIZE, error: null } } });
    } catch (error) {
      if (!valid(ticket) || serial !== sectionTickets[section]) return;
      const info = portalError(error);
      if (info.kind !== 'error') fail(error);
      else patch({ sections: { ...state.sections, [section]: { ...emptySection(), status: 'error', error: info.message } } });
    } finally { requests.delete(controller); }
  };
  const select = async value => {
    let id;
    try { id = portalId(value); } catch { clear('denied', 'Mã NCT không hợp lệ. Vui lòng chọn lại từ danh sách được cấp quyền.'); return; }
    if (!state.list.some(profile => profile.id === id)) {
      abort(); patch({ selectedId: null, profile: null, profileLoading: false, sections: emptySections(),
        notice: 'Hồ sơ không có trong danh sách được phép xem đã tải. Hãy chọn NCT trong danh sách hoặc tải thêm.' }); return;
    }
    abort(); const ticket = epoch, controller = request();
    patch({ selectedId: id, profile: null, profileLoading: true, sections: emptySections(), notice: null });
    try {
      const profile = await api.profile(id, controller.signal);
      if (!valid(ticket)) return;
      if (profile.id !== id) throw new Error('Mismatched profile');
      patch({ profile, profileLoading: false });
    } catch (error) { if (valid(ticket)) fail(error); }
    finally { requests.delete(controller); }
  };
  const reload = async requestedId => {
    clear('loading'); const ticket = epoch, controller = request();
    try {
      const list = await api.list({ limit: PAGE_SIZE, offset: 0 }, controller.signal);
      if (!valid(ticket)) return;
      patch({ phase: 'ready', list, listMore: list.length === PAGE_SIZE });
      if (list.length || requestedId) await select(requestedId || list[0].id);
    } catch (error) { if (valid(ticket)) fail(error); }
    finally { requests.delete(controller); }
  };
  const loadMoreList = async () => {
    if (!state.listMore || state.listLoading || state.phase !== 'ready') return;
    const ticket = epoch, controller = request(); patch({ listLoading: true });
    try {
      const list = await api.list({ limit: PAGE_SIZE, offset: state.list.length }, controller.signal);
      if (valid(ticket)) patch({ list: [...state.list, ...list.filter(row => !state.list.some(current => current.id === row.id))],
        listLoading: false, listMore: list.length === PAGE_SIZE });
    } catch (error) { if (valid(ticket)) fail(error); }
    finally { requests.delete(controller); }
  };
  return Object.freeze({ sessionKey, getSnapshot: () => state, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    reload, select, loadSection, loadMoreList, clear });
};
