import {
  MOODS, discoverParams, includedOn, mergeFilms, rankCandidates, seenKeys,
} from './logic.js';
import { IMG, Tmdb } from './tmdb.js';

const BACKDROP = 'https://image.tmdb.org/t/p/w780';
const SVG_NS = 'http://www.w3.org/2000/svg';

const store = {
  get(k, d) {
    try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; }
  },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ }
  },
};

const state = {
  base: [],
  profile: null,
  extra: store.get('mp.extra', []),
  platforms: store.get('mp.platforms', ['netflix', 'prime']),
  mood: null,
  tab: 'stasera',
  filter: 'insieme',
};

const $ = (s) => document.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'style') n.setAttribute('style', v);
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v === true) n.setAttribute(k, '');
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
  return n;
};

// Small stroke icons, built as DOM nodes from fixed path data.
const ICONS = {
  commedia: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M8.5 14.5c1 1.3 2.2 2 3.5 2s2.5-.7 3.5-2', 'M9 9.5h.01M15 9.5h.01'],
  fantasy: ['M14.5 4.5l5 5L9 20H4v-5z', 'M12.5 6.5l5 5'],
  horrorcomico: ['M6 20V10a6 6 0 0 1 12 0v10l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5z', 'M10 11h.01M14 11h.01'],
  scifi: ['M12 2c3 2.5 4.5 6 4.5 10L12 17l-4.5-5C7.5 8 9 4.5 12 2z', 'M7.5 12L5 15l2.5 1M16.5 12L19 15l-2.5 1', 'M12 9h.01'],
  animazione: ['M4 5h16v14H4z', 'M4 9h16M8 5v4M12 5v4M16 5v4'],
  sorprendimi: ['M12 3l2.4 5.6L20 9.3l-4.3 3.9 1.3 5.8L12 16l-5 3 1.3-5.8L4 9.3l5.6-.7z'],
};
function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(k, v);
  for (const d of ICONS[name] || ICONS.sorprendimi) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

const films = () => mergeFilms(state.base, state.extra);
const tmdb = () => new Tmdb(store.get('mp.key', ''));
const fmt = (n) => String(n).replace('.', ',');
const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

// ---- Header ----
function bulbs() {
  document.querySelectorAll('.bulbs').forEach((b) => b.replaceChildren(...Array.from({ length: 13 }, () => el('span'))));
}

function setTitle() {
  const together = films().filter((f) => f.stato === 'visto' || f.stato === 'gia_visto').length;
  const today = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric' });
  const titles = {
    stasera: ['Stasera in sala', `${today} · Pablo & Ilaria`],
    storico: [`${together} biglietti`, 'La vostra collezione'],
    profilo: ['I vostri gusti', 'Pablo & Ilaria'],
    impostazioni: ['Impostazioni', 'Movie Picker'],
  };
  const [t, s] = titles[state.tab];
  $('#page-title').textContent = t;
  $('#page-sub').textContent = s;
}

