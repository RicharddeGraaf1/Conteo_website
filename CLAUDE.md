# elconteo (Conteo_website) — projectconventies

Kale statische site. Cloudflare Pages-project `elconteo`
(account `03d57417cb436aedb960d69079147d65`).

## Deploy — via GitHub Actions (niet handmatig)

Deploy gebeurt automatisch bij **push naar `main`** via
`.github/workflows/deploy.yml` (`cloudflare/wrangler-action` → `pages deploy .`).
De `CLOUDFLARE_API_TOKEN` staat in **GitHub Secrets**, NIET in de repo.

### Regels om een .env-lek te voorkomen
- **Nooit een `.env` met secrets in deze repo committen.** De deploy-token hoort
  in GitHub Secrets. `.gitignore` blokkeert `.env`.
- `.assetsignore` sluit `.env`/`.git`/`.github` uit van de Pages-upload als
  vangnet (de workflow draait `pages deploy .`, dat anders de hele map uploadt).
- Achtergrond: op zustersite **ponsenkaart.nl** lekte ooit de `.env` (met de
  Cloudflare-token) publiek doordat `wrangler pages deploy .` de hele map incl.
  `.env` uploadde. Deze repo heeft geen `.env` — houd dat zo.
- Na een deploy een steekproef: `curl https://elconteo.nl/.env` mag geen
  env-inhoud tonen (Pages geeft overal HTTP 200 — check de body, niet de status).
