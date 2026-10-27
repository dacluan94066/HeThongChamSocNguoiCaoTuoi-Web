import client from './axiosClient';
import { webSession } from '../utils/webSession';
import { createGoogleWebApi, acceptGoogleSession } from '../utils/googleWebAuth';
import { disconnectSocket } from './socketClient';
export const googleWebApi = createGoogleWebApi(client, () => webSession.capture());
export const completeGoogleLogin = (result, stamp) => acceptGoogleSession(result, stamp, webSession, disconnectSocket);

let sdkPromise, activeAttempt;
const loadSdk = () => {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://accounts.google.com/gsi/client'; script.async = true;
    let finished = false;
    const finish = failure => {
      if (finished) return; finished = true; clearTimeout(timer);
      if (failure || !window.google?.accounts?.id) { script.remove(); sdkPromise = null; reject(Error('Không tải được Google Identity Services. Bạn vẫn có thể dùng mật khẩu.')); }
      else resolve(window.google.accounts.id);
    };
    const timer = setTimeout(() => finish(true), 15000);
    script.onload = () => finish(false); script.onerror = () => finish(true); document.head.appendChild(script);
  });
  return sdkPromise;
};

// One owner for GIS's global initialize/callback. No One Tap or auto sign-in.
export async function mountGoogleWebButton(element, challenge, callback, current = () => true, signal) {
  const attempt = Symbol('google-attempt'); activeAttempt = attempt;
  let handler = callback, check = current, sdk, cleaned = false;
  callback = current = null;
  const valid = () => !cleaned && activeAttempt === attempt && Boolean(check?.());
  const cleanup = () => {
    if (cleaned) return; cleaned = true;
    // GIS may retain its last callback. Release React handlers/checks/DOM refs,
    // not merely ignore them, so old form/session memory can be collected.
    handler = check = null;
    signal?.removeEventListener('abort', cleanup); signal = null;
    if (activeAttempt === attempt) { activeAttempt = null; sdk?.cancel(); sdk?.disableAutoSelect(); element?.replaceChildren(); }
    element = null;
  };
  signal?.addEventListener('abort', cleanup, { once: true });
  if (signal?.aborted) { cleanup(); return cleanup; }
  try {
    sdk = await loadSdk();
    if (!valid()) { cleanup(); return cleanup; }
    sdk.initialize({ client_id: challenge.clientId, nonce: challenge.nonce, auto_select: false, ux_mode: 'popup',
      callback: response => { if (valid()) handler?.(response.credential); } });
    sdk.renderButton(element, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', locale: 'vi',
      width: Math.min(400, Math.max(200, Math.floor(element.clientWidth))) });
    return cleanup;
  } catch (error) { cleanup(); throw error; }
}
