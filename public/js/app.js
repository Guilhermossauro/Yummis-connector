/* whats-middle — dashboard SPA */
(() => {
  'use strict';

  // ============================ helpers ============================
  const $ = (sel) => document.querySelector(sel);
  const view = () => $('#view');

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function initials(name) {
    if (!name) return '?';
    const clean = String(name).replace(/[^\p{L}\p{N} ]/gu, '').trim();
    if (!clean) return '#';
    const parts = clean.split(/\s+/);
    return ((parts[0][0] || '') + (parts[1] ? parts[1][0] : '')).toUpperCase();
  }

  function avatar(path, name, klass = '') {
    if (path) return `<img class="avatar ${klass}" src="${esc(path)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'avatar ${klass}',textContent:'${initials(name)}'}))" />`;
    return `<div class="avatar ${klass}">${esc(initials(name))}</div>`;
  }

  function fmtTime(ms) {
    return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  function fmtDate(ms) {
    return new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  function fmtDateTime(ms) {
    return `${fmtDate(ms)} ${fmtTime(ms)}`;
  }
  function timeAgo(ms) {
    if (!ms) return '';
    const diff = Date.now() - ms;
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'agora';
    if (m < 60) return `${m}min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d`;
    return fmtDate(ms);
  }

  const MEDIA_ICON = {
    image: '📷', video: '🎥', ptt: '🎤', audio: '🎵',
    document: '📄', sticker: '🌟', location: '📍', vcard: '👤'
  };
  const MEDIA_LABEL = {
    image: 'Imagem', video: 'Vídeo', ptt: 'Áudio', audio: 'Áudio',
    document: 'Documento', sticker: 'Figurinha', location: 'Localização', vcard: 'Contato'
  };

  function toast(msg, kind = 'info') {
    const colors = { info: 'bg-ink-500', ok: 'bg-brand text-ink-900', err: 'bg-red-600' };
    const t = document.createElement('div');
    t.className = `fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-lg shadow-xl text-sm ${colors[kind] || colors.info} fade-in`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  function loading() {
    view().innerHTML = `<div class="flex items-center gap-3 text-slate-500"><span class="spinner"></span> Carregando…</div>`;
  }

  // Overlay de carregamento (ex.: logo após o QR ser escaneado).
  function flashConnecting(msg = 'Conectando ao WhatsApp…') {
    let ov = document.getElementById('connecting-overlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'connecting-overlay';
      ov.className =
        'fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-ink-900/85 backdrop-blur fade-in';
      document.body.appendChild(ov);
    }
    ov.innerHTML = `<span class="spinner" style="width:46px;height:46px;border-width:4px"></span><p class="text-slate-300 text-sm">${msg}</p>`;
  }
  function clearConnecting() {
    const ov = document.getElementById('connecting-overlay');
    if (ov) ov.remove();
  }

  // Modal de confirmação reutilizável -> Promise<boolean>.
  function confirmModal({ title = 'Confirmar', message = '', confirmText = 'Confirmar', danger = false } = {}) {
    return new Promise((resolve) => {
      const ov = document.createElement('div');
      ov.className = 'fixed inset-0 z-50 flex items-center justify-center bg-ink-900/80 backdrop-blur fade-in';
      ov.innerHTML = `
        <div class="bg-ink-700 rounded-2xl p-6 w-full max-w-sm border border-ink-500 shadow-2xl">
          <h3 class="text-white font-semibold mb-2">${esc(title)}</h3>
          <p class="text-sm text-slate-400 mb-5">${esc(message)}</p>
          <div class="flex justify-end gap-2">
            <button data-x="cancel" class="px-3 py-2 rounded-lg bg-ink-600 hover:bg-ink-500 text-sm">Cancelar</button>
            <button data-x="ok" class="px-3 py-2 rounded-lg ${danger ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-brand text-ink-900'} text-sm font-medium">${esc(confirmText)}</button>
          </div>
        </div>`;
      document.body.appendChild(ov);
      const done = (v) => { ov.remove(); resolve(v); };
      ov.addEventListener('click', (e) => { if (e.target === ov) done(false); });
      ov.querySelector('[data-x="cancel"]').addEventListener('click', () => done(false));
      ov.querySelector('[data-x="ok"]').addEventListener('click', () => done(true));
    });
  }

  // Menu de contexto (clique direito). items: {label, icon, danger, sep, onClick}.
  function closeContextMenu() {
    const m = document.getElementById('ctx-menu');
    if (m) m.remove();
  }
  function showContextMenu(x, y, items) {
    closeContextMenu();
    const menu = document.createElement('div');
    menu.id = 'ctx-menu';
    menu.className = 'fixed z-50 bg-ink-700 border border-ink-500 rounded-lg shadow-xl py-1 text-sm min-w-[190px] fade-in';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.innerHTML = items
      .map((it, i) => it.sep
        ? '<div class="border-t border-ink-600 my-1"></div>'
        : `<button data-i="${i}" class="w-full text-left px-3 py-2 hover:bg-ink-600 ${it.danger ? 'text-red-400' : 'text-slate-200'}">${it.icon ? it.icon + ' ' : ''}${esc(it.label)}</button>`)
      .join('');
    document.body.appendChild(menu);
    const r = menu.getBoundingClientRect();
    if (r.right > innerWidth) menu.style.left = innerWidth - r.width - 8 + 'px';
    if (r.bottom > innerHeight) menu.style.top = innerHeight - r.height - 8 + 'px';
    menu.querySelectorAll('button[data-i]').forEach((b) => {
      b.addEventListener('click', () => { const it = items[+b.dataset.i]; closeContextMenu(); it.onClick && it.onClick(); });
    });
  }
  document.addEventListener('click', closeContextMenu);
  document.addEventListener('scroll', closeContextMenu, true);

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  // ============================ status ============================
  const STATUS = {
    connected: { label: 'Conectado', dot: 'bg-brand', pill: 'bg-brand/15 text-brand' },
    qr: { label: 'Aguardando QR', dot: 'bg-yellow-400', pill: 'bg-yellow-400/15 text-yellow-300' },
    starting: { label: 'Iniciando…', dot: 'bg-blue-400', pill: 'bg-blue-400/15 text-blue-300' },
    authenticated: { label: 'Autenticando…', dot: 'bg-blue-400', pill: 'bg-blue-400/15 text-blue-300' },
    disconnected: { label: 'Desconectado', dot: 'bg-red-500', pill: 'bg-red-500/15 text-red-400' },
    conflict: { label: 'Conflito de sessão', dot: 'bg-orange-500', pill: 'bg-orange-500/15 text-orange-400' }
  };

  let lastStatus = null;
  let prevConnStatus = null;
  let prevQr = null;
  // Intervalo pertencente à página atual (limpo ao trocar de tela).
  let pageInterval = null;
  // Cancela uma gravação de áudio em andamento ao trocar de tela.
  let activeRecordingStop = null;
  async function refreshStatus() {
    try {
      const s = await API.status();
      lastStatus = s;
      const info = STATUS[s.status] || STATUS.disconnected;
      $('#conn-dot').className = `w-2.5 h-2.5 rounded-full ${info.dot}`;
      $('#conn-label').textContent = info.label;
      $('#conn-number').textContent = s.me && s.me.number ? `+${s.me.number}` : '';
      const pill = $('#status-pill');
      pill.className = `px-3 py-1 rounded-full text-xs ${info.pill}`;
      pill.textContent = info.label;

      // Telas que dependem do status: dashboard e configurações.
      const { segs } = parseHash();
      const onStatusPage = segs.length === 0 || segs[0] === 'settings';
      const statusChanged = prevConnStatus !== s.status;
      const qrChanged = prevQr !== s.qr;

      // Efeito de carregamento assim que o QR é escaneado (qr -> autenticando).
      if (prevConnStatus === 'qr' && s.status !== 'qr' && s.status !== 'disconnected') {
        flashConnecting();
      }
      if (s.status === 'connected' || s.status === 'disconnected') clearConnecting();

      if (onStatusPage && statusChanged) {
        // Transição de estado (ex.: qr -> conectado): re-renderiza uma única vez.
        route();
      } else if (onStatusPage && qrChanged && s.qr) {
        // QR foi atualizado pelo WhatsApp: troca só a imagem, sem re-render.
        document.querySelectorAll('[data-qr-img]').forEach((img) => (img.src = s.qr));
      }
      prevConnStatus = s.status;
      prevQr = s.qr;
    } catch (e) { /* silencioso */ }
  }

  // ============================ navegação ============================
  const NAV = [
    { route: '#/', icon: '📊', label: 'Visão geral' },
    { route: '#/chats', icon: '💬', label: 'Conversas' },
    { route: '#/contacts', icon: '👤', label: 'Contatos' },
    { route: '#/groups', icon: '👥', label: 'Grupos' },
    { route: '#/connections', icon: '🔗', label: 'Connections' },
    { route: '#/search', icon: '🔍', label: 'Buscar' },
    { route: '#/logs', icon: '📜', label: 'Logs' },
    { route: '#/settings', icon: '⚙️', label: 'Configurações' },
    { route: '#/docs', icon: '📚', label: 'Documentação' }
  ];

  function renderNav() {
    $('#nav').innerHTML = NAV.map((n) =>
      `<a href="${n.route}" class="nav-item" data-route="${n.route}"><span class="ic">${n.icon}</span>${n.label}</a>`
    ).join('');
  }

  function setActiveNav(base) {
    document.querySelectorAll('.nav-item').forEach((a) => {
      a.classList.toggle('active', a.dataset.route === base);
    });
    const item = NAV.find((n) => n.route === base);
    $('#page-title').textContent = item ? item.label : 'whats-middle';
  }

  // ============================ páginas ============================

  // ---------- Visão geral ----------
  let chart = null;
  async function pageDashboard() {
    loading();
    const s = await API.stats();
    const status = lastStatus || (await API.status());
    const cards = [
      { label: 'Mensagens', value: s.totalMessages, icon: '💬' },
      { label: 'Hoje', value: s.messagesToday, icon: '📅' },
      { label: 'Conversas', value: s.totalChats, icon: '🗂️' },
      { label: 'Contatos', value: s.totalContacts, icon: '👤' },
      { label: 'Grupos', value: s.totalGroups, icon: '👥' }
    ];

    const connInfo = STATUS[status.status] || STATUS.disconnected;
    const qrBlock = status.status === 'qr' && status.qr
      ? `<div class="card p-5 flex flex-col items-center text-center">
           <p class="text-sm text-slate-400 mb-3">Escaneie para conectar o WhatsApp</p>
           <img data-qr-img src="${status.qr}" class="w-52 h-52 rounded-lg bg-white p-2" />
         </div>`
      : '';

    view().innerHTML = `
      <div class="fade-in space-y-6">
        <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
          ${cards.map((c) => `
            <div class="card p-4">
              <div class="text-2xl mb-1">${c.icon}</div>
              <div class="text-2xl font-bold text-white">${c.value.toLocaleString('pt-BR')}</div>
              <div class="text-xs text-slate-500">${c.label}</div>
            </div>`).join('')}
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="card p-5 lg:col-span-2">
            <h3 class="text-sm font-semibold text-slate-300 mb-4">Mensagens por dia (14 dias)</h3>
            <canvas id="chart-perday" height="110"></canvas>
          </div>
          <div class="space-y-6">
            <div class="card p-5">
              <div class="flex items-center gap-2 mb-2">
                <span class="w-2.5 h-2.5 rounded-full ${connInfo.dot}"></span>
                <span class="text-sm font-semibold text-white">WhatsApp · ${connInfo.label}</span>
              </div>
              <p class="text-xs text-slate-500">${status.me && status.me.number ? '+' + status.me.number : 'Não pareado'}</p>
            </div>
            ${qrBlock}
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="card p-5">
            <h3 class="text-sm font-semibold text-slate-300 mb-4">Conversas mais ativas</h3>
            <div class="space-y-2">
              ${s.topChats.length ? s.topChats.map((c) => `
                <a href="#/chats/${encodeURIComponent(c.id)}" class="row flex items-center gap-3 p-2 rounded-lg">
                  ${avatar(c.avatar_path, c.title, 'avatar-sm')}
                  <span class="flex-1 truncate text-sm">${esc(c.title)}</span>
                  <span class="text-xs text-slate-500">${c.message_count} msgs</span>
                </a>`).join('') : '<p class="text-sm text-slate-500">Sem dados ainda.</p>'}
            </div>
          </div>
          <div class="card p-5">
            <h3 class="text-sm font-semibold text-slate-300 mb-4">Tipos de mensagem</h3>
            <div class="space-y-2">
              ${s.byType.map((t) => `
                <div class="flex items-center gap-3 text-sm">
                  <span class="w-6">${MEDIA_ICON[t.type] || '📝'}</span>
                  <span class="flex-1 capitalize">${esc(t.type)}</span>
                  <span class="text-slate-400">${t.n.toLocaleString('pt-BR')}</span>
                </div>`).join('')}
            </div>
          </div>
        </div>
      </div>`;

    // gráfico
    const ctx = $('#chart-perday');
    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: s.perDay.map((d) => d.day.slice(5)),
        datasets: [{
          data: s.perDay.map((d) => d.n),
          borderColor: '#25D366',
          backgroundColor: 'rgba(37,211,102,.12)',
          fill: true, tension: .35, pointRadius: 3, pointBackgroundColor: '#25D366'
        }]
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: '#1f2c34' }, ticks: { color: '#64748b' } },
          y: { grid: { color: '#1f2c34' }, ticks: { color: '#64748b' }, beginAtZero: true }
        }
      }
    });
  }

  // ---------- Conversas ----------
  async function pageChats() {
    loading();
    const st = { selectMode: false, selected: new Set(), active: [], archived: [], search: '', type: '' };

    async function fetchData() {
      st.active = await API.chats({ archived: 'active', search: st.search, type: st.type });
      st.archived = await API.chats({ archived: 'archived', search: st.search, type: st.type });
    }
    await fetchData();

    function chatRowHtml(c) {
      const sel = st.selected.has(c.id);
      return `<div class="row flex items-center gap-3 px-4 py-3 chat-row ${sel ? 'active-row' : ''}" data-id="${esc(c.id)}">
        <input type="checkbox" class="chat-check accent-brand w-4 h-4 pointer-events-none" ${sel ? 'checked' : ''} />
        ${avatar(c.avatar_path, c.title)}
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-medium text-slate-100 truncate">${esc(c.title)}</span>
            ${c.type === 'group' ? '<span class="badge text-emerald-400">grupo</span>' : ''}
            ${c.muted ? '<span title="Silenciada">🔇</span>' : ''}
          </div>
          <div class="text-xs text-slate-500 truncate">${c.last_message_from_me ? '<span class="text-slate-400">Você: </span>' : ''}${esc(c.last_message_preview || '')}</div>
        </div>
        <div class="text-right shrink-0">
          <div class="text-[11px] text-slate-500">${timeAgo(c.last_message_at)}</div>
          <div class="text-[11px] text-slate-600">${c.message_count} msgs</div>
        </div>
      </div>`;
    }

    function renderLists() {
      const cl = $('#chat-list');
      cl.classList.toggle('select-mode', st.selectMode);
      cl.innerHTML = st.active.length ? st.active.map(chatRowHtml).join('') : '<p class="p-6 text-sm text-slate-500">Nenhuma conversa.</p>';
      const al = $('#arch-list');
      if (al) { al.classList.toggle('select-mode', st.selectMode); al.innerHTML = st.archived.map(chatRowHtml).join(''); }
      const sc = $('#sel-count');
      if (sc) sc.textContent = `${st.selected.size} selecionada(s)`;
    }

    function render() {
      view().innerHTML = `
        <div class="fade-in">
          <div class="flex items-center gap-3 mb-4">
            <input id="chat-search" value="${esc(st.search)}" placeholder="Filtrar conversas…" class="flex-1 px-3 py-2 rounded-lg bg-ink-600 border border-ink-500 focus:border-brand outline-none text-sm" />
            <select id="chat-type" class="px-3 py-2 rounded-lg bg-ink-600 border border-ink-500 text-sm outline-none">
              <option value="" ${st.type === '' ? 'selected' : ''}>Todas</option>
              <option value="private" ${st.type === 'private' ? 'selected' : ''}>Privadas</option>
              <option value="group" ${st.type === 'group' ? 'selected' : ''}>Grupos</option>
            </select>
            <button id="opt-toggle" class="px-3 py-2 rounded-lg ${st.selectMode ? 'bg-brand text-ink-900' : 'bg-ink-600 hover:bg-ink-500'} text-sm font-medium">Opções</button>
          </div>
          <div id="sel-bar" class="card p-2 mb-3 flex flex-wrap items-center gap-2 text-sm ${st.selectMode ? '' : 'hidden'}">
            <span id="sel-count" class="px-2 text-slate-400">0 selecionada(s)</span>
            <button id="sel-all" class="px-3 py-1.5 rounded-lg bg-ink-600 hover:bg-ink-500">Selecionar todas</button>
            <div class="flex-1"></div>
            <button data-bulk="archive" class="px-3 py-1.5 rounded-lg bg-ink-600 hover:bg-ink-500">📥 Arquivar</button>
            <button data-bulk="mute" class="px-3 py-1.5 rounded-lg bg-ink-600 hover:bg-ink-500">🔇 Silenciar</button>
            <button data-bulk="clear" class="px-3 py-1.5 rounded-lg bg-red-600/80 hover:bg-red-600">🧹 Limpar</button>
          </div>
          <div id="chat-list" class="card divide-y divide-ink-600 overflow-hidden"></div>
          <div id="arch-wrap" class="mt-4 ${st.archived.length ? '' : 'hidden'}">
            <button id="arch-toggle" class="w-full text-left px-4 py-2 text-sm text-slate-400 hover:text-slate-200 flex items-center gap-2">
              <span id="arch-caret">▸</span> Arquivadas (${st.archived.length})
            </button>
            <div id="arch-list" class="card divide-y divide-ink-600 overflow-hidden hidden mt-1"></div>
          </div>
        </div>`;
      renderLists();
      bind();
    }

    let timer;
    function bind() {
      const search = $('#chat-search');
      search.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(async () => { st.search = search.value.trim(); await fetchData(); renderLists(); $('#arch-wrap').classList.toggle('hidden', !st.archived.length); }, 250);
      });
      $('#chat-type').addEventListener('change', async (e) => { st.type = e.target.value; await fetchData(); renderLists(); $('#arch-wrap').classList.toggle('hidden', !st.archived.length); });
      $('#opt-toggle').addEventListener('click', () => { st.selectMode = !st.selectMode; st.selected.clear(); render(); });
      $('#sel-all').addEventListener('click', () => {
        const all = [...st.active, ...st.archived];
        const allSel = all.length && all.every((c) => st.selected.has(c.id));
        st.selected = allSel ? new Set() : new Set(all.map((c) => c.id));
        renderLists();
      });
      view().querySelectorAll('[data-bulk]').forEach((b) => b.addEventListener('click', async () => {
        if (!st.selected.size) return toast('Selecione ao menos uma conversa', 'err');
        const action = b.dataset.bulk;
        if (action === 'clear') {
          const ok = await confirmModal({ title: 'Limpar conversas', message: `Apagar as mensagens de ${st.selected.size} conversa(s) no painel?`, confirmText: 'Limpar', danger: true });
          if (!ok) return;
        }
        try {
          await API.bulkChats([...st.selected], action);
          toast('Feito', 'ok');
          st.selectMode = false; st.selected.clear();
          await fetchData(); render();
        } catch (e) { toast(e.message, 'err'); }
      }));

      const rowClick = (e) => {
        const row = e.target.closest('.chat-row');
        if (!row) return;
        const cid = row.dataset.id;
        if (st.selectMode) {
          if (st.selected.has(cid)) st.selected.delete(cid); else st.selected.add(cid);
          renderLists();
        } else {
          location.hash = `#/chats/${encodeURIComponent(cid)}`;
        }
      };
      $('#chat-list').addEventListener('click', rowClick);
      const al = $('#arch-list');
      if (al) al.addEventListener('click', rowClick);
      const at = $('#arch-toggle');
      if (at) at.addEventListener('click', () => {
        al.classList.toggle('hidden');
        $('#arch-caret').textContent = al.classList.contains('hidden') ? '▸' : '▾';
      });
    }

    render();
  }

  // ---------- Conversa (thread) ----------
  const isImagePath = (p) => p && /\.(jpe?g|png|webp|gif|bmp)$/i.test(p);

  function mediaHtml(m) {
    const vo = m.is_view_once
      ? '<div class="text-[10px] text-amber-300 mb-1">👁️‍🗨️ Visualização única</div>' : '';
    if (!m.media_path) {
      if (m.type !== 'chat') {
        return `${vo}<div class="text-slate-400 text-sm">${MEDIA_ICON[m.type] || '📎'} ${MEDIA_LABEL[m.type] || 'Mídia'}</div>`;
      }
      return '';
    }
    if (m.type === 'image' || m.type === 'sticker') {
      return `${vo}<a href="${esc(m.media_path)}" target="_blank"><img src="${esc(m.media_path)}" class="rounded-lg max-w-[220px] mb-1" /></a>`;
    }
    if (m.type === 'ptt' || m.type === 'audio') {
      return `${vo}<audio controls src="${esc(m.media_path)}" class="max-w-[230px]"></audio>`;
    }
    if (m.type === 'video') {
      return `${vo}<video controls src="${esc(m.media_path)}" class="rounded-lg max-w-[260px] mb-1"></video>`;
    }
    return `${vo}<a href="${esc(m.media_path)}" target="_blank" class="text-brand underline text-sm">${MEDIA_ICON.document} Abrir documento</a>`;
  }

  // Nome + número + foto do remetente, no estilo WhatsApp.
  function senderInfo(m) {
    if (m.from_me) return { name: 'Você', number: '', avatar: null };
    const saved = m.c_is_saved;
    const name = saved && m.c_name
      ? m.c_name
      : m.c_pushname || m.sender_name || m.c_fnumber || m.sender_number || 'Desconhecido';
    const number = m.c_fnumber || m.sender_number || '';
    return { name, number, avatar: m.c_avatar };
  }

  function quoteHtml(m) {
    if (!m.quoted_msg_id && !m.quoted_body) return '';
    const thumb = isImagePath(m.quoted_media_path)
      ? `<img src="${esc(m.quoted_media_path)}" class="w-9 h-9 rounded object-cover shrink-0" />` : '';
    const label = m.quoted_body
      ? esc(m.quoted_body)
      : m.quoted_type ? (MEDIA_LABEL[m.quoted_type] || m.quoted_type) : 'mensagem';
    return `<div class="quote flex items-center gap-2 cursor-pointer" data-goto="${esc(m.quoted_msg_id || '')}" title="Ver mensagem original">${thumb}<span class="truncate">${label}</span></div>`;
  }

  function renderMessageRow(m, chat, opts = {}) {
    const out = !!m.from_me;
    const si = senderInfo(m);
    const fwd = m.forwarded ? '<div class="text-[10px] text-slate-500 italic mb-0.5">↪ Encaminhada</div>' : '';
    const media = mediaHtml(m);
    const textVal = m.body || m.caption;
    const text = textVal ? `<div>${esc(textVal)}</div>` : '';
    const senderLine = chat.type === 'group' && !out
      ? `<div class="sender">${esc(si.name)}${si.number ? ` <span class="text-slate-500 font-normal">· ${esc(si.number)}</span>` : ''}</div>`
      : '';
    const av = !out && chat.type === 'group' ? avatar(si.avatar, si.name, 'avatar-sm') : '';
    const check = opts.selectMode
      ? `<input type="checkbox" class="fwd-check accent-brand w-4 h-4 self-center pointer-events-none" ${opts.selected && opts.selected.has(m.id) ? 'checked' : ''} />`
      : '';
    return `
      <div class="flex ${out ? 'justify-end' : 'justify-start'} gap-2 mb-1.5 items-end msg-row" data-mid="${esc(m.id || '')}" data-from-me="${out ? 1 : 0}">
        ${opts.selectMode ? check : ''}
        ${av}
        <div class="bubble ${out ? 'out' : 'in'}">
          ${fwd}${senderLine}${quoteHtml(m)}${media}${text}
          <div class="meta text-right">${fmtTime(m.timestamp)}</div>
        </div>
      </div>`;
  }

  function renderMessages(list, chat, opts = {}) {
    let html = '';
    let lastDay = '';
    for (const m of list) {
      const day = fmtDate(m.timestamp);
      if (day !== lastDay) {
        html += `<div class="text-center my-3"><span class="text-[11px] bg-ink-600 text-slate-400 px-3 py-1 rounded-full">${day}</span></div>`;
        lastDay = day;
      }
      html += renderMessageRow(m, chat, opts);
    }
    return html || '<p class="text-slate-500 text-sm">Sem mensagens.</p>';
  }

  async function pageChatThread(id) {
    loading();
    const chat = await API.chat(id);
    const first = await API.chatMessages(id, { limit: 40 });
    let loaded = first.messages || [];
    const total = first.total || loaded.length;
    let hasMore = loaded.length < total;
    let loadingOlder = false;

    // estado de interação
    let replyTo = null;
    let forwardMode = false;
    const forwardSelected = new Set();
    let allChatsForForward = null;

    const me = lastStatus && lastStatus.me ? lastStatus.me.number : null;
    const isGroupAdmin = chat.type === 'group' && me &&
      (chat.participants || []).some((p) => p.number === me && (p.is_admin || p.is_super_admin));

    const subtitle = chat.type === 'group'
      ? `${chat.participants ? chat.participants.length : 0} participantes`
      : chat.subtitle || '';
    const desc = chat.type === 'group' && chat.group && chat.group.description
      ? `<p class="text-xs text-slate-500 mt-1 max-w-xl">${esc(chat.group.description)}</p>` : '';
    // O nome do grupo/contato é o link para os detalhes (só carrega ao clicar nele).
    const titleHref = chat.type === 'group'
      ? `#/groups/${encodeURIComponent(chat.group_id)}`
      : `#/contacts/${encodeURIComponent(chat.contact_id || id)}`;

    view().innerHTML = `
      <div class="fade-in flex flex-col h-full">
        <div class="card p-4 flex items-center gap-3 mb-3">
          <a href="#/chats" class="text-slate-500 hover:text-slate-300 text-xl">←</a>
          ${avatar(chat.avatar_path, chat.title, 'avatar-lg')}
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <a href="${titleHref}" class="text-lg font-semibold text-white truncate hover:underline" title="Ver detalhes">${esc(chat.title)}</a>
              ${chat.type === 'group' ? '<span class="badge text-emerald-400">grupo</span>' : ''}
              <span id="hdr-muted" class="${chat.muted ? '' : 'hidden'}" title="Silenciada">🔇</span>
            </div>
            <p class="text-xs text-slate-500">${esc(subtitle)}${total ? ` · ${total} mensagens` : ''}</p>
            ${desc}
          </div>
          <div class="flex items-center gap-2">
            <button id="opt-btn" title="Opções" class="text-base px-2 py-1.5 rounded-lg bg-ink-600 hover:bg-ink-500">⋮</button>
            <button id="copy-btn" class="text-xs px-3 py-1.5 rounded-lg bg-ink-600 hover:bg-ink-500">Copiar p/ resumo</button>
            <a href="${API.exportUrl(id, 'txt')}" class="text-xs px-3 py-1.5 rounded-lg bg-brand text-ink-900 font-medium">Exportar .txt</a>
          </div>
        </div>
        <div class="card flex-1 overflow-y-auto p-4" id="thread">
          <button id="load-more" class="block w-full text-center text-xs text-brand hover:underline mb-2 ${hasMore ? '' : 'hidden'}">Carregar mensagens mais antigas</button>
          <div id="msg-list">${renderMessages(loaded, chat, { selectMode: false, selected: forwardSelected })}</div>
        </div>
        <div id="reply-bar" class="card mt-3 px-3 py-2 hidden items-center gap-2"></div>
        <div id="fwd-bar" class="card mt-3 px-3 py-2 hidden flex-wrap items-center gap-2"></div>
        <div id="input-row" class="card mt-2 p-2 flex items-center gap-2">
          <input type="file" id="file-input" class="hidden" multiple />
          <button id="attach-btn" title="Anexar imagem/arquivo" class="px-2 py-2 rounded-lg hover:bg-ink-600 text-lg">📎</button>
          <button id="rec-btn" title="Gravar áudio" class="px-2 py-2 rounded-lg hover:bg-ink-600 text-lg">🎤</button>
          <input id="reply-input" placeholder="Escreva uma mensagem…" class="flex-1 px-3 py-2 rounded-lg bg-ink-600 border border-ink-500 focus:border-brand outline-none text-sm" />
          <button id="reply-send" class="px-4 py-2 rounded-lg bg-brand text-ink-900 font-medium text-sm">Enviar</button>
        </div>
        <div id="rec-bar" class="card mt-2 p-2 hidden items-center gap-3">
          <span class="w-3 h-3 rounded-full bg-red-500 animate-pulse shrink-0"></span>
          <span id="rec-time" class="text-sm text-slate-300 tabular-nums shrink-0">0:00</span>
          <div id="rec-meter" class="flex-1 flex items-end justify-center gap-[2px] h-9 overflow-hidden"></div>
          <button id="rec-cancel" class="px-3 py-2 rounded-lg bg-ink-600 hover:bg-ink-500 text-sm shrink-0">Cancelar</button>
          <button id="rec-stop" class="px-4 py-2 rounded-lg bg-brand text-ink-900 text-sm font-medium shrink-0">Enviar</button>
        </div>
      </div>`;

    const thread = $('#thread');
    const msgList = $('#msg-list');
    thread.scrollTop = thread.scrollHeight;

    const findMsg = (mid) => loaded.find((x) => String(x.id) === String(mid));
    const renderThread = () => {
      msgList.innerHTML = renderMessages(loaded, chat, { selectMode: forwardMode, selected: forwardSelected });
    };

    async function loadOlder() {
      if (loadingOlder || !hasMore || !loaded.length) return;
      loadingOlder = true;
      const before = loaded[0].timestamp;
      const prevH = thread.scrollHeight;
      try {
        const older = await API.chatMessages(id, { limit: 40, before });
        const olderMsgs = older.messages || [];
        if (olderMsgs.length) {
          loaded = olderMsgs.concat(loaded);
          renderThread();
          thread.scrollTop = thread.scrollHeight - prevH;
        }
        hasMore = olderMsgs.length > 0 && loaded.length < total;
        $('#load-more').classList.toggle('hidden', !hasMore);
      } catch (e) { /* ignore */ }
      loadingOlder = false;
    }
    thread.addEventListener('scroll', () => { if (thread.scrollTop < 60) loadOlder(); });
    $('#load-more').addEventListener('click', loadOlder);

    async function refreshTail() {
      try {
        const r = await API.chatMessages(id, { limit: 40 });
        loaded = r.messages || [];
        renderThread();
        thread.scrollTop = thread.scrollHeight;
      } catch (e) { /* ignore */ }
    }

    // ----- Responder -----
    function renderReplyBar() {
      const bar = $('#reply-bar');
      if (!replyTo) { bar.classList.add('hidden'); bar.classList.remove('flex'); bar.innerHTML = ''; return; }
      bar.classList.remove('hidden'); bar.classList.add('flex');
      const who = replyTo.from_me ? 'Você' : senderInfo(replyTo).name;
      const preview = replyTo.body || replyTo.caption || MEDIA_LABEL[replyTo.type] || 'mensagem';
      bar.innerHTML = `
        <div class="flex-1 min-w-0 border-l-2 border-brand pl-2">
          <div class="text-[11px] text-brand">Respondendo a ${esc(who)}</div>
          <div class="text-xs text-slate-400 truncate">${esc(preview)}</div>
        </div>
        <button id="reply-cancel" class="text-slate-500 hover:text-slate-300 px-2">✕</button>`;
      $('#reply-cancel').addEventListener('click', () => { replyTo = null; renderReplyBar(); });
    }
    function setReply(m) { replyTo = m; renderReplyBar(); $('#reply-input').focus(); }

    // ----- Encaminhar -----
    async function enterForward(m) {
      forwardMode = true;
      forwardSelected.clear();
      if (m && m.id) forwardSelected.add(m.id);
      if (!allChatsForForward) allChatsForForward = await API.chats({ archived: 'all' });
      renderThread();
      renderForwardBar();
    }
    function renderForwardBar() {
      const bar = $('#fwd-bar');
      if (!forwardMode) { bar.classList.add('hidden'); bar.classList.remove('flex'); bar.innerHTML = ''; return; }
      bar.classList.remove('hidden'); bar.classList.add('flex');
      bar.innerHTML = `
        <span class="text-sm text-slate-300"><b id="fwd-count">${forwardSelected.size}</b> selecionada(s) — encaminhar para:</span>
        <select id="fwd-target" class="px-3 py-1.5 rounded-lg bg-ink-600 border border-ink-500 text-sm outline-none max-w-[240px]">
          <option value="">Selecione a conversa…</option>
          ${(allChatsForForward || []).map((c) => `<option value="${esc(c.id)}">${esc(c.title)}</option>`).join('')}
        </select>
        <div class="flex-1"></div>
        <button id="fwd-go" class="px-3 py-1.5 rounded-lg bg-brand text-ink-900 text-sm font-medium">Encaminhar</button>
        <button id="fwd-cancel" class="px-3 py-1.5 rounded-lg bg-ink-600 hover:bg-ink-500 text-sm">Cancelar</button>`;
      $('#fwd-cancel').addEventListener('click', () => { forwardMode = false; forwardSelected.clear(); renderThread(); renderForwardBar(); });
      $('#fwd-go').addEventListener('click', async () => {
        const to = $('#fwd-target').value;
        if (!to) return toast('Escolha a conversa de destino', 'err');
        if (!forwardSelected.size) return toast('Selecione ao menos uma mensagem', 'err');
        try {
          await API.forwardMessages(to, [...forwardSelected]);
          toast(`Encaminhada(s) ${forwardSelected.size} mensagem(ns)`, 'ok');
          forwardMode = false; forwardSelected.clear(); renderThread(); renderForwardBar();
        } catch (e) { toast(e.message, 'err'); }
      });
    }

    // ----- Apagar -----
    async function doDelete(m, scope) {
      const ok = await confirmModal({
        title: scope === 'everyone' ? 'Apagar para todos' : 'Apagar para mim',
        message: scope === 'everyone'
          ? 'A mensagem será apagada para todos no WhatsApp.'
          : 'A mensagem será removida do painel.',
        confirmText: 'Apagar', danger: true
      });
      if (!ok) return;
      try {
        await API.deleteMessage(m.id, id, scope);
        loaded = loaded.filter((x) => x.id !== m.id);
        renderThread();
        toast('Mensagem apagada', 'ok');
      } catch (e) { toast(e.message, 'err'); }
    }

    // ----- Ações da conversa (arquivar/silenciar/limpar) -----
    async function toggleArchive() {
      try { await API.archiveChat(id, !chat.archived); chat.archived = chat.archived ? 0 : 1; toast(chat.archived ? 'Arquivada' : 'Desarquivada', 'ok'); }
      catch (e) { toast(e.message, 'err'); }
    }
    async function toggleMute() {
      try { await API.muteChat(id, !chat.muted); chat.muted = chat.muted ? 0 : 1; $('#hdr-muted').classList.toggle('hidden', !chat.muted); toast(chat.muted ? 'Silenciada' : 'Som reativado', 'ok'); }
      catch (e) { toast(e.message, 'err'); }
    }
    async function clearConversation() {
      const ok = await confirmModal({ title: 'Limpar conversa', message: 'Apagar as mensagens desta conversa no painel?', confirmText: 'Limpar', danger: true });
      if (!ok) return;
      try { await API.clearChat(id); loaded = []; renderThread(); toast('Conversa limpa', 'ok'); } catch (e) { toast(e.message, 'err'); }
    }

    function chatMenuItems() {
      return [
        { label: chat.archived ? 'Desarquivar conversa' : 'Arquivar conversa', icon: '📥', onClick: toggleArchive },
        { label: chat.muted ? 'Reativar som' : 'Silenciar conversa', icon: '🔇', onClick: toggleMute },
        { label: 'Limpar conversa', icon: '🧹', danger: true, onClick: clearConversation }
      ];
    }
    async function loadFromWhatsApp() {
      toast('Buscando mensagens antigas no WhatsApp…', 'info');
      try {
        const r = await API.loadChatHistory(id);
        toast(`${r.saved} mensagem(ns) carregada(s)`, 'ok');
        pageChatThread(id); // recarrega a thread com as novas mensagens
      } catch (e) { toast(e.message, 'err'); }
    }
    $('#opt-btn').addEventListener('click', (e) => {
      e.stopPropagation(); // não deixa o clique global fechar o menu recém-aberto
      const r = e.currentTarget.getBoundingClientRect();
      showContextMenu(r.left - 130, r.bottom + 4, [
        ...chatMenuItems(),
        { sep: true },
        { label: 'Carregar mensagens antigas (WhatsApp)', icon: '⬇️', onClick: loadFromWhatsApp }
      ]);
    });

    // ----- Menu de contexto da mensagem -----
    function msgMenu(x, y, m) {
      const canEveryone = m.from_me || isGroupAdmin;
      const items = [
        { label: 'Responder', icon: '↩️', onClick: () => setReply(m) },
        { label: 'Encaminhar', icon: '↪️', onClick: () => enterForward(m) }
      ];
      if (canEveryone) items.push({ label: 'Apagar para todos', icon: '🗑️', danger: true, onClick: () => doDelete(m, 'everyone') });
      items.push({ label: 'Apagar para mim', icon: '🗑️', danger: true, onClick: () => doDelete(m, 'me') });
      items.push({ sep: true });
      items.push(...chatMenuItems());
      showContextMenu(x, y, items);
    }

    // ----- Interações na lista de mensagens -----
    function gotoMsg(qid) {
      if (!qid) return;
      const el = msgList.querySelector(`.msg-row[data-mid="${qid.replace(/"/g, '\\"')}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('msg-highlight');
        setTimeout(() => el.classList.remove('msg-highlight'), 1600);
      } else {
        toast('Mensagem original não carregada — carregue mais acima', 'info');
      }
    }

    msgList.addEventListener('contextmenu', (e) => {
      const row = e.target.closest('.msg-row');
      if (!row || !row.dataset.mid) return;
      e.preventDefault();
      const m = findMsg(row.dataset.mid);
      if (m) msgMenu(e.clientX, e.clientY, m);
    });
    msgList.addEventListener('dblclick', (e) => {
      if (forwardMode) return;
      const row = e.target.closest('.msg-row');
      const m = row && findMsg(row.dataset.mid);
      if (m) setReply(m);
    });
    msgList.addEventListener('click', (e) => {
      const q = e.target.closest('.quote[data-goto]');
      if (q) { gotoMsg(q.dataset.goto); return; }
      if (forwardMode) {
        const row = e.target.closest('.msg-row');
        if (!row || !row.dataset.mid) return;
        const mid = row.dataset.mid;
        if (forwardSelected.has(mid)) forwardSelected.delete(mid); else forwardSelected.add(mid);
        renderThread();
        const fc = $('#fwd-count'); if (fc) fc.textContent = forwardSelected.size;
      }
    });

    // arrastar para a direita = responder
    let swipe = null;
    msgList.addEventListener('pointerdown', (e) => {
      const row = e.target.closest('.msg-row');
      if (!row || forwardMode) return;
      swipe = { row, startX: e.clientX, mid: row.dataset.mid, dx: 0 };
    });
    msgList.addEventListener('pointermove', (e) => {
      if (!swipe) return;
      swipe.dx = Math.max(0, Math.min(90, e.clientX - swipe.startX));
      swipe.row.style.transform = `translateX(${swipe.dx}px)`;
    });
    function endSwipe() {
      if (!swipe) return;
      const { row, dx, mid } = swipe;
      row.style.transition = 'transform .15s';
      row.style.transform = '';
      setTimeout(() => { row.style.transition = ''; }, 160);
      if (dx > 55) { const m = findMsg(mid); if (m) setReply(m); }
      swipe = null;
    }
    msgList.addEventListener('pointerup', endSwipe);
    msgList.addEventListener('pointerleave', endSwipe);

    // ----- Enviar texto -----
    async function send() {
      const inp = $('#reply-input');
      const val = inp.value.trim();
      if (!val) return;
      inp.value = '';
      const quoted = replyTo ? replyTo.id : undefined;
      const wasReply = replyTo; replyTo = null; renderReplyBar();
      try {
        await API.sendMessage(id, val, quoted);
        loaded.push({ from_me: 1, type: 'chat', body: val, timestamp: Date.now() });
        renderThread();
        thread.scrollTop = thread.scrollHeight;
      } catch (e) { inp.value = val; replyTo = wasReply; renderReplyBar(); toast(e.message, 'err'); }
    }
    $('#reply-send').addEventListener('click', send);
    $('#reply-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });

    // ----- Anexar imagem/arquivo -----
    $('#attach-btn').addEventListener('click', () => $('#file-input').click());
    $('#file-input').addEventListener('change', async (e) => {
      const files = [...e.target.files];
      e.target.value = '';
      const quoted = replyTo ? replyTo.id : undefined;
      replyTo = null; renderReplyBar();
      for (const f of files) {
        try {
          const dataUrl = await fileToDataUrl(f);
          const kind = f.type.startsWith('image/') ? 'image' : 'file';
          await API.sendMedia(id, { dataUrl, filename: f.name, kind, quotedMsgId: quoted });
          toast(`Enviado: ${f.name}`, 'ok');
        } catch (err) { toast(err.message, 'err'); }
      }
      setTimeout(refreshTail, 1500);
    });

    // ----- Gravar áudio (com medidor de nível em tempo real) -----
    let recState = null;
    function buildMeter() {
      const meter = $('#rec-meter');
      meter.innerHTML = '';
      const bars = [];
      for (let i = 0; i < 28; i++) {
        const b = document.createElement('div');
        b.style.cssText = 'width:4px;height:8%;background:#25D366;border-radius:2px;transition:height .06s linear';
        meter.appendChild(b);
        bars.push(b);
      }
      return bars;
    }
    function stopRecording(cancel) {
      if (!recState) return;
      recState.canceled = !!cancel;
      try { if (recState.recorder.state === 'recording') recState.recorder.stop(); } catch (_) {}
    }

    $('#rec-btn').addEventListener('click', async () => {
      if (recState) { stopRecording(false); return; }
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch (err) { return toast('Microfone indisponível: ' + err.message, 'err'); }

      const chunks = [];
      const recorder = new MediaRecorder(stream);
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      // Liga o analyser ao destino por um ganho ZERO: garante que o grafo seja
      // processado (sem emitir som), para o medidor receber dados de forma confiável.
      const sink = audioCtx.createGain();
      sink.gain.value = 0;
      analyser.connect(sink);
      sink.connect(audioCtx.destination);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const bars = buildMeter();

      $('#input-row').classList.add('hidden');
      const recBar = $('#rec-bar');
      recBar.classList.remove('hidden'); recBar.classList.add('flex');

      const t0 = Date.now();
      const timer = setInterval(() => {
        const s = Math.floor((Date.now() - t0) / 1000);
        $('#rec-time').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      }, 250);

      function draw() {
        analyser.getByteFrequencyData(data);
        for (let i = 0; i < bars.length; i++) {
          const v = data[Math.min(i, data.length - 1)] / 255;
          bars[i].style.height = Math.max(8, Math.round(v * 100)) + '%';
        }
        if (recState) recState.raf = requestAnimationFrame(draw);
      }

      recorder.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
      recorder.onstop = async () => {
        cancelAnimationFrame(recState.raf);
        clearInterval(timer);
        stream.getTracks().forEach((t) => t.stop());
        audioCtx.close().catch(() => {});
        recBar.classList.add('hidden'); recBar.classList.remove('flex');
        $('#input-row').classList.remove('hidden');
        const wasCanceled = recState.canceled;
        recState = null; activeRecordingStop = null;
        if (wasCanceled) return;
        const blob = new Blob(chunks, { type: chunks[0] ? chunks[0].type : 'audio/webm' });
        const quoted = replyTo ? replyTo.id : undefined;
        replyTo = null; renderReplyBar();
        try {
          const dataUrl = await fileToDataUrl(blob);
          await API.sendMedia(id, { dataUrl, filename: 'audio.ogg', kind: 'ptt', quotedMsgId: quoted });
          toast('Áudio enviado', 'ok');
          setTimeout(refreshTail, 1500);
        } catch (err) { toast(err.message, 'err'); }
      };

      recState = { recorder, raf: 0, canceled: false };
      activeRecordingStop = stopRecording;
      recorder.start();
      draw();
    });
    $('#rec-stop').addEventListener('click', () => stopRecording(false));
    $('#rec-cancel').addEventListener('click', () => stopRecording(true));

    $('#copy-btn').addEventListener('click', async () => {
      try {
        const txt = await fetch(API.exportUrl(id, 'txt')).then((r) => r.text());
        await navigator.clipboard.writeText(txt);
        toast('Conversa copiada — cole no Claude para resumir', 'ok');
      } catch { toast('Não foi possível copiar', 'err'); }
    });
  }

  // ---------- Contatos ----------
  async function pageContacts() {
    loading();
    const contacts = await API.contacts();
    view().innerHTML = `
      <div class="fade-in">
        <input id="contact-search" placeholder="Buscar contato por nome ou número…" class="w-full mb-4 px-3 py-2 rounded-lg bg-ink-600 border border-ink-500 focus:border-brand outline-none text-sm" />
        <div id="contact-list" class="card divide-y divide-ink-600 overflow-hidden"></div>
      </div>`;
    const listEl = $('#contact-list');
    const render = (items) => {
      listEl.innerHTML = items.length ? items.map((c) => {
        const name = c.is_saved ? (c.name || c.formatted_name) : (c.pushname || c.formatted_number || c.number);
        return `<a href="#/contacts/${encodeURIComponent(c.id)}" class="row flex items-center gap-3 px-4 py-3">
          ${avatar(c.avatar_path, name)}
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-medium truncate">${esc(name)}</span>
              ${c.is_saved ? '<span class="badge text-brand">salvo</span>' : ''}
              ${c.is_business ? '<span class="badge text-sky-400">business</span>' : ''}
            </div>
            <div class="text-xs text-slate-500">${esc(c.formatted_number || c.number || '')}${c.pushname && c.is_saved ? ' · ' + esc(c.pushname) : ''}</div>
          </div>
        </a>`;
      }).join('') : '<p class="p-6 text-sm text-slate-500">Nenhum contato.</p>';
    };
    render(contacts);
    let timer;
    $('#contact-search').addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(async () => render(await API.contacts(e.target.value.trim())), 250);
    });
  }

  // ---------- Detalhe do contato ----------
  async function pageContactDetail(id) {
    loading();
    const c = await API.contact(id);
    const name = c.is_saved ? (c.name || c.formatted_name) : (c.pushname || c.formatted_number || c.number);
    view().innerHTML = `
      <div class="fade-in space-y-4 max-w-3xl">
        <div class="card p-5 flex gap-4 items-center">
          <a href="#/contacts" class="text-slate-500 hover:text-slate-300 text-xl">←</a>
          ${avatar(c.avatar_path, name, 'avatar-lg')}
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <h3 class="text-xl font-semibold text-white truncate">${esc(name)}</h3>
              ${c.is_saved ? '<span class="badge text-brand">salvo</span>' : '<span class="badge text-slate-500">não salvo</span>'}
              ${c.is_business ? '<span class="badge text-sky-400">business</span>' : ''}
            </div>
            <p class="text-sm text-slate-400">${esc(c.formatted_number || c.number || '')}</p>
            ${c.pushname ? `<p class="text-xs text-slate-500">Nome no WhatsApp: ${esc(c.pushname)}</p>` : ''}
          </div>
          ${c.chat ? `<a href="#/chats/${encodeURIComponent(c.id)}" class="text-xs px-3 py-1.5 rounded-lg bg-brand text-ink-900 font-medium">Ver conversa</a>` : ''}
        </div>
        <div class="card overflow-hidden">
          <div class="px-4 py-3 border-b border-ink-600 text-sm font-semibold text-slate-300">Grupos em comum (${(c.groups || []).length})</div>
          <div class="divide-y divide-ink-600">
            ${(c.groups || []).length ? c.groups.map((g) => `
              <a href="#/groups/${encodeURIComponent(g.id)}" class="row flex items-center gap-3 px-4 py-2.5">
                ${avatar(g.avatar_path, g.subject, 'avatar-sm')}
                <span class="flex-1 truncate text-sm">${esc(g.subject)}</span>
                ${g.is_super_admin ? '<span class="badge text-amber-400">dono</span>' : g.is_admin ? '<span class="badge text-emerald-400">admin</span>' : ''}
              </a>`).join('') : '<p class="p-4 text-sm text-slate-500">Nenhum grupo em comum encontrado.</p>'}
          </div>
        </div>
      </div>`;
  }

  // ---------- Connections (lista de grupos -> contatos com conexões) ----------
  async function pageConnections() {
    loading();
    const groups = await API.groups();
    const groupsById = {};
    groups.forEach((g) => (groupsById[g.id] = g));

    view().innerHTML = `
      <div class="fade-in grid grid-cols-1 lg:grid-cols-3 gap-4 h-full">
        <div class="card overflow-hidden lg:col-span-1 flex flex-col">
          <div class="px-4 py-3 border-b border-ink-600 text-sm font-semibold text-slate-300">Grupos (${groups.length})</div>
          <div id="conn-groups" class="overflow-y-auto divide-y divide-ink-600">
            ${groups.length ? groups.map((g) => `
              <div class="row flex items-center gap-3 px-4 py-3 conn-group" data-id="${esc(g.id)}">
                ${avatar(g.avatar_path, g.subject, 'avatar-sm')}
                <div class="flex-1 min-w-0">
                  <div class="truncate text-sm">${esc(g.subject)}</div>
                  <div class="text-[11px] text-slate-500">${g.participant_count || 0} participantes</div>
                </div>
              </div>`).join('') : '<p class="p-4 text-sm text-slate-500">Nenhum grupo. Sincronize primeiro.</p>'}
          </div>
        </div>
        <div class="card lg:col-span-2 overflow-hidden flex flex-col">
          <div id="conn-detail-head" class="px-4 py-3 border-b border-ink-600 text-sm font-semibold text-slate-300">Selecione um grupo</div>
          <div id="conn-detail" class="overflow-y-auto flex-1">
            <p class="p-4 text-sm text-slate-500">Clique em um grupo à esquerda para ver os contatos que também estão em outros grupos.</p>
          </div>
        </div>
      </div>`;

    view().querySelectorAll('.conn-group').forEach((row) => {
      row.addEventListener('click', async () => {
        view().querySelectorAll('.conn-group').forEach((r) => r.classList.remove('active-row'));
        row.classList.add('active-row');
        const g = groupsById[row.dataset.id];
        $('#conn-detail-head').innerHTML = `Contatos de “${esc(g.subject)}” presentes em outros grupos`;
        const box = $('#conn-detail');
        box.innerHTML = '<div class="p-4"><span class="spinner"></span></div>';
        const contacts = await API.groupConnections(g.id);
        box.innerHTML = contacts.length
          ? `<div class="divide-y divide-ink-600">${contacts.map((c) => {
              const name = c.is_saved ? (c.name || c.pushname) : (c.pushname || c.formatted_number || c.number);
              return `<div class="px-4 py-3">
                <div class="flex items-center gap-3 mb-2">
                  ${avatar(c.avatar_path, name, 'avatar-sm')}
                  <a href="#/contacts/${encodeURIComponent(c.id)}" class="flex-1 min-w-0">
                    <div class="truncate text-sm text-slate-100">${esc(name)}</div>
                    <div class="text-[11px] text-slate-500">${esc(c.formatted_number || c.number || '')}</div>
                  </a>
                  <span class="text-[11px] text-brand shrink-0">+${c.groups.length} grupo(s)</span>
                </div>
                <div class="flex flex-wrap gap-1.5 pl-11">
                  ${c.groups.map((og) => `<a href="#/groups/${encodeURIComponent(og.id)}" class="inline-flex items-center gap-1.5 bg-ink-600 hover:bg-ink-500 rounded-full pl-1 pr-3 py-0.5 text-xs">${avatar(og.avatar_path, og.subject, 'avatar-xs')}<span class="truncate max-w-[160px]">${esc(og.subject)}</span></a>`).join('')}
                </div>
              </div>`;
            }).join('')}</div>`
          : '<p class="p-4 text-sm text-slate-500">Nenhum contato deste grupo está em outros grupos.</p>';
      });
    });
  }

  // ---------- Documentação ----------
  function pageDocs() {
    const origin = location.origin;
    const code = (s) => `<pre class="bg-ink-900 border border-ink-600 rounded-lg p-3 text-xs overflow-x-auto text-slate-300 my-2"><code>${esc(s)}</code></pre>`;
    view().innerHTML = `
      <div class="fade-in max-w-4xl space-y-6 text-sm text-slate-300 leading-relaxed">
        <div class="card p-5">
          <h3 class="text-base font-semibold text-white mb-2">Como a conexão funciona</h3>
          <p>O <b>whats-middle</b> conecta-se ao WhatsApp via <b>open-wa</b> (você pareia escaneando o QR Code).
          Cada mensagem recebida/enviada é salva em um banco <b>SQLite</b> e fica disponível de 3 formas:</p>
          <ul class="list-disc pl-5 mt-2 space-y-1 text-slate-400">
            <li><b>Dashboard</b> — esta interface (conversas, grupos, contatos, connections, busca).</li>
            <li><b>Webhook</b> — cada mensagem nova é enviada via <code>POST</code> JSON para uma URL sua.</li>
            <li><b>API pública</b> <code>/api/v1</code> — para consultar/baixar conversas (ex.: pedir resumos).</li>
          </ul>
        </div>

        <div class="card p-5">
          <h3 class="text-base font-semibold text-white mb-2">Webhook — receber mensagens em JSON</h3>
          <p>Em <b>Configurações → Webhook</b>, informe a URL e ative. A cada mensagem nova, enviamos:</p>
          ${code(`POST  https://sua-url/webhook
Content-Type: application/json

{
  "id": "3EB0...",
  "chat_id": "5511999999999@c.us",
  "chat_type": "private",            // "private" | "group"
  "group_id": null,                   // preenchido quando for grupo
  "group_name": null,
  "sender": {
    "id": "5511999999999@c.us",
    "name": "Fulano da Silva",        // nome salvo, ou pushname, ou número
    "number": "5511999999999"
  },
  "from_me": false,
  "type": "chat",                     // chat | image | ptt | video | document | ...
  "body": "Olá, tudo bem? @João",    // menções @número já viram @nome
  "caption": null,
  "media_url": null,                  // caminho da mídia salva, se houver
  "mimetype": null,
  "mentions": [
    { "id": "5511888888888@c.us", "number": "5511888888888", "name": "João" }
  ],
  "timestamp": 1781390000000          // epoch em ms
}`)}
        </div>

        <div class="card p-5">
          <h3 class="text-base font-semibold text-white mb-2">Menções (@usuário)</h3>
          <p>Quando alguém menciona um usuário (<code>@número</code>), o whats-middle substitui pelo
          <b>nome</b> do contato (nome salvo ou nome do WhatsApp). O número original fica disponível
          no array <code>mentions</code>.</p>
        </div>

        <div class="card p-5">
          <h3 class="text-base font-semibold text-white mb-2">API pública / como buscar</h3>
          <p>Gere uma chave em <b>Configurações → Conexões</b> e envie no header
          <code>X-API-Key</code> (ou <code>?api_key=</code>). Endpoints:</p>
          ${code(`# Conversas
GET ${origin}/api/v1/chats
GET ${origin}/api/v1/chats?type=group&search=fornecedores

# Mensagens de uma conversa (paginação por timestamp)
GET ${origin}/api/v1/chats/<chat_id>/messages?limit=500
GET ${origin}/api/v1/chats/<chat_id>/messages?before=<timestamp_ms>

# Transcrição pronta para resumo (texto puro)
GET ${origin}/api/v1/chats/<chat_id>/transcript

# Buscar em todas as mensagens
GET ${origin}/api/v1/search?q=cotação

# Grupos, contatos e connections
GET ${origin}/api/v1/groups
GET ${origin}/api/v1/contacts
GET ${origin}/api/v1/connections

# Exemplo com curl:
curl -H "X-API-Key: SUA_CHAVE" "${origin}/api/v1/search?q=pedido"`)}
          <p class="text-slate-400 mt-2">No painel você também busca em <b>Buscar</b> (por texto, nome, número ou grupo).</p>
        </div>
      </div>`;
  }

  // ---------- Grupos ----------
  async function pageGroups() {
    loading();
    const groups = await API.groups();
    view().innerHTML = `
      <div class="fade-in">
        <input id="group-search" placeholder="Buscar grupo…" class="w-full mb-4 px-3 py-2 rounded-lg bg-ink-600 border border-ink-500 focus:border-brand outline-none text-sm" />
        <div id="group-list" class="grid grid-cols-1 md:grid-cols-2 gap-4"></div>
      </div>`;
    const listEl = $('#group-list');
    const render = (items) => {
      listEl.innerHTML = items.length ? items.map((g) => `
        <a href="#/groups/${encodeURIComponent(g.id)}" class="card p-4 row flex gap-3">
          ${avatar(g.avatar_path, g.subject, 'avatar-lg')}
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-white truncate">${esc(g.subject)}</div>
            <div class="text-xs text-slate-500 mb-1">${g.participant_count || 0} participantes</div>
            <div class="text-xs text-slate-600 line-clamp-2">${esc(g.description || 'Sem descrição')}</div>
          </div>
        </a>`).join('') : '<p class="text-sm text-slate-500">Nenhum grupo.</p>';
    };
    render(groups);
    let timer;
    $('#group-search').addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(async () => render(await API.groups(e.target.value.trim())), 250);
    });
  }

  async function pageGroupDetail(id) {
    loading();
    const g = await API.group(id);
    view().innerHTML = `
      <div class="fade-in space-y-4">
        <div class="card p-5 flex gap-4">
          <a href="#/groups" class="text-slate-500 hover:text-slate-300 text-xl">←</a>
          ${avatar(g.avatar_path, g.subject, 'avatar-lg')}
          <div class="flex-1">
            <h3 class="text-xl font-semibold text-white">${esc(g.subject)}</h3>
            <p class="text-sm text-slate-500 mb-2">${g.participant_count || (g.participants || []).length} participantes</p>
            <p class="text-sm text-slate-400 max-w-2xl">${esc(g.description || 'Sem descrição')}</p>
            <div class="mt-3">
              <a href="#/chats/${encodeURIComponent(g.id)}" class="text-xs px-3 py-1.5 rounded-lg bg-brand text-ink-900 font-medium">Ver mensagens</a>
            </div>
          </div>
        </div>
        <div class="card overflow-hidden">
          <div class="px-4 py-3 border-b border-ink-600 text-sm font-semibold text-slate-300">Participantes</div>
          <div class="divide-y divide-ink-600">
            ${(g.participants || []).map((p) => {
              const name = p.is_saved ? (p.name || p.pushname) : (p.formatted_number || p.number);
              return `<div class="flex items-center gap-3 px-4 py-2.5">
                ${avatar(p.avatar_path, name, 'avatar-sm')}
                <span class="flex-1 truncate text-sm">${esc(name || p.id)}</span>
                ${p.is_super_admin ? '<span class="badge text-amber-400">dono</span>' : p.is_admin ? '<span class="badge text-emerald-400">admin</span>' : ''}
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>`;
  }

  // ---------- Buscar ----------
  async function pageSearch(q) {
    view().innerHTML = `
      <div class="fade-in">
        <input id="msg-search" value="${esc(q || '')}" placeholder="Buscar em todas as mensagens…" class="w-full mb-4 px-3 py-2.5 rounded-lg bg-ink-600 border border-ink-500 focus:border-brand outline-none" />
        <div id="search-results" class="space-y-2"></div>
      </div>`;
    const input = $('#msg-search');
    input.focus();
    const run = async () => {
      const term = input.value.trim();
      const box = $('#search-results');
      if (!term) { box.innerHTML = '<p class="text-sm text-slate-500">Digite algo para buscar.</p>'; return; }
      box.innerHTML = '<span class="spinner"></span>';
      const results = await API.searchMessages(term);
      box.innerHTML = results.length ? results.map((m) => `
        <a href="#/chats/${encodeURIComponent(m.chat_id)}" class="card row block p-3">
          <div class="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>${esc(m.chat_title || m.chat_id)} ${m.chat_kind === 'group' ? '· grupo' : ''}</span>
            <span>${fmtDateTime(m.timestamp)}</span>
          </div>
          <div class="text-sm"><span class="text-slate-400">${esc(m.from_me ? 'Você' : m.sender_name)}: </span>${esc(m.body || m.caption || '[' + m.type + ']')}</div>
        </a>`).join('') : '<p class="text-sm text-slate-500">Nada encontrado.</p>';
    };
    let timer;
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 300); });
    if (q) run();
  }

  // ---------- Logs ----------
  const LOG_COLOR = { error: 'text-red-400', warn: 'text-amber-400', info: 'text-slate-300', debug: 'text-slate-500' };
  async function pageLogs() {
    loading();
    const render = async (level = '') => {
      const logs = await API.logs({ level, limit: 400 });
      $('#log-list').innerHTML = logs.length ? logs.map((l) => `
        <div class="flex items-start gap-3 px-4 py-2 border-b border-ink-600 text-sm font-mono">
          <span class="text-[11px] text-slate-600 shrink-0 w-32">${fmtDateTime(l.timestamp)}</span>
          <span class="uppercase text-[11px] w-12 shrink-0 ${LOG_COLOR[l.level] || 'text-slate-400'}">${esc(l.level)}</span>
          <span class="flex-1 break-words whitespace-pre-wrap ${LOG_COLOR[l.level] || ''}">${esc(l.message)}</span>
        </div>`).join('') : '<p class="p-6 text-sm text-slate-500">Sem logs.</p>';
    };
    view().innerHTML = `
      <div class="fade-in">
        <div class="flex items-center gap-3 mb-4">
          <select id="log-level" class="px-3 py-2 rounded-lg bg-ink-600 border border-ink-500 text-sm outline-none">
            <option value="">Todos os níveis</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
            <option value="debug">Debug</option>
          </select>
          <button id="log-refresh" class="px-3 py-2 rounded-lg bg-ink-600 hover:bg-ink-500 text-sm">Atualizar</button>
        </div>
        <div id="log-list" class="card overflow-hidden"></div>
      </div>`;
    await render();
    $('#log-level').addEventListener('change', (e) => render(e.target.value));
    $('#log-refresh').addEventListener('click', () => render($('#log-level').value));
  }

  // ---------- Configurações ----------
  async function pageSettings() {
    loading();
    const [settings, status] = [await API.settings(), lastStatus || (await API.status())];
    const r = settings.runtime;
    const app = settings.app || {};
    const connInfo = STATUS[status.status] || STATUS.disconnected;
    const flag = (v) => v ? '<span class="badge text-brand">ativo</span>' : '<span class="badge text-slate-500">inativo</span>';

    const qrBlock = status.status === 'qr' && status.qr
      ? `<div class="mt-4 flex flex-col items-center"><img data-qr-img src="${status.qr}" class="w-48 h-48 rounded-lg bg-white p-2" /><p class="text-xs text-slate-500 mt-2">Escaneie no app do WhatsApp</p></div>` : '';

    view().innerHTML = `
      <div class="fade-in grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="card p-5">
          <h3 class="text-sm font-semibold text-slate-300 mb-4">Conexão WhatsApp</h3>
          <div class="flex items-center gap-2 mb-1">
            <span class="w-2.5 h-2.5 rounded-full ${connInfo.dot}"></span>
            <span class="text-white">${connInfo.label}</span>
          </div>
          <p class="text-xs text-slate-500">${status.me && status.me.number ? '+' + status.me.number + (status.me.pushname ? ' · ' + esc(status.me.pushname) : '') : 'Não pareado'}</p>
          ${qrBlock}
          <div class="flex flex-wrap gap-2 mt-4">
            <button data-act="sync" class="text-sm px-3 py-2 rounded-lg bg-brand text-ink-900 font-medium">Sincronizar grupos e contatos (fotos + detalhes)</button>
            <button data-act="history" class="text-sm px-3 py-2 rounded-lg bg-ink-500 hover:bg-ink-600">Carregar mensagens antigas</button>
            <button data-act="restart" class="text-sm px-3 py-2 rounded-lg bg-ink-600 hover:bg-ink-500">Reiniciar conexão</button>
            <button data-act="logout" class="text-sm px-3 py-2 rounded-lg bg-red-600/80 hover:bg-red-600">Desconectar</button>
          </div>
          <div id="task-progress" class="mt-3 text-xs text-amber-300 leading-relaxed"></div>
        </div>

        <div class="card p-5">
          <h3 class="text-sm font-semibold text-slate-300 mb-4">Preferências do painel</h3>
          <label class="block text-xs text-slate-500 mb-1">Nome da instância</label>
          <input id="set-name" value="${esc(app.instance_name || 'whats-middle')}" class="w-full mb-4 px-3 py-2 rounded-lg bg-ink-600 border border-ink-500 outline-none text-sm" />
          <button id="save-settings" class="text-sm px-3 py-2 rounded-lg bg-brand text-ink-900 font-medium">Salvar</button>
        </div>

        <div class="card p-5 lg:col-span-2">
          <h3 class="text-sm font-semibold text-slate-300 mb-1">Webhook — receber mensagens em JSON</h3>
          <p class="text-xs text-slate-500 mb-3">Cada mensagem nova é enviada via POST JSON para esta URL. Veja o formato em <a href="#/docs" class="text-brand hover:underline">Documentação</a>.</p>
          <div class="flex flex-col md:flex-row gap-2 md:items-center">
            <input id="set-webhook" value="${esc(app.webhook_url || '')}" placeholder="https://sua-url/webhook" class="flex-1 px-3 py-2 rounded-lg bg-ink-600 border border-ink-500 outline-none text-sm" />
            <label class="flex items-center gap-2 text-xs text-slate-400 select-none">
              <input id="set-webhook-on" type="checkbox" ${app.webhook_enabled === 'true' ? 'checked' : ''} class="accent-brand w-4 h-4" /> Ativo
            </label>
            <button id="save-webhook" class="text-sm px-3 py-2 rounded-lg bg-brand text-ink-900 font-medium">Salvar</button>
            <button id="test-webhook" class="text-sm px-3 py-2 rounded-lg bg-ink-600 hover:bg-ink-500">Testar</button>
          </div>
        </div>

        <div class="card p-5 lg:col-span-2">
          <h3 class="text-sm font-semibold text-slate-300 mb-1">Conexões — acesso à API</h3>
          <p class="text-xs text-slate-500 mb-3">Gere uma chave para acessar a API local (resumos/integrações). Envie no header <code class="bg-ink-900 px-1 rounded">X-API-Key</code>. Exemplos em <a href="#/docs" class="text-brand hover:underline">Documentação</a>.</p>
          <div class="flex items-center gap-2 mb-2">
            <span class="w-2.5 h-2.5 rounded-full ${app.api_key ? 'bg-brand' : 'bg-slate-500'}"></span>
            <span class="text-sm">${app.api_key ? 'API ativa' : 'API desativada (sem chave)'}</span>
          </div>
          <div class="flex flex-col md:flex-row gap-2 md:items-center">
            <input id="api-key-field" readonly value="${esc(app.api_key || '')}" placeholder="Nenhuma chave gerada" class="flex-1 px-3 py-2 rounded-lg bg-ink-600 border border-ink-500 outline-none text-sm font-mono" />
            <button id="api-copy" class="text-sm px-3 py-2 rounded-lg bg-ink-600 hover:bg-ink-500">Copiar</button>
            <button id="api-generate" class="text-sm px-3 py-2 rounded-lg bg-brand text-ink-900 font-medium">${app.api_key ? 'Gerar nova chave' : 'Gerar chave'}</button>
            <button id="api-revoke" class="text-sm px-3 py-2 rounded-lg bg-red-600/80 hover:bg-red-600 ${app.api_key ? '' : 'hidden'}">Revogar</button>
          </div>
          <p class="text-[11px] text-slate-600 mt-2">Base: <span class="text-slate-400">${esc(location.origin)}/api/v1</span></p>
        </div>

        <div class="card p-5 lg:col-span-2">
          <h3 class="text-sm font-semibold text-slate-300 mb-4">Configuração ativa (definida no arquivo .env)</h3>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-y-3 gap-x-6 text-sm">
            <div class="flex justify-between"><span class="text-slate-500">Sessão</span><span>${esc(r.sessionId)}</span></div>
            <div class="flex justify-between"><span class="text-slate-500">Headless</span>${flag(r.headless)}</div>
            <div class="flex justify-between"><span class="text-slate-500">Captura enviadas</span>${flag(r.captureOutgoing)}</div>
            <div class="flex justify-between"><span class="text-slate-500">Salvar mídia</span>${flag(r.saveMedia)}</div>
            <div class="flex justify-between"><span class="text-slate-500">Salvar avatares</span>${flag(r.saveAvatars)}</div>
            <div class="flex justify-between"><span class="text-slate-500">Login exigido</span>${flag(r.authEnabled)}</div>
            <div class="flex justify-between col-span-2 md:col-span-3"><span class="text-slate-500">Tipos de mídia</span><span class="text-slate-300">${esc((r.saveMediaTypes || []).join(', '))}</span></div>
          </div>
        </div>
      </div>`;

    // Progresso das tarefas longas (sync / histórico).
    function renderProgress(t) {
      const parts = [];
      if (t && t.sync && t.sync.running) {
        parts.push(`🔄 ${esc(t.sync.label)} ${t.sync.total ? `(${t.sync.done}/${t.sync.total})` : ''}`);
      }
      if (t && t.history && t.history.running) {
        parts.push(`📥 ${esc(t.history.label)} ${t.history.total ? `(${t.history.done}/${t.history.total})` : ''}`);
      }
      const el = $('#task-progress');
      if (el) el.innerHTML = parts.join('<br>');
      return !!(t && ((t.sync && t.sync.running) || (t.history && t.history.running)));
    }
    async function pollOnce() {
      try {
        const s = await API.status();
        const running = renderProgress(s.tasks);
        if (!running && pageInterval) {
          clearInterval(pageInterval);
          pageInterval = null;
          toast('Tarefa concluída', 'ok');
          refreshStatus();
        }
      } catch (_) { /* ignore */ }
    }
    function ensurePolling() {
      if (!pageInterval) { pollOnce(); pageInterval = setInterval(pollOnce, 1500); }
    }
    if (renderProgress(status.tasks)) ensurePolling();

    view().querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const act = btn.dataset.act;
        try {
          if (act === 'sync') {
            const r2 = await API.waSync();
            toast(r2.started ? 'Sincronização iniciada…' : 'Sincronização já em andamento', 'ok');
            ensurePolling();
          }
          if (act === 'history') {
            const r2 = await API.waLoadHistory();
            toast(r2.started ? 'Carregando mensagens antigas…' : 'Carga já em andamento', 'ok');
            ensurePolling();
          }
          if (act === 'restart') { await API.waRestart(); toast('Reiniciando conexão…', 'ok'); setTimeout(refreshStatus, 1500); }
          if (act === 'logout') {
            if (confirm('Desconectar a sessão do WhatsApp?')) {
              await API.waLogout(); toast('Desconectado', 'ok'); setTimeout(refreshStatus, 1500);
            }
          }
        } catch (e) { toast(e.message, 'err'); }
      });
    });
    $('#save-settings').addEventListener('click', async () => {
      try {
        await API.saveSettings({ instance_name: $('#set-name').value.trim() });
        $('#brand-name').textContent = $('#set-name').value.trim() || 'whats-middle';
        toast('Preferências salvas', 'ok');
      } catch (e) { toast(e.message, 'err'); }
    });

    async function saveWebhook() {
      await API.saveSettings({
        webhook_url: $('#set-webhook').value.trim(),
        webhook_enabled: $('#set-webhook-on').checked ? 'true' : 'false'
      });
    }
    $('#save-webhook').addEventListener('click', async () => {
      try { await saveWebhook(); toast('Webhook salvo', 'ok'); } catch (e) { toast(e.message, 'err'); }
    });
    $('#test-webhook').addEventListener('click', async () => {
      try {
        await saveWebhook(); // usa a URL atual do campo
        const r = await API.webhookTest();
        toast(`Webhook respondeu HTTP ${r.status}`, 'ok');
      } catch (e) { toast(e.message, 'err'); }
    });

    // ----- Conexões / chave de API -----
    $('#api-generate').addEventListener('click', async () => {
      if (app.api_key && !(await confirmModal({ title: 'Gerar nova chave', message: 'A chave atual deixará de funcionar. Continuar?', confirmText: 'Gerar' }))) return;
      try { await API.generateApiKey(); toast('Nova chave gerada', 'ok'); pageSettings(); } catch (e) { toast(e.message, 'err'); }
    });
    $('#api-revoke').addEventListener('click', async () => {
      if (!(await confirmModal({ title: 'Revogar chave', message: 'A API ficará inacessível até gerar uma nova chave. Continuar?', confirmText: 'Revogar', danger: true }))) return;
      try { await API.revokeApiKey(); toast('Chave revogada', 'ok'); pageSettings(); } catch (e) { toast(e.message, 'err'); }
    });
    $('#api-copy').addEventListener('click', async () => {
      const v = $('#api-key-field').value;
      if (!v) return toast('Nenhuma chave gerada', 'err');
      try { await navigator.clipboard.writeText(v); toast('Chave copiada', 'ok'); } catch { toast('Não foi possível copiar', 'err'); }
    });
  }

  // ============================ router ============================
  function parseHash() {
    const raw = location.hash || '#/';
    const [pathPart, queryPart] = raw.slice(1).split('?'); // remove '#'
    const segs = pathPart.split('/').filter(Boolean); // ['chats','<id>']
    const params = new URLSearchParams(queryPart || '');
    return { segs, params };
  }

  async function route() {
    // Limpa qualquer poller da tela anterior para não vazar intervalos.
    if (pageInterval) { clearInterval(pageInterval); pageInterval = null; }
    if (activeRecordingStop) { try { activeRecordingStop(true); } catch (_) {} activeRecordingStop = null; }
    closeContextMenu();
    const { segs, params } = parseHash();
    const base = '#/' + (segs[0] || '');
    setActiveNav(segs.length === 0 ? '#/' : base);
    try {
      if (segs.length === 0) return await pageDashboard();
      switch (segs[0]) {
        case 'chats':
          return segs[1] ? await pageChatThread(decodeURIComponent(segs[1])) : await pageChats();
        case 'contacts':
          return segs[1] ? await pageContactDetail(decodeURIComponent(segs[1])) : await pageContacts();
        case 'groups':
          return segs[1] ? await pageGroupDetail(decodeURIComponent(segs[1])) : await pageGroups();
        case 'connections': return await pageConnections();
        case 'docs': return pageDocs();
        case 'search': return await pageSearch(params.get('q') || '');
        case 'logs': return await pageLogs();
        case 'settings': return await pageSettings();
        default: return await pageDashboard();
      }
    } catch (e) {
      if (e.message !== 'unauthorized') view().innerHTML = `<div class="text-red-400 text-sm">Erro: ${esc(e.message)}</div>`;
    }
  }

  // ============================ login ============================
  function showLogin() {
    $('#app').classList.add('hidden');
    $('#login-overlay').classList.remove('hidden');
  }
  function showApp() {
    $('#login-overlay').classList.add('hidden');
    $('#app').classList.remove('hidden');
    $('#app').classList.add('flex');
  }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#login-error');
    err.classList.add('hidden');
    try {
      const { token } = await API.login($('#login-user').value, $('#login-pass').value);
      API.setToken(token);
      await boot();
    } catch {
      err.textContent = 'Usuário ou senha inválidos.';
      err.classList.remove('hidden');
    }
  });

  $('#logout-btn').addEventListener('click', async () => {
    try { await API.logout(); } catch {}
    API.clearToken();
    showLogin();
  });

  $('#global-search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = e.target.value.trim();
      if (q) location.hash = `#/search?q=${encodeURIComponent(q)}`;
    }
  });

  API.setUnauthorizedHandler(showLogin);

  // ============================ boot ============================
  async function boot() {
    const me = await API.me().catch(() => ({ authEnabled: true, authenticated: false }));
    if (me.authEnabled && !me.authenticated) { showLogin(); return; }
    showApp();
    renderNav();
    if (!location.hash) location.hash = '#/';
    await refreshStatus();
    await route();
    // Atualiza o status periodicamente (QR, conexão…).
    setInterval(refreshStatus, 5000);
  }

  window.addEventListener('hashchange', route);
  boot();
})();
