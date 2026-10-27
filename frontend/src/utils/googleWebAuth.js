const prefix = '/auth/google/web';
const clientIdValid = value => typeof value === 'string' && /^\d+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i.test(value);
export function createGoogleWebApi(client, capture) {
  const config = (signal, stamp = capture()) => ({ signal, withCredentials: true, googleWebRequest: true, webSessionStamp: stamp, timeout: 30000 });
  const data = response => {
    if (response.data?.success !== true || !response.data.data) throw Error('Phản hồi xác thực Google không hợp lệ.');
    return response.data.data;
  };
  const proof = (challenge, credential) => {
    if (!/^[a-zA-Z0-9_-]{32}$/.test(challenge?.challengeId || '') || typeof credential !== 'string' || !credential || credential.length > 10000) throw Error('Phiên Google không hợp lệ. Hãy bắt đầu lại.');
    return { challengeId: challenge.challengeId, idToken: credential };
  };
  return {
    async config(signal) { const result = data(await client.get(`${prefix}/config`, config(signal))); if (!clientIdValid(result.clientId)) throw Error('Google Web chưa được cấu hình.'); return result; },
    async status(signal) { const result = data(await client.get(`${prefix}/status`, config(signal))); if (typeof result.linked !== 'boolean') throw Error('Chưa xác định được trạng thái liên kết.'); return result; },
    async challenge(mode, signal, stamp) {
      if (!['login', 'link'].includes(mode)) throw Error('Thao tác Google không hợp lệ.');
      const result = data(await client.post(`${prefix}/${mode}/challenge`, {}, config(signal, stamp)));
      if (!clientIdValid(result.clientId) || !/^[a-zA-Z0-9_-]{32}$/.test(result.challengeId || '') || !/^[a-zA-Z0-9_-]{43}$/.test(result.nonce || '') || !Number.isFinite(Date.parse(result.expiresAt))) throw Error('Phiên Google không hợp lệ.');
      return result;
    },
    async login(challenge, credential, signal, stamp) {
      const result = data(await client.post(`${prefix}/login`, proof(challenge, credential), config(signal, stamp)));
      if (!result.token || typeof result.token !== 'string' || result.user?.tenVaiTro !== 'NguoiCaoTuoi' || !Number.isSafeInteger(result.user.userId) || result.user.userId < 1) throw Error('Google không trả về tài khoản Người cao tuổi hợp lệ.');
      return result;
    },
    async link(challenge, credential, currentPassword, signal, stamp) {
      if (typeof currentPassword !== 'string' || !currentPassword) throw Error('Vui lòng nhập mật khẩu CareSenior hiện tại.');
      const result = data(await client.post(`${prefix}/link`, { ...proof(challenge, credential), currentPassword }, config(signal, stamp)));
      if (result.linked !== true) throw Error('Chưa xác nhận được kết quả liên kết Google. Hãy kiểm tra trạng thái.');
      return { linked: true };
    },
  };
}

export function acceptGoogleSession(result, stamp, session, disconnect = () => {}) {
  if (!session.isCurrent(stamp)) throw Object.assign(Error('Phiên đăng nhập đã thay đổi.'), { code: 'ERR_CANCELED' });
  if (!result.token || result.user?.tenVaiTro !== 'NguoiCaoTuoi') throw Error('Tài khoản Google Web không hợp lệ.');
  disconnect(); session.replace(result.token, result.user, stamp);
}
