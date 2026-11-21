const BASE = 'https://api.themoviedb.org/3';
export const IMG = 'https://image.tmdb.org/t/p/w342';

export class Tmdb {
  constructor(key) {
    this.key = (key || '').trim();
  }

  get ready() {
    return this.key.length > 0;
  }

  async get(path, params = {}) {
    const url = new URL(BASE + path);
    const headers = { accept: 'application/json' };
    // A v4 read access token is a JWT; a v3 API key is a short hex string.
    if (this.key.startsWith('eyJ')) headers.Authorization = `Bearer ${this.key}`;
    else url.searchParams.set('api_key', this.key);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(res.status === 401 ? 'Chiave TMDB non valida' : `TMDB ha risposto ${res.status}`);
    }
    return res.json();
  }

  discover(params) {
    return this.get('/discover/movie', params);
  }

  providers(id) {
    return this.get(`/movie/${id}/watch/providers`);
  }

  details(id) {
    return this.get(`/movie/${id}`, { language: 'it-IT' });
  }
}
