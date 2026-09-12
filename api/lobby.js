/* ==========================================================================
   Woordjacht — de lobby

   Er is er precies één. Niet als afspraak maar als constructie: de hele
   toestand zit in de ene variabele `ronde` hieronder, dus een tweede lobby
   kan niet ontstaan. Wie binnenkomt terwijl er gespeeld wordt sluit aan; is
   er niemand, dan begint er een nieuwe ronde.

   De server verstuurt geen raster en geen tegenstanders, alleen een zaadje.
   Elke browser leidt daar hetzelfde raster en dezelfde tegenstanders uit af.
   Dat scheelt niet alleen bandbreedte, het maakt afwijken onmogelijk: er is
   niets om uit de pas mee te lopen.

   De toestand staat in het geheugen, niet in Postgres. Een herstart beeindigt
   dus de lopende ronde, wat bij rondes van 90 seconden nauwelijks hindert.
   WEL van belang: dit werkt alleen bij een enkele instantie. Draait deze
   service ooit met meer replica's, dan krijgt elke replica zijn eigen lobby
   en is de belofte gebroken. Houd replicas op 1, of verhuis deze toestand
   naar Postgres.
   ========================================================================== */

'use strict';

const crypto = require('node:crypto');

/* Instelbaar, zodat de tests niet honderd seconden hoeven te wachten. In
   productie blijven deze ongezet en gelden de waarden hieronder. */
function uitOmgeving(naam, standaard) {
    const waarde = Number(process.env[naam]);
    return Number.isFinite(waarde) && waarde > 0 ? waarde : standaard;
}

const RONDE_MS = uitOmgeving('LOBBY_RONDE_MS', 90 * 1000);
const PAUZE_MS = uitOmgeving('LOBBY_PAUZE_MS', 10 * 1000);   /* scorebord tussen twee rondes */
const VERGETEN_MS = uitOmgeving('LOBBY_VERGETEN_MS', 12 * 1000);  /* niets gehoord = weg */
const MAX_NAAM = 14;

let ronde = null;
let rondeTeller = 0;

function nu() { return Date.now(); }

/* Namen komen van bezoekers, dus: geen stuurtekens, geen eindeloze lengte. */
function schoonNaam(naam) {
    const ruw = String(naam == null ? '' : naam);
    let uit = '';
    for (let i = 0; i < ruw.length && uit.length < MAX_NAAM; i++) {
        const code = ruw.charCodeAt(i);
        if (code >= 32 && code !== 127) uit += ruw.charAt(i);
    }
    return uit.trim() || 'Speler';
}

function nieuweRonde() {
    rondeTeller++;
    const gestartOp = nu();
    ronde = {
        id: 'r' + rondeTeller + '-' + crypto.randomBytes(4).toString('hex'),
        /* Het zaadje bepaalt bij iedereen hetzelfde raster en dezelfde bots. */
        zaad: crypto.randomBytes(8).toString('hex'),
        gestartOp: gestartOp,
        eindigtOp: gestartOp + RONDE_MS,
        pauzeTot: gestartOp + RONDE_MS + PAUZE_MS,
        spelers: new Map()
    };
    return ronde;
}

/* Vergeet wie al een tijd niets van zich heeft laten horen. */
function verversAanwezigheid() {
    if (!ronde) return;
    const grens = nu() - VERGETEN_MS;
    for (const paar of Array.from(ronde.spelers)) {
        if (paar[1].laatstGezien < grens) ronde.spelers.delete(paar[0]);
    }
}

/* De lopende ronde, of een nieuwe als de vorige helemaal is afgelopen.

   Let op de volgorde: eerst opruimen, dan pas beslissen. Een ronde waarvan
   ook de pauze voorbij is krijgt alleen een opvolger zolang er nog iemand is;
   anders zakt de lobby terug in slaap tot de volgende bezoeker. */
function huidigeRonde(startenAlsHetMoet) {
    verversAanwezigheid();

    if (!ronde) {
        return startenAlsHetMoet ? nieuweRonde() : null;
    }
    if (nu() >= ronde.pauzeTot) {
        if (startenAlsHetMoet || ronde.spelers.size > 0) return nieuweRonde();
        ronde = null;
        return null;
    }
    return ronde;
}

function faseVan(r) {
    if (!r) return 'leeg';
    return nu() < r.eindigtOp ? 'spelen' : 'scorebord';
}

function spelerslijst(r) {
    if (!r) return [];
    return Array.from(r.spelers.values())
        .map(function (s) {
            return {
                id: s.id,
                naam: s.naam,
                punten: s.punten,
                woorden: s.woorden,
                meegedaanVanaf: Math.max(0, Math.round((s.toegetreden - r.gestartOp) / 1000))
            };
        })
        .sort(function (a, b) { return b.punten - a.punten || a.naam.localeCompare(b.naam); });
}

function beeld(r, eigenId) {
    return {
        fase: faseVan(r),
        ronde: r ? {
            id: r.id,
            zaad: r.zaad,
            gestartOp: r.gestartOp,
            eindigtOp: r.eindigtOp,
            pauzeTot: r.pauzeTot
        } : null,
        spelers: spelerslijst(r),
        jij: eigenId || null,
        serverTijd: nu()
    };
}

/* ---- Openbare handelingen ------------------------------------------------ */

function meedoen(naam) {
    const r = huidigeRonde(true);
    const id = crypto.randomBytes(6).toString('hex');
    r.spelers.set(id, {
        id: id,
        naam: schoonNaam(naam),
        punten: 0,
        woorden: 0,
        toegetreden: nu(),
        laatstGezien: nu()
    });
    return beeld(r, id);
}

/* Een eindpunt draagt de hele ronde: het meldt je stand, houdt je
   aanwezigheid bij en geeft terug hoe iedereen er op dat moment voor staat.
   Loopt de ronde af terwijl er nog spelers zijn, dan rolt hij hier vanzelf
   door naar de volgende; daar is geen achtergrondtimer voor nodig. */
function stand(rondeId, spelerId, punten, woorden) {
    const r = huidigeRonde(false);
    if (!r) return beeld(null, null);

    /* Is de ronde inmiddels doorgerold, dan hoorde de speler bij de vorige.
       Hij krijgt de nieuwe ronde terug en schrijft zich daar opnieuw in. */
    if (r.id !== rondeId) return beeld(r, null);

    const speler = r.spelers.get(spelerId);
    if (!speler) return beeld(r, null);

    speler.punten = Math.max(0, Math.min(100000, Number(punten) || 0));
    speler.woorden = Math.max(0, Math.min(10000, Number(woorden) || 0));
    speler.laatstGezien = nu();
    return beeld(r, spelerId);
}

function kijken() {
    return beeld(huidigeRonde(false), null);
}

function vertrekken(rondeId, spelerId) {
    if (ronde && ronde.id === rondeId) ronde.spelers.delete(spelerId);
    return { ok: true };
}

/* Alleen voor tests: laat de lobby vergeten dat er ooit iets was. */
function wisAlles() { ronde = null; }

module.exports = {
    meedoen: meedoen,
    stand: stand,
    kijken: kijken,
    vertrekken: vertrekken,
    wisAlles: wisAlles,
    RONDE_MS: RONDE_MS,
    PAUZE_MS: PAUZE_MS
};
