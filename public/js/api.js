/* Cliente HTTP da API + gerenciamento de token de sessão. */
const API = (() => {
  const TOKEN_KEY = 'wm_token';

  const getToken = () => localStorage.getItem(TOKEN_KEY);
  const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
  const clearToken = () => localStorage.removeItem(TOKEN_KEY);

  let onUnauthorized = () => {};

  async function request(path, options = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`/api${path}`, { ...options, headers });
    if (res.status === 401) {
      clearToken();
      onUnauthorized();
      throw new Error('unauthorized');
    }
    const ct = res.headers.get('content-type') || '';
    if (!res.ok) {
      const err = ct.includes('json') ? (await res.json()).error : await res.text();
      throw new Error(err || `HTTP ${res.status}`);
    }
    return ct.includes('json') ? res.json() : res.text();
  }

  return {
    getToken,
    setToken,
    clearToken,
    setUnauthorizedHandler: (fn) => (onUnauthorized = fn),

    login: (username, password) =>
      request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    logout: () => request('/auth/logout', { method: 'POST' }),
    me: () => request('/auth/me'),

    status: () => request('/status'),
    stats: () => request('/stats'),

    waRestart: () => request('/wa/restart', { method: 'POST' }),
    waLogout: () => request('/wa/logout', { method: 'POST' }),
    waSync: () => request('/wa/sync', { method: 'POST' }),
    waLoadHistory: () => request('/wa/load-history', { method: 'POST' }),

    chats: (q = {}) => request(`/chats?${new URLSearchParams(q)}`),
    chat: (id) => request(`/chats/${encodeURIComponent(id)}`),
    chatMessages: (id, q = {}) =>
      request(`/chats/${encodeURIComponent(id)}/messages?${new URLSearchParams(q)}`),
    sendMessage: (id, text, quotedMsgId) =>
      request(`/chats/${encodeURIComponent(id)}/send`, {
        method: 'POST',
        body: JSON.stringify({ text, quotedMsgId })
      }),
    sendMedia: (id, payload) =>
      request(`/chats/${encodeURIComponent(id)}/send-media`, {
        method: 'POST',
        body: JSON.stringify(payload)
      }),
    archiveChat: (id, archived) =>
      request(`/chats/${encodeURIComponent(id)}/archive`, {
        method: 'POST',
        body: JSON.stringify({ archived })
      }),
    muteChat: (id, muted) =>
      request(`/chats/${encodeURIComponent(id)}/mute`, {
        method: 'POST',
        body: JSON.stringify({ muted })
      }),
    clearChat: (id) =>
      request(`/chats/${encodeURIComponent(id)}/clear`, { method: 'POST' }),
    loadChatHistory: (id) =>
      request(`/chats/${encodeURIComponent(id)}/load-history`, { method: 'POST' }),
    bulkChats: (ids, action) =>
      request('/chats/bulk', { method: 'POST', body: JSON.stringify({ ids, action }) }),
    deleteMessage: (id, chatId, scope) =>
      request(`/messages/${encodeURIComponent(id)}/delete`, {
        method: 'POST',
        body: JSON.stringify({ chatId, scope })
      }),
    forwardMessages: (to, ids) =>
      request('/messages/forward', { method: 'POST', body: JSON.stringify({ to, ids }) }),
    exportUrl: (id, format) =>
      `/api/chats/${encodeURIComponent(id)}/export?format=${format}&token=${getToken() || ''}`,

    contacts: (search = '') => request(`/contacts?${new URLSearchParams({ search })}`),
    contact: (id) => request(`/contacts/${encodeURIComponent(id)}`),
    groups: (search = '') => request(`/groups?${new URLSearchParams({ search })}`),
    group: (id) => request(`/groups/${encodeURIComponent(id)}`),

    connections: (minShared = 1) =>
      request(`/connections?${new URLSearchParams({ minShared })}`),
    connectionMembers: (g1, g2) =>
      request(`/connections/members?${new URLSearchParams({ g1, g2 })}`),
    groupConnections: (id) => request(`/connections/group/${encodeURIComponent(id)}`),
    webhookTest: () => request('/webhook/test', { method: 'POST' }),

    searchMessages: (q) => request(`/messages/search?${new URLSearchParams({ q })}`),
    logs: (q = {}) => request(`/logs?${new URLSearchParams(q)}`),

    settings: () => request('/settings'),
    saveSettings: (obj) => request('/settings', { method: 'PUT', body: JSON.stringify(obj) }),
    generateApiKey: () => request('/settings/api-key/generate', { method: 'POST' }),
    revokeApiKey: () => request('/settings/api-key/revoke', { method: 'POST' })
  };
})();
