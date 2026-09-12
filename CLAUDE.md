# elconteo (Conteo_website) — projectconventies

Kale statische site. Cloudflare Pages-project `elconteo`
(account `03d57417cb436aedb960d69079147d65`).

## Mappenindeling

- `public/` — **alles wat de website is.** Dit en niets anders wordt gedeployd.
- `api/` — de ranglijstdienst (Node, draait op Railway, niet op Pages).
- `tools/` — bouwgereedschap.
- Losse bestanden in de root (`CLAUDE.md`, workflows) horen bij het project,
  niet bij de site.

Zet nieuwe pagina's of assets dus in `public/`, anders komen ze niet online.

## Deploy — via GitHub Actions (niet handmatig)

Deploy gebeurt automatisch bij **push naar `main`** via
`.github/workflows/deploy.yml` (`cloudflare/wrangler-action` → `pages deploy public`).
De `CLOUDFLARE_API_TOKEN` staat in **GitHub Secrets**, NIET in de repo.

### Regels om een .env-lek te voorkomen
- **Nooit een `.env` met secrets in deze repo committen.** De deploy-token hoort
  in GitHub Secrets. `.gitignore` blokkeert `.env`.
- De echte bescherming is dat de workflow **alleen `public/` uploadt**. Wat
  buiten die map staat kán niet lekken, ook niet per ongeluk. Houd het zo:
  verander `pages deploy public` niet terug naar `pages deploy .`.
- **`.assetsignore` doet niets.** Dat bestand is een functie van Workers Static
  Assets, niet van `wrangler pages deploy`. Toen de workflow nog de hele root
  uploadde stonden `CLAUDE.md`, `.gitignore` en `.github/workflows/deploy.yml`
  gewoon publiek op de site, ondanks dat ze erin genoemd werden. Vertrouw er
  niet op; het bestand is alleen blijven staan omdat het nu niets meer kan doen.
- Achtergrond: op zustersite **ponsenkaart.nl** lekte ooit de `.env` (met de
  Cloudflare-token) publiek doordat `wrangler pages deploy .` de hele map incl.
  `.env` uploadde. Deze repo heeft geen `.env` — houd dat zo.
- Na een deploy een steekproef: `curl https://elconteo.nl/.env` mag geen
  env-inhoud tonen (Pages geeft overal HTTP 200 — check de body, niet de
  status). Datzelfde geldt voor `/CLAUDE.md` en `/api/server.js`.

### Cache

Cloudflare Pages geeft js en css standaard **vier uur** cache mee, terwijl de
HTML wel meteen ververst. Een bezoeker kreeg daardoor na een deploy nieuwe
HTML met oude javascript — wat zich uitte als onverklaarbare fouten die op
jouw machine niet te reproduceren waren.

`public/_headers` helpt daar maar half bij. Gemeten gedrag: de regel pakt wel
op html en op `.txt`, maar **Pages laat de Cache-Control van `.js` en `.css`
niet overschrijven** — die blijven op vier uur staan, ook bij een verse MISS.
Bij twee overlappende regels plakt Pages de waarden bovendien achter elkaar,
dus houd het bij die ene `/*`-regel.

Voor js en css is een versie-URL daarom de enige betrouwbare weg. De workflow
stempelt bij elke deploy de commit-hash achter de eigen `.js`- en
`.css`-verwijzingen in de HTML (absolute URL's blijven ongemoeid). Dat gaat
vanzelf: een stempel die je met de hand moet bijwerken wordt een keer
vergeten, en dan zoek je een fout die op je eigen machine niet bestaat.

Merk op dat dit ook de omgekeerde valkuil dekt: een fout die een bezoeker wel
ziet en jij niet, is vaak gewoon een oude cache.

## Woordjacht (`public/woordjacht/`)

Nederlands woordspel (4x4-raster, 90 seconden), volledig client-side.

- `public/woordjacht/woorden.txt` is **gegenereerd**, niet met de hand bewerkt.
  Opnieuw bouwen: `python3 tools/bouw-woordenlijst.py`. Bron is de
  OpenTaal-woordenlijst; `public/woordjacht/woorden-LICENSE.txt` moet ernaast blijven
  staan (licentievoorwaarde) en dus mee gedeployd worden.
- Punten = aantal letters per woord; DOEL is het maximum van dat raster, dus
  het percentage is vergelijkbaar tussen rasters.
- Het veld telt altijd 20 deelnemers: de speler plus 19 tegenstanders. Die
  tegenstanders kiezen echte woorden uit het opgeloste raster en vinden die op
  geplande tijdstippen, elk volgens een profiel (spurter, denker, gestaag,
  golver, laatkomer). Daardoor blijft de ranglijst tijdens de ronde schuiven.
  Bij samen spelen komen echte medespelers er bovenop, dus dan zijn het er
  meer dan 20. Bots halverwege een ronde wegnemen zou scores van het bord
  laten verdwijnen; dat is erger dan een veld van 22.
- **Samen spelen** loopt via `api/` (zie `api/README.md`). De server stuurt
  alleen een zaadje; elke browser leidt daar hetzelfde raster en dezelfde
  tegenstanders uit af. Alle willekeur loopt daarom via `zaadbareWillekeur`,
  niet via `Math.random` — nieuwe willekeur in het spel moet dat pad volgen,
  anders lopen browsers in een gedeelde ronde uit elkaar.
- `API_BASIS` boven in `woordjacht.js` wijst naar `https://api.elconteo.nl`
  (Railway). Leeg maken schakelt samen spelen uit; de knop verdwijnt dan en
  `Samen.vraag` weigert, zodat er nooit een verzoek naar de eigen site gaat.
- **Let op bij `hidden`:** de browser verbergt `[hidden]` via de
  useragent-stijl, en die verliest van elke auteursregel met een eigen
  `display`. `.knop { display: block }` maakte een verborgen knop daardoor
  gewoon zichtbaar. De stylesheet bevat nu `[hidden] { display: none
  !important }` — haal die regel niet weg.
