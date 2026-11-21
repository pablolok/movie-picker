// Pure logic, shared by the browser app and the Node tests.

export const PROVIDERS = {
  netflix: [8, 1796],
  prime: [119, 2100],
};

export const MOODS = [
  {
    id: 'commedia',
    label: 'Commedia da 8',
    hint: 'Deve far ridere davvero, metro Una notte da leoni',
    withGenres: '35',
    withoutGenres: '16,10751,99,18',
    minVote: 6.6,
    minVotes: 1500,
  },
  {
    id: 'fantasy',
    label: "Fantasy d'avventura",
    hint: 'Alla D&D L’onore dei ladri, Red One, Slumberland',
    withGenres: '14|12',
    withoutGenres: '27,99',
    minVote: 6.6,
    minVotes: 1000,
  },
  {
    id: 'horrorcomico',
    label: 'Horror-commedia',
    hint: 'Atmosfera senza troppi jump scare',
    withGenres: '27,35',
    withoutGenres: '99',
    minVote: 6.2,
    minVotes: 500,
  },
  {
    id: 'scifi',
    label: 'Fantascienza originale',
    hint: 'Premessa forte, alla Project Hail Mary',
    withGenres: '878',
    withoutGenres: '27,99,16',
    minVote: 6.9,
    minVotes: 1500,
  },
  {
    id: 'animazione',
    label: 'Animazione da adulti',
    hint: 'Alla La sposa cadavere',
    withGenres: '16',
    withoutGenres: '99',
    minVote: 7.2,
    minVotes: 1000,
  },
  {
    id: 'sorprendimi',
    label: 'Sorprendimi',
    hint: 'I più apprezzati inclusi negli abbonamenti',
    withGenres: '',
    withoutGenres: '99,10752,10770,10402',
    minVote: 7.2,
    minVotes: 2000,
  },
];

export function normalizeTitle(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Titles the couple should not be offered again: anything watched together,
// anything abandoned, and films one of them has already seen.
export function seenKeys(films) {
  const keys = new Set();
  for (const f of films) {
    for (const t of [f.titolo, f.originale]) {
      if (t) keys.add(normalizeTitle(t));
    }
    if (f.tmdbId) keys.add(`id:${f.tmdbId}`);
  }
  return keys;
}

export function isSeen(movie, keys) {
  if (keys.has(`id:${movie.id}`)) return true;
  return [movie.title, movie.original_title].some(
    (t) => t && keys.has(normalizeTitle(t)),
  );
}

export function score(movie) {
  const votes = Math.max(1, movie.vote_count || 1);
  return (movie.vote_average || 0) * 10 + Math.log10(votes) * 4;
}

export function rankCandidates(movies, keys, limit = 12) {
  const seenIds = new Set();
  return movies
    .filter((m) => {
      if (seenIds.has(m.id)) return false;
      seenIds.add(m.id);
      return !isSeen(m, keys);
    })
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit);
}

export function discoverParams(mood, platforms, page = 1) {
  const ids = platforms.flatMap((p) => PROVIDERS[p] || []);
  const params = {
    language: 'it-IT',
    region: 'IT',
    watch_region: 'IT',
    with_watch_providers: ids.join('|'),
    with_watch_monetization_types: 'flatrate',
    sort_by: 'vote_average.desc',
    'vote_average.gte': String(mood.minVote),
    'vote_count.gte': String(mood.minVotes),
    include_adult: 'false',
    page: String(page),
  };
  if (mood.withGenres) params.with_genres = mood.withGenres;
  if (mood.withoutGenres) params.without_genres = mood.withoutGenres;
  return params;
}

// Which of the couple's platforms include the film in the subscription (IT).
export function includedOn(providersResult) {
  const it = providersResult?.results?.IT;
  const flat = it?.flatrate || [];
  const out = [];
  if (flat.some((p) => PROVIDERS.netflix.includes(p.provider_id))) out.push('Netflix');
  if (flat.some((p) => PROVIDERS.prime.includes(p.provider_id))) out.push('Prime Video');
  return out;
}

export function ratingLabel(f) {
  const parts = [];
  if (f.pablo != null) parts.push(`P ${fmt(f.pablo)}`);
  if (f.ilaria != null) parts.push(`I ${fmt(f.ilaria)}`);
  if (f.coppia != null) parts.push(`${fmt(f.coppia)}`);
  return parts.join(' · ');
}

function fmt(n) {
  return String(n).replace('.', ',');
}

export function mergeFilms(base, extra) {
  const byKey = new Map();
  for (const f of [...extra, ...base]) {
    const k = normalizeTitle(f.titolo);
    if (!byKey.has(k)) byKey.set(k, f);
  }
  return [...byKey.values()].sort((a, b) =>
    String(b.data || '').localeCompare(String(a.data || '')),
  );
}
