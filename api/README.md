# woordjacht-api

Ranglijstdienst voor [elconteo.nl/woordjacht](https://elconteo.nl/woordjacht/).
Draait op Coolify op de server `apps-1` (Hetzner): project `woordjacht`, app
`woordjacht-api`, gebouwd met Railpack uit deze map. Een push naar `main` deployt.
`api.elconteo.nl` wijst sinds 2026-10-27 naar `apps-1` (A-record, DNS only); het oude
Railway-project `woordjacht` wordt opgeheven. Zie c:/GIT/OCD/docs/railway-naar-hetzner-plan.md.

## Omgevingsvariabelen

Wordt in Coolify gezet, **nooit in deze repo**:

| Variabele | Waarde |
| --- | --- |
| `WOORDJACHT_SECRET` | lange willekeurige tekenreeks; ondertekent de rondetokens |

`DATABASE_URL` is niet nodig: de dienst gebruikt geen database (de lobby zit in
het geheugen). `/gezond` meldt daarom `database_gekoppeld: false`.

De server luistert op `PORT`, standaard 3000; Coolify stuurt verkeer naar 3000.
`HERKOMST_EXTRA` is optioneel en alleen voor lokaal ontwikkelen
(bijvoorbeeld `http://localhost:8099`).

## Lokaal draaien

```sh
cd api && npm start
curl -s localhost:3000/gezond
```

## Eindpunten

| | |
| --- | --- |
| `GET /gezond` | draait de service, en ziet hij zijn variabelen |
| `GET /samen/nu` | de lopende ronde, zonder mee te doen |
| `POST /samen/meedoen` | `{naam}` — sluit aan bij de lopende ronde, of opent er een |
| `POST /samen/stand` | `{rondeId, spelerId, punten, woorden}` — meldt je stand en haalt die van de anderen op |
| `POST /samen/vertrek` | `{rondeId, spelerId}` |

## De lobby

Er is er **precies één**, en dat is een constructie en geen afspraak: de hele
toestand zit in één variabele in `lobby.js`. Wie binnenkomt terwijl er
gespeeld wordt sluit aan; is er niemand, dan opent de nieuwkomer de lobby.

De server verstuurt **geen raster en geen tegenstanders**, alleen een zaadje.
Elke browser leidt daaruit hetzelfde raster en dezelfde tegenstanders af. Er
valt dus niets uit de pas te lopen.

> **Houd `replicas` op 1.** De lobbytoestand staat in het geheugen. Bij meer
> instanties krijgt elke instantie zijn eigen lobby en is de belofte gebroken.
> Moet het ooit schalen, verhuis die toestand dan eerst naar Postgres.

Een herstart beëindigt de lopende ronde. Bij rondes van 90 seconden is dat
nauwelijks hinderlijk.

## Tests

```sh
node api/lobby.test.js
```

## Nog te bouwen

Het narekenen van inzendingen (de server lost het raster zelf op en gelooft
de score uit de browser nooit), spelers met naam en herstelcode, en de
geschiedenispagina. Daarvoor is Postgres nodig; de lobby hierboven niet.