function showTab(tab) {
  state.tab = tab;
  document.querySelectorAll('nav button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.tab === tab)));
  document.querySelectorAll('main > section').forEach((s) => { s.hidden = s.id !== tab; });
  if (tab === 'storico') renderHistory();
  setTitle();
  window.scrollTo(0, 0);
}

// ---- Stasera ----
function renderControls() {
  $('#platforms').replaceChildren(...[['netflix', 'Netflix'], ['prime', 'Prime Video']].map(([id, label]) => el('label', { class: `pill-toggle ${id}` },
    el('input', {
      type: 'checkbox',
      checked: state.platforms.includes(id),
      onchange: (e) => {
        state.platforms = e.target.checked
          ? [...new Set([...state.platforms, id])] : state.platforms.filter((p) => p !== id);
        store.set('mp.platforms', state.platforms);
        if (state.mood) suggest();
      },
    }),
    el('span', { class: 'dot' }), label)));
  renderMoods();
}

function renderMoods() {
  $('#moods').replaceChildren(...MOODS.map((m) => el('button', {
    class: 'mood', 'aria-pressed': String(state.mood?.id === m.id), title: m.hint,
    onclick: () => { state.mood = m; renderMoods(); suggest(); },
  }, icon(m.id), m.label)));
}

async function suggest() {
  const out = $('#results');
  const api = tmdb();
  if (!api.ready) {
    out.replaceChildren(el('p', { class: 'notice' }, 'Per le proposte serve una chiave TMDB gratuita: aggiungila in ', el('a', { href: '#', onclick: (e) => { e.preventDefault(); showTab('impostazioni'); } }, 'Impostazioni'), '.'));
    return;
  }
  if (!state.platforms.length) {
    out.replaceChildren(el('p', { class: 'notice' }, 'Scegli almeno una piattaforma.'));
    return;
  }
  out.replaceChildren(el('div', { class: 'skeleton', 'aria-label': 'Caricamento' }));
  try {
    const pages = await Promise.all([1, 2, 3].map((p) => api.discover(discoverParams(state.mood, state.platforms, p))));
    const ranked = rankCandidates(pages.flatMap((p) => p.results || []), seenKeys(films()), 9);
    const withProviders = await Promise.all(ranked.map(async (m) => {
      try { return { ...m, on: includedOn(await api.providers(m.id)) }; } catch { return { ...m, on: [] }; }
    }));
    const shown = withProviders.filter((m) => m.on.length);
    if (!shown.length) {
      out.replaceChildren(el('p', { class: 'notice' }, 'Nessun film nuovo trovato per questa atmosfera. Provane un’altra.'));
      return;
    }
    const [first, ...rest] = shown;
    out.replaceChildren(ticket(first), ...rest.map(card));
  } catch (err) {
    out.replaceChildren(el('p', { class: 'notice' }, `Errore: ${err.message}`));
  }
}

const yearOf = (m) => (m.release_date || '').slice(0, 4);
const badges = (on) => on.map((p) => el('span', { class: `badge ${p === 'Netflix' ? 'netflix' : 'prime'}` }, p));

function seenButtons(m, primaryLabel) {
  const film = { titolo: m.title, originale: m.original_title, anno: Number(yearOf(m)) || undefined, tmdbId: m.id, piattaforma: m.on[0] };
  return [
    el('button', { onclick: () => openRate(film) }, primaryLabel),
    el('button', { class: 'ghost', onclick: () => markSeen({ ...film, stato: 'gia_visto' }) }, 'Già visto'),
  ];
}

function ticket(m) {
  const img = m.backdrop_path ? BACKDROP + m.backdrop_path : (m.poster_path ? IMG + m.poster_path : null);
  const top = el('div', { class: 'ticket-top' },
    el('span', { class: 'ticket-label' }, 'Il consiglio della serata'),
    el('h2', { class: 'ticket-title' }, m.title));
  if (img) top.style.backgroundImage = `url("${img}")`;
  return el('div', {},
    el('article', { class: 'ticket' },
      top,
      el('div', { class: 'tear', 'aria-hidden': 'true' }, el('span')),
      el('div', { class: 'ticket-stub' },
        el('div', { class: 'stub-grid' },
          el('div', {}, el('div', { class: 'stub-key' }, 'Sala'), el('div', { class: 'stub-val' }, m.on.join(' + '))),
          el('div', {}, el('div', { class: 'stub-key' }, 'Voto TMDB'), el('div', { class: 'stub-val' }, `★ ${fmt(m.vote_average.toFixed(1))}`)),
          el('div', {}, el('div', { class: 'stub-key' }, 'Anno'), el('div', { class: 'stub-val' }, yearOf(m) || '—'))),
        el('p', { class: 'stub-plot' }, m.overview || 'Trama non disponibile.'),
        el('div', { class: 'stub-foot' },
          el('span', { class: 'admit' }, 'Ingresso per due'),
          el('span', { class: 'barcode', 'aria-hidden': 'true' })))),
    el('div', { class: 'ticket-actions' }, seenButtons(m, 'Visto, strappa il biglietto')));
}

function card(m) {
  return el('article', { class: 'card' },
    m.poster_path ? el('img', { class: 'poster', src: IMG + m.poster_path, alt: '', loading: 'lazy' }) : el('div', { class: 'poster' }),
    el('div', { class: 'card-body' },
      el('h3', {}, m.title),
      el('div', { class: 'meta' }, el('span', { class: 'star' }, `★ ${fmt(m.vote_average.toFixed(1))}`), yearOf(m) ? `· ${yearOf(m)} ·` : '·', badges(m.on)),
      el('p', { class: 'plot' }, m.overview || 'Trama non disponibile.'),
      el('div', { class: 'actions' }, seenButtons(m, 'Visto'))));
}

// ---- Voto: timbra il biglietto ----
const SCALE = [5, 6, 7, 8, 9, 10];
const votes = { pablo: undefined, ilaria: undefined };

function renderScales() {
  document.querySelectorAll('.scale').forEach((box) => {
    const who = box.dataset.who;
    box.replaceChildren(...SCALE.map((n) => {
      const v = votes[who];
      const on = v != null && Math.floor(v) === n;
      return el('button', {
        type: 'button',
        'aria-pressed': String(on),
        'aria-label': `${who === 'pablo' ? 'Pablo' : 'Ilaria'} ${on && v % 1 ? fmt(v) : n}`,
        onclick: () => {
          // Tap once for n, again for n and a half (not above 10), a third time to clear.
          if (!on) votes[who] = n;
          else if (v === n && n < 10) votes[who] = n + 0.5;
          else votes[who] = undefined;
          renderScales();
        },
      }, on && v % 1 ? `${n}½` : String(n));
    }));
  });
}

function openRate(film) {
  const d = $('#rate');
  d.querySelector('h2').textContent = film.titolo;
  d.querySelector('form').reset();
  const today = new Date();
  d.querySelector('[name=data]').value = today.toISOString().slice(0, 10);
  $('#stamp-date').textContent = `${today.getDate()} · ${today.getMonth() + 1} · ${String(today.getFullYear()).slice(2)}`;
  votes.pablo = undefined;
  votes.ilaria = undefined;
  renderScales();
  d._film = film;
  d.showModal();
}

function saveRate(e) {
  e.preventDefault();
  const d = $('#rate');
  const f = new FormData(e.target);
  markSeen({
    ...d._film,
    stato: 'visto',
    data: f.get('data') || undefined,
    pablo: votes.pablo,
    ilaria: votes.ilaria,
    commento: f.get('commento') || undefined,
  });
  d.close();
}

function markSeen(film) {
  const clean = Object.fromEntries(Object.entries(film).filter(([, v]) => v !== undefined && v !== ''));
  state.extra = [clean, ...state.extra];
  store.set('mp.extra', state.extra);
  if (state.mood) suggest();
  setTitle();
  toast(`Biglietto timbrato: ${film.titolo}`);
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2500);
}

