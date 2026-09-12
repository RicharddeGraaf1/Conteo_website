# woordjacht-api

Ranglijstdienst voor [elconteo.nl/woordjacht](https://elconteo.nl/woordjacht/).
Draait op Railway, met Postgres in hetzelfde Railway-project.

## Omgevingsvariabelen

Beide worden in Railway gezet, **nooit in deze repo**:

| Variabele | Waarde |
| --- | --- |
| `DATABASE_URL` | referentie naar de Postgres-service: `${{ Postgres.DATABASE_URL }}` |
| `WOORDJACHT_SECRET` | lange willekeurige tekenreeks; ondertekent de rondetokens |

`PORT` zet Railway zelf; de server luistert daarop.
`HERKOMST_EXTRA` is optioneel en alleen voor lokaal ontwikkelen
(bijvoorbeeld `http://localhost:8099`).

## Lokaal draaien

```sh
cd api && npm start
curl -s localhost:3000/gezond
```

## Stand van zaken

Casco. `/gezond` bewijst dat de service draait en zijn variabelen ziet.
De eindpunten voor het uitgeven van een ronde, het narekenen van een
inzending en de ranglijst volgen.
