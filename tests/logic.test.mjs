import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MOODS, discoverParams, includedOn, isSeen, mergeFilms, normalizeTitle, rankCandidates, ratingLabel, seenKeys,
} from '../js/logic.js';

const films = JSON.parse(readFileSync(new URL('../data/films.json', import.meta.url)));

test('history data is well formed', () => {
  const stati = new Set(['visto', 'interrotto', 'solo_pablo', 'solo_ilaria', 'gia_visto']);
  for (const f of films) {
    assert.ok(f.titolo, 'titolo mancante');
    assert.ok(stati.has(f.stato), `stato non valido: ${f.titolo}`);
    for (const k of ['pablo', 'ilaria', 'coppia']) {
      if (f[k] != null) assert.ok(f[k] >= 0 && f[k] <= 10, `${k} fuori scala: ${f.titolo}`);
    }
  }
});

test('normalizeTitle ignores accents, case and punctuation', () => {
  assert.equal(normalizeTitle("Dungeons & Dragons: L'onore dei ladri"), 'dungeons and dragons l onore dei ladri');
  assert.equal(normalizeTitle('Finché morte'), 'finche morte');
});

test('seen films are excluded by Italian or original title', () => {
  const keys = seenKeys(films);
  assert.ok(isSeen({ id: 1, title: 'Una notte da leoni', original_title: 'x' }, keys));
  assert.ok(isSeen({ id: 2, title: 'Qualcosa', original_title: 'The Hangover' }, keys));
  assert.ok(isSeen({ id: 3, title: 'Hit Man', original_title: 'Hit Man' }, keys), 'interrotti esclusi');
  assert.ok(!isSeen({ id: 4, title: 'Un film nuovo', original_title: 'A new film' }, keys));
});

test('rankCandidates drops seen and duplicate films and sorts by quality', () => {
  const keys = seenKeys([{ titolo: 'Visto' }]);
  const ranked = rankCandidates([
    { id: 1, title: 'Visto', vote_average: 9, vote_count: 9000 },
    { id: 2, title: 'Medio', vote_average: 6.8, vote_count: 3000 },
    { id: 3, title: 'Ottimo', vote_average: 7.9, vote_count: 3000 },
    { id: 3, title: 'Ottimo', vote_average: 7.9, vote_count: 3000 },
  ], keys);
  assert.deepEqual(ranked.map((m) => m.id), [3, 2]);
});

test('discover asks only for subscription titles in Italy', () => {
  const p = discoverParams(MOODS[0], ['netflix'], 2);
  assert.equal(p.watch_region, 'IT');
  assert.equal(p.with_watch_monetization_types, 'flatrate');
  assert.equal(p.with_watch_providers, '8|1796');
  assert.equal(p.page, '2');
  assert.equal(p.with_genres, '35');
});

test('includedOn reads flatrate providers only', () => {
  const r = { results: { IT: { flatrate: [{ provider_id: 119 }], rent: [{ provider_id: 8 }] } } };
  assert.deepEqual(includedOn(r), ['Prime Video']);
  assert.deepEqual(includedOn({ results: {} }), []);
});

test('ratingLabel distinguishes Pablo, Ilaria and shared ratings', () => {
  assert.equal(ratingLabel({ pablo: 8, ilaria: 7.5 }), 'P 8 · I 7,5');
  assert.equal(ratingLabel({ coppia: 7 }), '7');
});

test('mergeFilms lets new entries override and sorts by date', () => {
  const merged = mergeFilms([{ titolo: 'A', data: '2026-01-01' }, { titolo: 'B' }], [{ titolo: 'a', data: '2026-02-01', pablo: 7 }, { titolo: 'C', data: '2026-03-01' }]);
  assert.deepEqual(merged.map((f) => f.titolo), ['C', 'a', 'B']);
});
