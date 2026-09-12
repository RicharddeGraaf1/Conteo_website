/* ==========================================================================
   Woordjacht — ranglijstdienst
   Draait op Railway; de site zelf staat op Cloudflare Pages.

   Dit is bewust nog een casco: genoeg om te bewijzen dat de service bouwt,
   luistert, bereikbaar is en zijn omgevingsvariabelen ziet. De echte
   eindpunten (ronde uitgeven, inzending narekenen, ranglijst) komen hierna.

   Geen afhankelijkheden, zodat er bij de eerste deploy niets te installeren
   valt en er dus ook niets mis kan gaan.
   ========================================================================== */

'use strict';

const http = require('node:http');

const POORT = process.env.PORT || 3000;

/* Alleen de eigen site mag deze dienst aanroepen. Tijdens het bouwen mag
   localhost erbij; zet HERKOMST_EXTRA verder nooit open op '*'. */
const TOEGESTANE_HERKOMST = [
    'https://elconteo.nl',
    'https://www.elconteo.nl'
].concat((process.env.HERKOMST_EXTRA || '').split(',').filter(Boolean));

function zetKoppen(verzoek, antwoord) {
    const herkomst = verzoek.headers.origin;
    if (herkomst && TOEGESTANE_HERKOMST.indexOf(herkomst) !== -1) {
        antwoord.setHeader('Access-Control-Allow-Origin', herkomst);
        antwoord.setHeader('Vary', 'Origin');
    }
    antwoord.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    antwoord.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    antwoord.setHeader('Cache-Control', 'no-store');
}

function stuur(antwoord, code, gegevens) {
    const body = JSON.stringify(gegevens, null, 2);
    antwoord.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    antwoord.end(body);
}

const server = http.createServer((verzoek, antwoord) => {
    zetKoppen(verzoek, antwoord);

    if (verzoek.method === 'OPTIONS') {
        antwoord.writeHead(204);
        antwoord.end();
        return;
    }

    const pad = new URL(verzoek.url, 'http://x').pathname;

    if (pad === '/' || pad === '/gezond') {
        /* Alleen ja/nee over de instellingen: de waarden zelf horen nergens
           in een antwoord, log of scherm terecht te komen. */
        stuur(antwoord, 200, {
            dienst: 'woordjacht-api',
            versie: require('./package.json').version,
            status: 'ok',
            database_gekoppeld: Boolean(process.env.DATABASE_URL),
            geheim_gezet: Boolean(process.env.WOORDJACHT_SECRET),
            node: process.version,
            tijd: new Date().toISOString()
        });
        return;
    }

    stuur(antwoord, 404, { fout: 'onbekend pad', pad: pad });
});

server.listen(POORT, () => {
    console.log(`woordjacht-api luistert op poort ${POORT}`);
    console.log(`  database gekoppeld : ${Boolean(process.env.DATABASE_URL)}`);
    console.log(`  geheim gezet       : ${Boolean(process.env.WOORDJACHT_SECRET)}`);
});
