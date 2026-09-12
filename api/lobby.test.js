/* Tests voor de lobby. Draaien met: node api/lobby.test.js
   De rondeduren worden kort gezet, anders duurt elke test anderhalve minuut. */

'use strict';

process.env.LOBBY_RONDE_MS = '400';
process.env.LOBBY_PAUZE_MS = '150';
process.env.LOBBY_VERGETEN_MS = '250';

const lobby = require('./lobby');

let goed = 0;
const fouten = [];

function check(naam, waar, extra) {
    if (waar) { goed++; console.log('OK   ' + naam + (extra ? ' - ' + extra : '')); }
    else { fouten.push('FOUT ' + naam + (extra ? ' - ' + extra : '')); console.log('FOUT ' + naam + (extra ? ' - ' + extra : '')); }
}

function wacht(ms) { return new Promise(function (k) { setTimeout(k, ms); }); }

async function main() {
    /* ---- 1. De eerste speler opent de lobby ---- */
    lobby.wisAlles();
    const leeg = lobby.kijken();
    check('lobby is leeg zolang niemand speelt', leeg.fase === 'leeg' && leeg.ronde === null);

    const a = lobby.meedoen('Richard');
    check('eerste speler start een ronde', a.fase === 'spelen' && !!a.ronde && !!a.ronde.zaad);

    /* ---- 2. Iedereen daarna sluit aan bij diezelfde ronde ---- */
    const b = lobby.meedoen('Sanne');
    const c = lobby.meedoen('Joost');
    check('tweede speler krijgt dezelfde ronde', b.ronde.id === a.ronde.id, a.ronde.id);
    check('en hetzelfde zaadje, dus hetzelfde raster', b.ronde.zaad === a.ronde.zaad && c.ronde.zaad === a.ronde.zaad);
    check('spelers zien elkaar', c.spelers.length === 3, c.spelers.map(function (s) { return s.naam; }).join(', '));

    /* ---- 3. Geen parallelle lobbies, ook niet bij een toeloop ineens ---- */
    const ids = new Set();
    for (let i = 0; i < 50; i++) ids.add(lobby.meedoen('speler' + i).ronde.id);
    check('50 spelers tegelijk leveren nog steeds een ronde', ids.size === 1 && ids.has(a.ronde.id),
        ids.size + ' unieke ronde-id(s)');

    /* ---- 4. Standen ---- */
    const na = lobby.stand(a.ronde.id, a.jij, 42, 9);
    const ik = na.spelers.find(function (s) { return s.id === a.jij; });
    check('stand wordt bijgewerkt', ik && ik.punten === 42 && ik.woorden === 9);
    check('ranglijst staat op punten gesorteerd', na.spelers[0].id === a.jij, na.spelers[0].naam);

    const verzonnen = lobby.stand('bestaat-niet', a.jij, 999, 99);
    check('onbekende ronde-id schrijft geen punten',
        verzonnen.ronde.id === a.ronde.id && verzonnen.jij === null);
    const nogSteeds = lobby.kijken().spelers.find(function (s) { return s.id === a.jij; });
    check('  en laat de oude stand staan', nogSteeds.punten === 42, String(nogSteeds.punten));

    /* ---- 5. Namen worden geschoond ---- */
    const raar = lobby.meedoen('   ' + String.fromCharCode(7) + 'Heel lange naam die afgekapt hoort te worden   ');
    const raarNaam = raar.spelers.find(function (s) { return s.id === raar.jij; }).naam;
    check('naam wordt afgekapt en ontdaan van stuurtekens',
        raarNaam.length <= 14 && raarNaam.indexOf(String.fromCharCode(7)) === -1, JSON.stringify(raarNaam));
    check('lege naam wordt Speler', lobby.meedoen('').spelers.some(function (s) { return s.naam === 'Speler'; }));

    /* ---- 6 t/m 9. Een speler die aanwezig blijft, zoals een echte client ----
       De client pingt elke paar seconden; blijft dat uit, dan wordt hij
       vergeten. In de test doen we hetzelfde, alleen sneller. Rolt de ronde
       door, dan raakt de speler-id van de vorige ronde ongeldig en schrijft
       de client zich opnieuw in -- precies wat de echte client ook moet doen. */
    function levendeSpeler(naam) {
        const toestand = { rondeId: null, spelerId: null, laatsteBeeld: null };
        const beeld = lobby.meedoen(naam);
        toestand.rondeId = beeld.ronde.id;
        toestand.spelerId = beeld.jij;
        toestand.laatsteBeeld = beeld;
        toestand.klok = setInterval(function () {
            const b = lobby.stand(toestand.rondeId, toestand.spelerId, 42, 9);
            if (b.ronde && b.jij === null) {
                /* ronde doorgerold: opnieuw inschrijven */
                const nieuw = lobby.meedoen(naam);
                toestand.rondeId = nieuw.ronde.id;
                toestand.spelerId = nieuw.jij;
                toestand.laatsteBeeld = nieuw;
            } else {
                toestand.laatsteBeeld = b;
            }
        }, 60);
        toestand.stop = function () { clearInterval(toestand.klok); };
        return toestand;
    }

    lobby.wisAlles();
    const blijver = levendeSpeler('Blijver');
    const eersteRonde = blijver.rondeId;

    await wacht(450);
    check('na de speeltijd volgt het scorebord', lobby.kijken().fase === 'scorebord');

    await wacht(250);
    check('ronde rolt door zolang er iemand speelt', blijver.rondeId !== eersteRonde,
        eersteRonde + ' -> ' + blijver.rondeId);
    check('nieuwe ronde heeft een nieuw zaadje',
        blijver.laatsteBeeld.ronde.zaad !== null && blijver.laatsteBeeld.ronde.id === blijver.rondeId);
    check('  en er is er nog steeds maar een', lobby.kijken().ronde.id === blijver.rondeId);
    blijver.stop();

    /* ---- Zonder spelers zakt de lobby in slaap ---- */
    lobby.wisAlles();
    lobby.meedoen('Eenzaam');
    await wacht(800);                         /* ronde + pauze + vergeettijd voorbij */
    const slaap = lobby.kijken();
    check('zonder spelers zakt de lobby in slaap', slaap.fase === 'leeg' && slaap.ronde === null);

    /* ---- En wordt door de volgende bezoeker weer geopend ---- */
    const opnieuw = lobby.meedoen('Nieuwkomer');
    check('volgende bezoeker opent de lobby weer', opnieuw.fase === 'spelen' && !!opnieuw.ronde);

    /* ---- Laat binnenkomen wordt vastgelegd ---- */
    await wacht(120);
    const laat = lobby.meedoen('Laatkomer');
    const laatRij = laat.spelers.find(function (s) { return s.id === laat.jij; });
    check('laat toetreden wordt vastgelegd', laatRij.meegedaanVanaf >= 0, laatRij.meegedaanVanaf + ' s');
    check('  en de laatkomer speelt hetzelfde raster', laat.ronde.zaad === opnieuw.ronde.zaad);

    console.log('');
    if (fouten.length) { console.log(fouten.length + ' van de ' + (goed + fouten.length) + ' controles mislukt.'); process.exit(1); }
    console.log('Alle ' + goed + ' controles geslaagd.');
    process.exit(0);
}

main();