// ---- Storico ----
const FILTERS = [
  ['insieme', 'Insieme', (f) => f.stato === 'visto' || f.stato === 'gia_visto'],
  ['interrotti', 'Interrotti', (f) => f.stato === 'interrotto'],
  ['uno', 'Solo uno dei due', (f) => f.stato === 'solo_pablo' || f.stato === 'solo_ilaria'],
  ['tutti', 'Tutti', () => true],
];

function average(list, key) {
  const v = list.map((f) => f[key]).filter((x) => typeof x === 'number');
  return v.length ? fmt((v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)) : '—';
}

function renderHistory() {
  const all = films();
  $('#stats').replaceChildren(
    el('div', { class: 'seal p' }, el('b', {}, average(all, 'pablo')), el('span', {}, 'media Pablo')),
    el('div', { class: 'seal i' }, el('b', {}, average(all, 'ilaria')), el('span', {}, 'media Ilaria')),
    el('div', { class: 'seal n' }, el('b', {}, String(all.filter((f) => f.stato === 'interrotto').length)), el('span', {}, 'interrotti')));
  $('#filters').replaceChildren(...FILTERS.map(([id, label]) => el('button', {
    'aria-pressed': String(state.filter === id),
    onclick: () => { state.filter = id; renderHistory(); },
  }, label)));

  const test = FILTERS.find(([id]) => id === state.filter)[2];
  const q = $('#search').value.trim().toLowerCase();
  const list = all.filter(test).filter((f) => !q || `${f.titolo} ${f.originale || ''}`.toLowerCase().includes(q));
  $('#history').replaceChildren(...(list.length ? list.map(stub) : [el('p', { class: 'empty' }, 'Nessun film trovato.')]));
  $('#pending').hidden = state.extra.length === 0;
  const n = state.extra.length;
  $('#pending-text').textContent = n === 1 ? '1 biglietto segnato da questo telefono' : `${n} biglietti segnati da questo telefono`;
}

