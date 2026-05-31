(() => {
  'use strict';

  const KEY = 'beerCounter.v2';

  // ---------- data model ----------
  // db = {
  //   roster:  [{ id, name }]                              persistent fellas
  //   session: { id, startedAt, members:[{id,name,count}] } | null   current round
  //   history: [{ id, startedAt, endedAt, entries:[{name,count}] }]  archived rounds
  // }
  let db = { roster: [], session: null, history: [] };

  // fellas selected for the *next* round (ids). Ephemeral, defaults to "all".
  let selected = new Set();
  let lastScreen = 'setup';

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // ---------- elements ----------
  const $ = (id) => document.getElementById(id);
  const screens = { setup: $('setup'), dashboard: $('dashboard'), history: $('history') };

  const resumeBanner = $('resumeBanner');
  const resumeMeta   = $('resumeMeta');
  const addForm      = $('addForm');
  const nameInput    = $('nameInput');
  const rosterList   = $('rosterList');
  const emptyHint    = $('emptyHint');
  const selCount     = $('selCount');
  const startBtn     = $('startBtn');
  const startLabel   = $('startLabel');
  const hofBtn       = $('hofBtn');
  const lastCrewBtn  = $('lastCrewBtn');
  const lastCrewLabel= $('lastCrewLabel');

  const backBtn      = $('backBtn');
  const dashHofBtn   = $('dashHofBtn');
  const tilesEl      = $('tiles');
  const totalLabel   = $('totalLabel');
  const resetBtn     = $('resetBtn');
  const finishBtn    = $('finishBtn');

  const histBackBtn  = $('histBackBtn');
  const champCard    = $('champCard');
  const leaderList   = $('leaderList');
  const sessionList  = $('sessionList');

  // ---------- persistence ----------
  function save() { localStorage.setItem(KEY, JSON.stringify(db)); }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const data = JSON.parse(raw);
        db.roster  = Array.isArray(data.roster)  ? data.roster  : [];
        db.session = data.session || null;
        db.history = Array.isArray(data.history) ? data.history : [];
        return;
      }
      migrateV1();
    } catch { /* start fresh */ }
  }

  // Carry over data from the very first prototype (beerCounter.v1).
  function migrateV1() {
    try {
      const old = JSON.parse(localStorage.getItem('beerCounter.v1') || 'null');
      if (!old || !Array.isArray(old.participants)) return;
      db.roster = old.participants.map(p => ({ id: uid(), name: p.name }));
      if (old.participants.some(p => p.count > 0)) {
        db.session = {
          id: uid(),
          startedAt: Date.now(),
          members: old.participants.map((p, i) => ({ id: db.roster[i].id, name: p.name, count: p.count || 0 })),
        };
      }
      save();
    } catch { /* ignore */ }
  }

  // ---------- helpers ----------
  const fmtDate = (ts) =>
    new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  function buzz(ms) { if (navigator.vibrate) navigator.vibrate(ms); }

  function show(name) {
    if (name === 'history') lastScreen = screens.dashboard.classList.contains('is-active') ? 'dashboard' : 'setup';
    Object.entries(screens).forEach(([k, el]) => el.classList.toggle('is-active', k === name));
    window.scrollTo(0, 0);
  }

  // ================= SETUP =================
  function personalBestMap() {
    // name -> best single-round count (history + live session)
    const best = new Map();
    const consider = (name, count) => {
      if (count > 0 && count > (best.get(name) || 0)) best.set(name, count);
    };
    db.history.forEach(s => s.entries.forEach(e => consider(e.name, e.count)));
    if (db.session) db.session.members.forEach(m => consider(m.name, m.count));
    return best;
  }

  // most recently finished round
  function lastSession() {
    if (!db.history.length) return null;
    return db.history.reduce((a, b) => ((b.endedAt || 0) > (a.endedAt || 0) ? b : a));
  }
  function lastCrewNames() {
    const s = lastSession();
    return new Set(s ? s.entries.map(e => e.name) : []);
  }
  function lastCrewIds() {
    const names = lastCrewNames();
    return db.roster.filter(f => names.has(f.name)).map(f => f.id);
  }

  function renderSetup() {
    // active session banner
    if (db.session) {
      resumeBanner.classList.remove('hidden');
      const total = db.session.members.reduce((s, m) => s + m.count, 0);
      resumeMeta.textContent = `${plural(db.session.members.length, 'fella')} · ${plural(total, 'beer')}`;
      startLabel.textContent = 'Start a new round';
    } else {
      resumeBanner.classList.add('hidden');
      startLabel.textContent = 'Start the round';
    }

    const pb = personalBestMap();
    const lastNames = lastCrewNames();
    rosterList.innerHTML = '';
    db.roster.forEach(f => {
      const on = selected.has(f.id);
      const li = document.createElement('li');
      li.className = 'roster-item' + (on ? ' on' : '');
      li.innerHTML = `
        <button class="check" type="button" aria-pressed="${on}" aria-label="Include in round">
          <svg viewBox="0 0 24 24"><use href="#i-check"></use></svg>
        </button>
        <span class="nm"></span>
        ${lastNames.has(f.name) ? '<span class="last-chip">last</span>' : ''}
        ${pb.has(f.name) ? `<span class="pb-chip"><svg viewBox="0 0 24 24"><use href="#i-trophy"></use></svg>${pb.get(f.name)}</span>` : ''}
        <button class="del" type="button" aria-label="Remove from roster">
          <svg viewBox="0 0 24 24"><use href="#i-trash"></use></svg>
        </button>`;
      li.querySelector('.nm').textContent = f.name;
      li.querySelector('.check').addEventListener('click', () => toggleSelected(f.id));
      li.querySelector('.del').addEventListener('click', () => removeFromRoster(f.id, f.name));
      rosterList.appendChild(li);
    });

    // "bring back last round's crew" quick-pick
    const crew = lastCrewIds();
    const allPicked = crew.length > 0 && crew.every(id => selected.has(id));
    lastCrewBtn.classList.toggle('hidden', crew.length === 0);
    lastCrewBtn.classList.toggle('done', allPicked);
    if (crew.length) {
      lastCrewLabel.textContent = allPicked
        ? `Last round's crew added · ${crew.length}`
        : `Bring back last round's crew · ${crew.length}`;
    }

    emptyHint.classList.toggle('hidden', db.roster.length > 0);
    const n = selected.size;
    selCount.textContent = n ? `${n} in round` : '';
    startBtn.disabled = n === 0;
  }

  function toggleSelected(id) {
    if (selected.has(id)) selected.delete(id); else selected.add(id);
    renderSetup();
  }

  function addToRoster(name) {
    name = name.trim();
    if (!name) return;
    const f = { id: uid(), name };
    db.roster.push(f);
    selected.add(f.id);
    save();
    renderSetup();
  }

  function removeFromRoster(id, name) {
    if (!confirm(`Remove ${name} from the roster?`)) return;
    db.roster = db.roster.filter(f => f.id !== id);
    selected.delete(id);
    save();
    renderSetup();
  }

  addForm.addEventListener('submit', (e) => {
    e.preventDefault();
    addToRoster(nameInput.value);
    nameInput.value = '';
    nameInput.focus();
  });

  resumeBanner.addEventListener('click', () => {
    if (!db.session) return;
    renderDashboard();
    show('dashboard');
  });

  startBtn.addEventListener('click', () => {
    if (!selected.size) return;
    if (db.session) {
      const ok = confirm('Finish the current round and save it to the Hall of Fame before starting a new one?');
      if (!ok) return;
      archiveSession();
    }
    const members = db.roster
      .filter(f => selected.has(f.id))
      .map(f => ({ id: f.id, name: f.name, count: 0 }));
    db.session = { id: uid(), startedAt: Date.now(), members };
    save();
    renderDashboard();
    show('dashboard');
  });

  lastCrewBtn.addEventListener('click', () => {
    lastCrewIds().forEach(id => selected.add(id));
    renderSetup();
  });

  hofBtn.addEventListener('click', () => { renderHistory(); show('history'); });

  // ================= DASHBOARD =================
  const MUG = '<svg viewBox="0 0 24 24"><use href="#i-mug"></use></svg>';

  const sessionMax = () => db.session.members.reduce((m, x) => Math.max(m, x.count), 0);

  function renderDashboard() {
    if (!db.session) { show('setup'); return; }
    tilesEl.innerHTML = '';
    db.session.members.forEach(m => tilesEl.appendChild(buildTile(m)));
    updateTotals();
    refreshLeaders();
  }

  function buildTile(m) {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.dataset.id = m.id;
    tile.innerHTML = `
      <div class="tile-top">
        <span class="tile-name"></span>
        <svg class="crown-badge hide" viewBox="0 0 24 24"><use href="#i-crown"></use></svg>
      </div>
      <div class="tile-count"><span class="count-num">0</span><span class="count-word">beers</span></div>
      <div class="count-mugs"></div>
      <div class="tile-foot">
        <button class="step-btn minus" type="button" aria-label="Remove one beer"><svg viewBox="0 0 24 24"><use href="#i-minus"></use></svg></button>
        <button class="step-btn plus" type="button" aria-label="Add one beer"><svg viewBox="0 0 24 24"><use href="#i-plus"></use></svg></button>
      </div>`;
    tile.querySelector('.tile-name').textContent = m.name;

    tile.addEventListener('click', (e) => {
      if (e.target.closest('.step-btn')) return;
      changeCount(m.id, +1, tile);
    });
    tile.querySelector('.plus').addEventListener('click', (e) => { e.stopPropagation(); changeCount(m.id, +1, tile); });
    tile.querySelector('.minus').addEventListener('click', (e) => { e.stopPropagation(); changeCount(m.id, -1, tile); });

    syncTile(tile, m);
    return tile;
  }

  function syncTile(tile, m) {
    tile.querySelector('.count-num').textContent = m.count;
    tile.querySelector('.count-word').textContent = m.count === 1 ? 'beer' : 'beers';
    const mugs = tile.querySelector('.count-mugs');
    const shown = Math.min(m.count, 6);
    mugs.innerHTML = MUG.repeat(shown) + (m.count > 6 ? `<span class="count-word">+${m.count - 6}</span>` : '');
  }

  function changeCount(id, delta, tile) {
    const m = db.session.members.find(x => x.id === id);
    if (!m) return;
    const next = m.count + delta;
    if (next < 0) return;
    m.count = next;
    save();
    syncTile(tile, m);
    if (delta > 0) {
      tile.classList.remove('bump'); void tile.offsetWidth; tile.classList.add('bump');
      floatPlus(tile); buzz(12);
    }
    updateTotals();
    refreshLeaders();
  }

  function floatPlus(tile) {
    const el = document.createElement('span');
    el.className = 'float';
    el.textContent = '+1';
    tile.appendChild(el);
    setTimeout(() => el.remove(), 700);
  }

  function updateTotals() {
    const total = db.session.members.reduce((s, m) => s + m.count, 0);
    totalLabel.textContent = plural(total, 'beer');
  }

  function refreshLeaders() {
    const top = sessionMax();
    tilesEl.querySelectorAll('.tile').forEach(tile => {
      const m = db.session.members.find(x => x.id === tile.dataset.id);
      const isLeader = top > 0 && m.count === top;
      tile.classList.toggle('leader', isLeader);
      tile.querySelector('.crown-badge').classList.toggle('hide', !isLeader);
    });
  }

  backBtn.addEventListener('click', () => { renderSetup(); show('setup'); });
  dashHofBtn.addEventListener('click', () => { renderHistory(); show('history'); });

  resetBtn.addEventListener('click', () => {
    if (!db.session.members.some(m => m.count > 0)) return;
    if (!confirm('Reset every count in this round back to zero?')) return;
    db.session.members.forEach(m => { m.count = 0; });
    save();
    renderDashboard();
    buzz(20);
  });

  function archiveSession() {
    if (!db.session) return;
    const entries = db.session.members.map(m => ({ name: m.name, count: m.count }));
    if (entries.some(e => e.count > 0)) {
      db.history.push({ id: db.session.id, startedAt: db.session.startedAt, endedAt: Date.now(), entries });
    }
    db.session = null;
    save();
  }

  finishBtn.addEventListener('click', () => {
    const any = db.session.members.some(m => m.count > 0);
    const msg = any
      ? 'Finish this round and save it to the Hall of Fame?'
      : 'No beers counted yet — close this round without saving?';
    if (!confirm(msg)) return;
    archiveSession();
    // start the next round from a clean slate — pick who's actually here
    selected = new Set();
    buzz(20);
    renderSetup();
    show('setup');
  });

  // ================= HALL OF FAME =================
  function allTimeBests() {
    // name -> { name, count, when } best single round across history + live
    const best = new Map();
    const consider = (name, count, when, live) => {
      if (count <= 0) return;
      const cur = best.get(name);
      if (!cur || count > cur.count) best.set(name, { name, count, when, live });
    };
    db.history.forEach(s => s.entries.forEach(e => consider(e.name, e.count, s.endedAt || s.startedAt, false)));
    if (db.session) db.session.members.forEach(m => consider(m.name, m.count, db.session.startedAt, true));
    return [...best.values()].sort((a, b) => b.count - a.count || a.when - b.when);
  }

  function renderHistory() {
    const bests = allTimeBests();

    // champion card
    if (bests.length) {
      const c = bests[0];
      champCard.classList.remove('empty');
      champCard.innerHTML = `
        <svg class="champ-crown" viewBox="0 0 24 24"><use href="#i-crown"></use></svg>
        <span class="champ-label">All-time champion</span>
        <span class="champ-name"></span>
        <span class="champ-stat"><strong>${c.count}</strong> ${c.count === 1 ? 'beer' : 'beers'} in one round</span>
        <span class="champ-when">${c.live ? 'happening now' : fmtDate(c.when)}</span>`;
      champCard.querySelector('.champ-name').textContent = c.name;
    } else {
      champCard.classList.add('empty');
      champCard.innerHTML = `
        <svg class="champ-crown" viewBox="0 0 24 24"><use href="#i-trophy"></use></svg>
        <span class="champ-label">No champion yet</span>
        <span class="champ-when">Finish a round to crown a legend.</span>`;
    }

    // leaderboard (personal best single round)
    leaderList.innerHTML = '';
    if (!bests.length) {
      leaderList.innerHTML = '<li class="empty-row">No beers logged yet.</li>';
    } else {
      bests.forEach((b, i) => {
        const li = document.createElement('li');
        li.className = 'leader-item' + (i < 3 ? ` medal m${i + 1}` : '');
        li.innerHTML = `
          <span class="rank">${i + 1}</span>
          <span class="leader-name"></span>
          <span class="leader-when">${b.live ? 'now' : fmtDate(b.when)}</span>
          <span class="leader-count">${b.count}<svg viewBox="0 0 24 24"><use href="#i-mug"></use></svg></span>`;
        li.querySelector('.leader-name').textContent = b.name;
        leaderList.appendChild(li);
      });
    }

    // sessions list (live first, then history newest-first)
    sessionList.innerHTML = '';
    if (db.session) sessionList.appendChild(sessionRow(liveSnapshot(), true));
    [...db.history].sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0)).forEach(s => {
      sessionList.appendChild(sessionRow(s, false));
    });
    if (!db.session && !db.history.length) {
      sessionList.innerHTML = '<li class="empty-row">No rounds saved yet.</li>';
    }
  }

  function liveSnapshot() {
    return {
      id: db.session.id,
      startedAt: db.session.startedAt,
      endedAt: null,
      entries: db.session.members.map(m => ({ name: m.name, count: m.count })),
    };
  }

  function sessionRow(s, live) {
    const total = s.entries.reduce((a, e) => a + e.count, 0);
    const winner = s.entries.reduce((w, e) => (!w || e.count > w.count ? e : w), null);
    const li = document.createElement('li');
    li.className = 'session-item' + (live ? ' live' : '');
    li.innerHTML = `
      <div class="session-main">
        <span class="session-date">${live ? '● In progress' : fmtDate(s.endedAt || s.startedAt)}</span>
        <span class="session-sub"></span>
      </div>
      <span class="session-total">${total}<svg viewBox="0 0 24 24"><use href="#i-mug"></use></svg></span>
      ${live ? '' : `<button class="del-session" type="button" aria-label="Delete session"><svg viewBox="0 0 24 24"><use href="#i-trash"></use></svg></button>`}`;
    const sub = winner && winner.count > 0
      ? `${winner.name} led with ${winner.count} · ${plural(s.entries.length, 'fella')}`
      : `${plural(s.entries.length, 'fella')} · no beers`;
    li.querySelector('.session-sub').textContent = sub;
    if (!live) {
      li.querySelector('.del-session').addEventListener('click', () => {
        if (!confirm('Delete this round from the Hall of Fame?')) return;
        db.history = db.history.filter(h => h.id !== s.id);
        save();
        renderHistory();
      });
    }
    return li;
  }

  histBackBtn.addEventListener('click', () => {
    if (lastScreen === 'dashboard' && db.session) { renderDashboard(); show('dashboard'); }
    else { renderSetup(); show('setup'); }
  });

  // ================= BOOT =================
  load();
  // Nobody is preselected by default: freshly added names auto-tick, and
  // returning fellas are chosen deliberately (or via "last round's crew").
  selected = new Set();
  renderSetup();
  if (db.session) { renderDashboard(); show('dashboard'); }
  else { show('setup'); }

  // ---------- service worker / PWA ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
