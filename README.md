# Movie Picker

Una piccola web app per scegliere il film della sera per Pablo e Ilaria. Si usa dal telefono.

## Cosa fa

- **Stasera**: scegli un'atmosfera (Commedia da 8, Fantasy d'avventura, Horror-commedia, ecc.) e ricevi proposte che
  - sono **incluse** nell'abbonamento Netflix Italia o Prime Video Italia (niente noleggi), con dati JustWatch tramite TMDB;
  - **non avete già visto**: lo storico in `data/films.json` viene confrontato sia con il titolo italiano sia con quello originale.
- **Storico**: tutti i film visti, con i voti di Pablo (P), di Ilaria (I) o quello di coppia. Puoi cercare nella lista.
- **Profilo**: i gusti di coppia e di ciascuno (`data/profile.json`).
- Dopo la visione, **"Visto, dai il voto"** salva il film sul telefono. **Esporta films.json** scarica lo storico aggiornato, da caricare nel repository (o da mandare a Claude).

## Configurazione

Le proposte usano l'API gratuita di [TMDB](https://www.themoviedb.org/settings/api). Incolla la chiave (API key v3 o token di lettura v4) in **Impostazioni**: resta solo nel browser.

## Avvio in locale

```sh
npm start        # http://localhost:8080
npm test         # test della logica (Node 20+)
```

È un sito statico, senza build: si può pubblicare su GitHub Pages, Netlify o Vercel.
