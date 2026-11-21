import {
  MOODS, discoverParams, includedOn, mergeFilms, rankCandidates, ratingLabel, seenKeys,
} from './logic.js';
import { IMG, Tmdb } from './tmdb.js';

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
};

const $ = (s) => document.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null) n.append(c);
  return n;
};

const films = () => mergeFilms(state.base, state.extra);
const tmdb = () => new Tmdb(store.get('mp.key', ''));

function showTab(tab) {
  state.tab = tab;
  document.querySelectorAll('nav button').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === tab));
  document.querySelectorAll('main > section').forEach((s) => { s.hidden = s.id !== tab; });
  if (tab === 'storico') renderHistory();
}

// ---- Stasera ----
function renderMoods() {
  const box = $('#moods');
  box.replaceChildren(...MOODS.map((m) => el('button', {
    class: 'chip', 'aria-pressed': state.mood?.id === m.id, title: m.hint,
    onclick: () => { state.mood = m; renderMoods(); suggest(); },
  }, m.label)));
  const plat = $('#platforms');
  plat.replaceChildren(...[['netflix', 'Netflix'], ['prime', 'Prime Video']].map(([id, label]) => el('label', { class: 'toggle' },
    el('input', {
      type: 'checkbox', checked: state.platforms.includes(id) ? '' : false,
      onchange: (e) => {
        state.platforms = e.target.checked
          ? [...new Set([...state.platforms, id])] : state.platforms.filter((p) => p !== id);
        store.set('mp.platforms', state.platforms);
        if (state.mood) suggest();
      },
    }), label)));
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
  out.replaceChildren(el('p', { class: 'muted' }, 'Cerco film inclusi negli abbonamenti…'));
  try {
    const pages = await Promise.all([1, 2, 3].map((p) => api.discover(discoverParams(state.mood, state.platforms, p))));
    const ranked = rankCandidates(pages.flatMap((p) => p.results || []), seenKeys(films()), 9);
    if (!ranked.length) {
      out.replaceChildren(el('p', { class: 'notice' }, 'Nessun film nuovo trovato per questo genere.'));
      return;
    }
    const withProviders = await Promise.all(ranked.map(async (m) => {
      try { return { ...m, on: includedOn(await api.providers(m.id)) }; } catch { return { ...m, on: [] }; }
    }));
    out.replaceChildren(...withProviders.filter((m) => m.on.length).map(card));
  } catch (err) {
    out.replaceChildren(el('p', { class: 'notice' }, `Errore: ${err.message}`));
  }
}

function card(m) {
  const year = (m.release_date || '').slice(0, 4);
  return el('article', { class: 'card' },
    m.poster_path ? el('img', { src: IMG + m.poster_path, alt: '', loading: 'lazy' }) : el('div', { class: 'poster-empty' }),
    el('div', { class: 'card-body' },
      el('h3', {}, m.title, year ? el('span', { class: 'muted' }, ` (${year})`) : null),
      el('p', { class: 'meta' }, `★ ${m.vote_average.toFixed(1)} · `, m.on.join(' + ')),
      el('p', { class: 'plot' }, m.overview || 'Trama non disponibile.'),
      el('div', { class: 'actions' },
        el('button', { onclick: () => openRate({ titolo: m.title, originale: m.original_title, anno: Number(year) || undefined, tmdbId: m.id, piattaforma: m.on[0] }) }, 'Visto, dai il voto'),
        el('button', { class: 'ghost', onclick: () => markSeen({ titolo: m.title, originale: m.original_title, tmdbId: m.id, stato: 'gia_visto' }) }, 'Già visto'))));
}

// ---- Voti ----
function openRate(film) {
  const d = $('#rate');
  d.querySelector('h2').textContent = film.titolo;
  d.querySelector('form').reset();
  d.querySelector('[name=data]').value = new Date().toISOString().slice(0, 10);
  d._film = film;
  d.showModal();
}

function readNum(v) {
  if (!v) return undefined;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

function saveRate(e) {
  e.preventDefault();
  const d = $('#rate');
  const f = new FormData(e.target);
  markSeen({
    ...d._film,
    stato: 'visto',
    data: f.get('data') || undefined,
    pablo: readNum(f.get('pablo')),
    ilaria: readNum(f.get('ilaria')),
    commento: f.get('commento') || undefined,
  });
  d.close();
}

function markSeen(film) {
  const clean = Object.fromEntries(Object.entries(film).filter(([, v]) => v !== undefined && v !== ''));
  state.extra = [clean, ...state.extra];
  store.set('mp.extra', state.extra);
  if (state.mood) suggest();
  toast(`Segnato: ${film.titolo}`);
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2500);
}

// ---- Storico ----
const STATI = { visto: 'Visti insieme', interrotto: 'Interrotti', solo_pablo: 'Solo Pablo', solo_ilaria: 'Solo Ilaria', gia_visto: 'Già visti' };

function renderHistory() {
  const q = $('#search').value.trim().toLowerCase();
  const list = films().filter((f) => !q || `${f.titolo} ${f.originale || ''}`.toLowerCase().includes(q));
  const groups = Object.keys(STATI).map((s) => [s, list.filter((f) => f.stato === s)]).filter(([, l]) => l.length);
  $('#history').replaceChildren(...groups.map(([s, l]) => el('div', {},
    el('h2', {}, `${STATI[s]} `, el('span', { class: 'muted' }, `(${l.length})`)),
    el('ul', { class: 'list' }, l.map((f) => el('li', {},
      el('div', { class: 'row' },
        el('strong', {}, f.titolo),
        f.anno ? el('span', { class: 'muted' }, ` ${f.anno}`) : null,
        el('span', { class: 'score' }, ratingLabel(f))),
      f.commento || f.data ? el('div', { class: 'muted small' }, [f.data ? formatDate(f.data) : null, f.commento].filter(Boolean).join(' · ')) : null))))));
  $('#pending').hidden = state.extra.length === 0;
  $('#pending-count').textContent = state.extra.length;
}

function formatDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function exportJson() {
  const blob = new Blob([JSON.stringify(films(), null, 2) + '\n'], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: 'films.json' });
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---- Profilo ----
function renderProfile() {
  const p = state.profile;
  if (!p) return;
  const block = (title, items) => el('div', { class: 'panel' }, el('h2', {}, title), el('ul', {}, items.map((i) => el('li', {}, i))));
  $('#profilo').replaceChildren(
    el('p', { class: 'notice' }, p.piattaforme),
    block('Insieme', p.insieme), block('Ilaria', p.ilaria), block('Pablo', p.pablo), block('Da evitare', p.evitare));
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
  document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('#search').addEventListener('input', renderHistory);
  $('#export').addEventListener('click', exportJson);
  $('#rate form').addEventListener('submit', saveRate);
  $('#rate .cancel').addEventListener('click', () => $('#rate').close());
  initSettings();
  renderMoods();
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