const STATO_SUB = { interrotto: 'Interrotto', solo_pablo: 'Visto solo da Pablo', solo_ilaria: 'Visto solo da Ilaria', gia_visto: 'Già visto' };

function stub(f) {
  const date = f.data ? f.data.split('-') : null;
  const scores = [
    f.pablo != null && el('span', { class: 'dot-score p', title: 'Pablo' }, fmt(f.pablo)),
    f.ilaria != null && el('span', { class: 'dot-score i', title: 'Ilaria' }, fmt(f.ilaria)),
    f.coppia != null && el('span', { class: 'dot-score c', title: 'Voto di coppia' }, fmt(f.coppia)),
  ];
  const sub = [STATO_SUB[f.stato], f.commento].filter(Boolean).join(' · ');
  return el('article', { class: 'stub' },
    date
      ? el('div', { class: 'stub-date' }, el('b', {}, String(Number(date[2]))), el('span', {}, MESI[Number(date[1]) - 1]))
      : el('div', { class: 'stub-date none' }, el('b', {}, f.anno ? String(f.anno) : '—')),
    el('div', { class: 'stub-main' },
      el('strong', {}, f.titolo, f.anno && date ? el('span', { class: 'year' }, ` ${f.anno}`) : null),
      sub ? el('div', { class: 'sub' }, sub) : null),
    el('div', { class: 'stub-scores' }, scores));
}

function exportJson() {
  const blob = new Blob([JSON.stringify(films(), null, 2) + '\n'], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: 'films.json' });
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---- Gusti ----
function renderProfile() {
  const p = state.profile;
  if (!p) return;
  const block = (title, items, cls = '') => el('div', { class: `panel ${cls}` }, el('h2', {}, title), el('ul', {}, items.map((i) => el('li', {}, i))));
  $('#profilo').replaceChildren(
    el('p', { class: 'notice lead' }, p.piattaforme),
    block('Insieme', p.insieme),
    el('div', { class: 'pair' }, block('Pablo', p.pablo, 'p'), block('Ilaria', p.ilaria, 'i')),
    block('Da evitare', p.evitare, 'x'));
}

// ---- Impostazioni ----
function initSettings() {
  const input = $('#key');
  input.value = store.get('mp.key', '');
  $('#settings-form').addEventListener('submit', (e) => {
    e.preventDefault();
    store.set('mp.key', input.value.trim());
    toast('Chiave salvata');
    if (state.mood) suggest();
  });
}

async function init() {
  bulbs();
  document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('#search').addEventListener('input', renderHistory);
  $('#export').addEventListener('click', exportJson);
  $('#rate form').addEventListener('submit', saveRate);
  $('#rate .cancel').addEventListener('click', () => $('#rate').close());
  initSettings();
  renderControls();
  const [base, profile] = await Promise.all([
    fetch('data/films.json').then((r) => r.json()),
    fetch('data/profile.json').then((r) => r.json()),
  ]);
  state.base = base;
  state.profile = profile;
  renderProfile();
  showTab(state.tab);
}

init();
