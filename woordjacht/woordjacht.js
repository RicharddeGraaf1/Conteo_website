/* ==========================================================================
   Woordjacht — elconteo.nl
   Vind in 90 seconden zoveel mogelijk Nederlandse woorden in een 4x4-raster.
   Alles draait in de browser: na het laden van het woordenboek is er geen
   enkel netwerkverzoek meer. Geen advertenties, geen trackers, geen account.
   ========================================================================== */

(function () {
    'use strict';

    /* ---------------------------------------------------------------- *
     * Instellingen                                                      *
     * ---------------------------------------------------------------- */

    var ZIJDE = 4;
    var VAKKEN = ZIJDE * ZIJDE;
    var RONDE_SECONDEN = 90;
    var MIN_LENGTE = 3;
    var AANTAL_BOTS = 5;

    /* Letterpot van 96 stenen, gewogen naar de Nederlandse letterfrequentie.
       34 klinkers op 96 stenen geeft gemiddeld bijna zes klinkers per raster.
       Q en X ontbreken: in een 4x4-raster leveren die vrijwel nooit iets op. */
    var LETTERPOT = (function () {
        var verdeling = {
            e: 12, a: 7, i: 6, o: 6, u: 3,
            n: 7, t: 5, r: 6, d: 4, s: 5, l: 4, g: 4, v: 3, h: 3, k: 3,
            m: 3, b: 2, p: 2, w: 2, j: 2, z: 2, c: 2, f: 2, y: 1
        };
        var pot = [];
        for (var letter in verdeling) {
            for (var i = 0; i < verdeling[letter]; i++) pot.push(letter);
        }
        return pot;
    })();

    var KLINKERS = 'aeiouy';

    /* Vaardigheid van de tegenstanders. Zie maakBots(): het getal wordt
       vermenigvuldigd met de wortel van het aantal vindbare woorden. */
    var NIVEAUS = {
        makkelijk: { naam: 'Makkelijk', laag: 1.0, hoog: 1.9 },
        normaal: { naam: 'Normaal', laag: 1.8, hoog: 2.9 },
        lastig: { naam: 'Lastig', laag: 2.7, hoog: 4.0 },
        meester: { naam: 'Meester', laag: 3.8, hoog: 5.6 }
    };

    var BOTNAMEN = [
        'Sanne', 'Joost', 'Fatima', 'Bram', 'Nienke', 'Youssef', 'Maarten', 'Lotte',
        'Ruben', 'Anouk', 'Pieter', 'Eva', 'Daan', 'Merel', 'Tijn', 'Hugo', 'Sam',
        'Noor', 'Jasper', 'Isa', 'Willem', 'Fenna', 'Bas', 'Julia', 'Sven', 'Roos'
    ];

    /* Buurvakken (inclusief diagonaal), eenmalig uitgerekend. */
    var BUREN = (function () {
        var alle = [];
        for (var i = 0; i < VAKKEN; i++) {
            var rij = Math.floor(i / ZIJDE), kol = i % ZIJDE, lijst = [];
            for (var dr = -1; dr <= 1; dr++) {
                for (var dk = -1; dk <= 1; dk++) {
                    if (dr === 0 && dk === 0) continue;
                    var r = rij + dr, k = kol + dk;
                    if (r >= 0 && r < ZIJDE && k >= 0 && k < ZIJDE) lijst.push(r * ZIJDE + k);
                }
            }
            alle.push(lijst);
        }
        return alle;
    })();

    /* ---------------------------------------------------------------- *
     * Woordenboek                                                       *
     *                                                                   *
     * woorden.txt is front-gecodeerd: elke regel begint met één teken    *
     * dat aangeeft hoeveel letters de regel deelt met de vorige. Na het  *
     * decoderen houden we alles in één lange string plus twee typed      *
     * arrays (beginposities en lettermaskers). Dat scheelt tientallen    *
     * megabytes ten opzichte van een array met 218.000 losse strings.    *
     * ---------------------------------------------------------------- */

    var Woordenboek = {
        blok: '',
        begin: null,
        maskers: null,
        aantal: 0,

        ontleed: function (tekst) {
            var regels = tekst.split('\n');
            var n = regels.length;
            var woorden = new Array(n);
            var begin = new Uint32Array(n + 1);
            var maskers = new Uint32Array(n);
            var vorige = '', positie = 0;

            for (var i = 0; i < n; i++) {
                var regel = regels[i];
                var gedeeld = regel.charCodeAt(0) - 48;
                var woord = vorige.slice(0, gedeeld) + regel.slice(1);
                vorige = woord;
                woorden[i] = woord;
                begin[i] = positie;
                positie += woord.length + 1;

                var masker = 0;
                for (var k = 0; k < woord.length; k++) {
                    masker |= 1 << (woord.charCodeAt(k) - 97);
                }
                maskers[i] = masker;
            }
            begin[n] = positie;

            this.blok = woorden.join('\n');
            this.begin = begin;
            this.maskers = maskers;
            this.aantal = n;
        },

        /* Lexicografische vergelijking van woord i met een gewone string. */
        vergelijk: function (i, tekst) {
            var a = this.begin[i], eind = this.begin[i + 1] - 1;
            var la = eind - a, lb = tekst.length;
            var kleinste = la < lb ? la : lb;
            for (var k = 0; k < kleinste; k++) {
                var verschil = this.blok.charCodeAt(a + k) - tekst.charCodeAt(k);
                if (verschil !== 0) return verschil;
            }
            return la - lb;
        },

        bevat: function (tekst) {
            var laag = 0, hoog = this.aantal - 1;
            while (laag <= hoog) {
                var mid = (laag + hoog) >> 1;
                var verschil = this.vergelijk(mid, tekst);
                if (verschil === 0) return true;
                if (verschil < 0) laag = mid + 1; else hoog = mid - 1;
            }
            return false;
        }
    };

    /* ---------------------------------------------------------------- *
     * Raster oplossen                                                   *
     * ---------------------------------------------------------------- */

    /* Zoekt een aaneengesloten pad voor een woord; geeft de vakindexen
       terug, of null als het woord niet in dit raster te leggen is. */
    function zoekPad(letters, woord) {
        var lengte = woord.length;
        var pad = new Array(lengte);

        function stap(vak, diepte, gebruikt) {
            pad[diepte] = vak;
            if (diepte === lengte - 1) return true;
            var volgende = woord.charAt(diepte + 1);
            var buren = BUREN[vak];
            for (var k = 0; k < buren.length; k++) {
                var buur = buren[k];
                if (!(gebruikt & (1 << buur)) && letters[buur] === volgende) {
                    if (stap(buur, diepte + 1, gebruikt | (1 << buur))) return true;
                }
            }
            return false;
        }

        for (var i = 0; i < VAKKEN; i++) {
            if (letters[i] === woord.charAt(0) && stap(i, 0, 1 << i)) return pad.slice();
        }
        return null;
    }

    /* Alle vindbare woorden in een raster.

       Eerst een goedkope zeef: elk woord heeft een 26-bits lettermasker, en
       een woord dat een letter bevat die niet in het raster ligt valt meteen
       af. Van de 218.000 woorden blijven er zo doorgaans ruim duizend over.
       Die krijgen daarna een lettertelling en pas dan de dure padzoektocht. */
    function losOp(letters) {
        var rasterMasker = 0;
        var telling = new Int32Array(26);
        for (var i = 0; i < VAKKEN; i++) {
            var code = letters[i].charCodeAt(0) - 97;
            rasterMasker |= 1 << code;
            telling[code]++;
        }
        var buiten = ~rasterMasker;

        var maskers = Woordenboek.maskers;
        var begin = Woordenboek.begin;
        var blok = Woordenboek.blok;
        var woordTelling = new Int32Array(26);
        var gevonden = [];

        for (var w = 0, n = Woordenboek.aantal; w < n; w++) {
            if (maskers[w] & buiten) continue;

            var a = begin[w], eind = begin[w + 1] - 1;
            woordTelling.fill(0);
            var past = true;
            for (var k = a; k < eind; k++) {
                var c = blok.charCodeAt(k) - 97;
                if (++woordTelling[c] > telling[c]) { past = false; break; }
            }
            if (!past) continue;

            var woord = blok.slice(a, eind);
            if (zoekPad(letters, woord)) gevonden.push(woord);
        }
        return gevonden;
    }

    /* ---------------------------------------------------------------- *
     * Raster trekken                                                    *
     * ---------------------------------------------------------------- */

    function trekLetters() {
        var pot = LETTERPOT.slice();
        for (var i = pot.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tijdelijk = pot[i]; pot[i] = pot[j]; pot[j] = tijdelijk;
        }
        return pot.slice(0, VAKKEN);
    }

    /* Ondergrens voor een speelbaar raster. Een raster oplossen kost maar
       een paar milliseconden, dus doorschudden tot er een goede tussen zit
       is goedkoper dan de speler een mager raster voorschotelen. */
    var MIN_PUNTEN = 280;
    var MIN_WOORDEN = 45;
    var MIN_LANGSTE = 6;

    /* Trekt net zolang rasters tot er een speelbaar exemplaar tussen zit:
       genoeg klinkers, genoeg te halen punten en minstens één langer woord.
       Lukt dat niet, dan wint het rijkste raster dat we onderweg zagen. */
    function maakRaster() {
        var beste = null, besteWaarde = -1;

        for (var poging = 0; poging < 40; poging++) {
            var letters = trekLetters();

            var klinkers = 0;
            for (var i = 0; i < VAKKEN; i++) {
                if (KLINKERS.indexOf(letters[i]) !== -1) klinkers++;
            }
            if (klinkers < 4 || klinkers > 8) continue;

            var woorden = losOp(letters);
            var punten = 0, langste = 0;
            for (var w = 0; w < woorden.length; w++) {
                punten += woorden[w].length;
                if (woorden[w].length > langste) langste = woorden[w].length;
            }

            if (punten > besteWaarde) {
                besteWaarde = punten;
                beste = { letters: letters, woorden: woorden };
            }
            if (punten >= MIN_PUNTEN && woorden.length >= MIN_WOORDEN && langste >= MIN_LANGSTE) break;
        }
        return beste;
    }

    /* Een woord levert één punt per letter op — lange woorden dus meer. */
    function puntenVoor(woord) {
        return woord.length;
    }

    function maakOplossing(raster) {
        var perLengte = {};
        var maximum = 0;
        var set = Object.create(null);

        for (var i = 0; i < raster.woorden.length; i++) {
            var woord = raster.woorden[i];
            set[woord] = true;
            maximum += puntenVoor(woord);
            var sleutel = Math.min(woord.length, 10);
            perLengte[sleutel] = (perLengte[sleutel] || 0) + 1;
        }
        return {
            letters: raster.letters,
            woorden: raster.woorden,
            set: set,
            maximum: maximum,
            perLengte: perLengte
        };
    }

    /* ---------------------------------------------------------------- *
     * Geluid (zonder bestanden: alles via de Web Audio API)             *
     * ---------------------------------------------------------------- */

    var Geluid = {
        aan: true,
        context: null,

        wek: function () {
            if (!this.aan) return null;
            if (!this.context) {
                var Ctor = window.AudioContext || window.webkitAudioContext;
                if (!Ctor) { this.aan = false; return null; }
                this.context = new Ctor();
            }
            if (this.context.state === 'suspended') this.context.resume();
            return this.context;
        },

        toon: function (frequentie, duur, vertraging, sterkte) {
            var ctx = this.wek();
            if (!ctx) return;
            var start = ctx.currentTime + (vertraging || 0);
            var osc = ctx.createOscillator();
            var vol = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(frequentie, start);
            vol.gain.setValueAtTime(0.0001, start);
            vol.gain.exponentialRampToValueAtTime(sterkte || 0.2, start + 0.012);
            vol.gain.exponentialRampToValueAtTime(0.0001, start + duur);
            osc.connect(vol).connect(ctx.destination);
            osc.start(start);
            osc.stop(start + duur + 0.02);
        },

        goed: function (lengte) {
            var basis = 520 + Math.min(lengte - 3, 6) * 55;
            this.toon(basis, 0.11, 0);
            this.toon(basis * 1.5, 0.14, 0.07);
        },
        dubbel: function () { this.toon(330, 0.1, 0, 0.14); },
        fout: function () { this.toon(190, 0.16, 0, 0.14); },
        tik: function () { this.toon(880, 0.05, 0, 0.1); },
        einde: function () {
            [523, 659, 784, 1047].forEach(function (f, i) {
                Geluid.toon(f, 0.2, i * 0.11, 0.18);
            });
        }
    };

    /* ---------------------------------------------------------------- *
     * Opslag (alleen lokaal in de browser)                              *
     * ---------------------------------------------------------------- */

    var Opslag = {
        lees: function (sleutel, terugval) {
            try {
                var waarde = window.localStorage.getItem('woordjacht.' + sleutel);
                return waarde === null ? terugval : JSON.parse(waarde);
            } catch (e) { return terugval; }
        },
        schrijf: function (sleutel, waarde) {
            try {
                window.localStorage.setItem('woordjacht.' + sleutel, JSON.stringify(waarde));
            } catch (e) { /* privémodus of volle opslag: niet erg */ }
        }
    };

    /* ---------------------------------------------------------------- *
     * Tegenstanders                                                     *
     * ---------------------------------------------------------------- */

    /* Een speler vindt niet evenredig meer woorden naarmate een raster rijker
       is: de eerste tientallen liggen voor het oprapen, de staart daarachter
       niet. Daarom schaalt de opbrengst met de wortel van het aantal vindbare
       woorden. Zo blijft een tegenstander op een mager raster even geloofwaardig
       als op een raster met tweehonderd woorden, en blijft het niveau kloppen. */
    function maakBots(niveau, oplossing) {
        var instelling = NIVEAUS[niveau];
        var namen = BOTNAMEN.slice();
        var beschikbaar = oplossing.woorden.length;
        var gemiddeldeLengte = beschikbaar > 0 ? oplossing.maximum / beschikbaar : 4;
        var bots = [];

        for (var i = 0; i < AANTAL_BOTS; i++) {
            var keuze = Math.floor(Math.random() * namen.length);
            var naam = namen.splice(keuze, 1)[0];
            var vaardigheid = instelling.laag + Math.random() * (instelling.hoog - instelling.laag);

            var woorden = Math.round(vaardigheid * Math.sqrt(beschikbaar));
            woorden = Math.max(1, Math.min(woorden, Math.floor(beschikbaar * 0.85) || 1));
            /* Tegenstanders pakken eerder korte woorden dan lange, vandaar de
               lichte korting op de gemiddelde woordlengte. */
            var punten = Math.max(MIN_LENGTE, Math.round(woorden * gemiddeldeLengte * 0.92));

            bots.push({
                naam: naam,
                isIk: false,
                eindpunten: punten,
                eindwoorden: woorden,
                /* Elke bot heeft een eigen tempo: sommigen komen traag op gang,
                   anderen beginnen sterk en vlakken af. */
                tempo: 0.7 + Math.random() * 0.75,
                punten: 0,
                woorden: 0
            });
        }
        return bots;
    }

    function werkBotsBij(bots, voortgang) {
        for (var i = 0; i < bots.length; i++) {
            var bot = bots[i];
            var deel = Math.pow(Math.min(1, Math.max(0, voortgang)), bot.tempo);
            bot.punten = Math.round(bot.eindpunten * deel);
            bot.woorden = Math.round(bot.eindwoorden * deel);
        }
    }

    /* ---------------------------------------------------------------- *
     * Schermonderdelen                                                  *
     * ---------------------------------------------------------------- */

    function $(id) { return document.getElementById(id); }

    var el = {
        startscherm: $('startscherm'),
        spelscherm: $('spelscherm'),
        uitslagscherm: $('uitslagscherm'),
        naam: $('naam'),
        niveaus: $('niveaus'),
        startKnop: $('start-knop'),
        startLabel: $('start-label'),
        laadstatus: $('laadstatus'),
        record: $('record'),
        tijd: $('tijd'),
        punten: $('punten'),
        doelNu: $('doel-nu'),
        doelMax: $('doel-max'),
        balk: $('balk'),
        balkVul: $('balk-vul'),
        balkTekst: $('balk-tekst'),
        huidig: $('huidig'),
        raster: $('raster'),
        gevonden: $('gevonden'),
        aantalGevonden: $('aantal-gevonden'),
        lengtetabel: $('lengtetabel'),
        rangstrip: $('rangstrip'),
        stopKnop: $('stop-knop'),
        eindstand: $('eindstand'),
        uitslagSamenvatting: $('uitslag-samenvatting'),
        gemist: $('gemist'),
        gemistTelling: $('gemist-telling'),
        mijnWoorden: $('mijn-woorden'),
        mijnTelling: $('mijn-telling'),
        opnieuwKnop: $('opnieuw-knop'),
        menuKnop: $('menu-knop'),
        geluidKnop: $('geluid-knop'),
        geluidIcoon: $('geluid-icoon')
    };

    var stenen = [];
    for (var s = 0; s < VAKKEN; s++) {
        var steen = document.createElement('button');
        steen.type = 'button';
        steen.className = 'steen';
        steen.dataset.vak = String(s);
        steen.tabIndex = -1;
        el.raster.appendChild(steen);
        stenen.push(steen);
    }

    /* ---------------------------------------------------------------- *
     * Speltoestand                                                      *
     * ---------------------------------------------------------------- */

    var spel = null;
    var pad = [];
    var getypt = '';
    var pointerNeer = false;
    var versleept = false;
    var klok = null;
    var laatsteTik = -1;
    var nagloed = null;

    function toonScherm(welke) {
        el.startscherm.hidden = welke !== 'start';
        el.spelscherm.hidden = welke !== 'spel';
        el.uitslagscherm.hidden = welke !== 'uitslag';
        /* Tijdens het spelen maken we bovenaan en onderaan ruimte vrij, zodat
           raster, klok en woordenlijst samen op één telefoonscherm passen. */
        document.body.classList.toggle('speelt', welke === 'spel');
    }

    function huidigWoord() {
        if (getypt) return getypt;
        var woord = '';
        for (var i = 0; i < pad.length; i++) woord += spel.oplossing.letters[pad[i]];
        return woord;
    }

    function tekenSelectie() {
        var actief = getypt ? (zoekPad(spel.oplossing.letters, getypt) || []) : pad;
        for (var i = 0; i < VAKKEN; i++) {
            stenen[i].classList.toggle('is-gekozen', actief.indexOf(i) !== -1);
        }
        var woord = huidigWoord();
        if (woord) {
            el.huidig.textContent = woord;
        } else {
            el.huidig.innerHTML = '<span class="huidig-leeg">Sleep over de letters of typ een woord</span>';
        }
    }

    function flits(soort) {
        el.raster.classList.add('is-' + soort);
        el.huidig.classList.add('is-' + soort);
        window.setTimeout(function () {
            el.raster.classList.remove('is-' + soort);
            el.huidig.classList.remove('is-' + soort);
        }, 320);
    }

    function toonVonk(tekst) {
        var vonk = document.createElement('span');
        vonk.className = 'vonk';
        vonk.textContent = tekst;
        vonk.style.left = '50%';
        vonk.style.top = '50%';
        el.raster.appendChild(vonk);
        window.setTimeout(function () { vonk.remove(); }, 1000);
    }

    function wisSelectie() {
        if (nagloed) { window.clearTimeout(nagloed); nagloed = null; }
        pad = [];
        getypt = '';
        tekenSelectie();
    }

    /* ---------------------------------------------------------------- *
     * Woord indienen                                                    *
     * ---------------------------------------------------------------- */

    function indienen() {
        var woord = huidigWoord();
        if (!woord) return;

        if (woord.length < MIN_LENGTE) {
            flits('fout'); Geluid.fout();
        } else if (spel.gevonden[woord]) {
            flits('dubbel'); Geluid.dubbel();
        } else if (!spel.oplossing.set[woord]) {
            flits('fout'); Geluid.fout();
        } else {
            var punten = puntenVoor(woord);
            spel.gevonden[woord] = true;
            spel.volgorde.push(woord);
            spel.punten += punten;
            flits('goed');
            Geluid.goed(woord.length);
            toonVonk('+' + punten);
            voegGevondenToe(woord);
            werkMetersBij();
            werkLengtetabelBij();
        }

        /* Het pad is meteen weer vrij, maar de opgelichte stenen en het woord
           blijven nog heel even staan zodat de flits te zien is. Daarna één
           hertekening: die klopt ook als de speler alweer bezig is. */
        pad = [];
        getypt = '';
        if (nagloed) window.clearTimeout(nagloed);
        nagloed = window.setTimeout(function () {
            nagloed = null;
            tekenSelectie();
        }, 300);
    }

    function voegGevondenToe(woord) {
        var item = document.createElement('li');
        item.textContent = woord;
        if (woord.length >= 6) item.className = 'lang';
        el.gevonden.insertBefore(item, el.gevonden.firstChild);
        el.aantalGevonden.textContent = String(spel.volgorde.length);
    }

    /* ---------------------------------------------------------------- *
     * Meters bijwerken                                                  *
     * ---------------------------------------------------------------- */

    function werkMetersBij() {
        var maximum = spel.oplossing.maximum;
        var percentage = maximum > 0 ? (spel.punten / maximum) * 100 : 0;
        el.punten.textContent = String(spel.punten);
        el.doelNu.textContent = String(spel.punten);
        el.balkVul.style.width = Math.min(100, percentage) + '%';
        el.balkTekst.textContent = percentage.toFixed(1).replace('.', ',') + ' %';
        el.balk.setAttribute('aria-valuenow', String(Math.round(percentage)));
    }

    function werkLengtetabelBij() {
        var perLengte = spel.oplossing.perLengte;
        var mijn = {};
        for (var i = 0; i < spel.volgorde.length; i++) {
            var sleutel = Math.min(spel.volgorde[i].length, 10);
            mijn[sleutel] = (mijn[sleutel] || 0) + 1;
        }

        var html = '';
        for (var lengte = 3; lengte <= 10; lengte++) {
            var totaal = perLengte[lengte] || 0;
            var eigen = mijn[lengte] || 0;
            var naam = lengte === 10 ? '10+' : String(lengte);
            var klasse = totaal > 0 && eigen === totaal ? ' class="is-op"' : '';
            var waarde = totaal === 0 ? '&ndash;' : eigen + '/' + totaal;
            html += '<tr' + klasse + '><td>' + naam + '</td><td>' + waarde + '</td></tr>';
        }
        el.lengtetabel.innerHTML = html;
    }

    /* Tijdens de ronde volstaat één regel: op welke plek sta je, en wie of
       wat moet je inhalen. De volledige ranglijst volgt na de 90 seconden. */
    function werkLiveRanglijstBij() {
        var deelnemers = spel.bots.map(function (bot) {
            return { naam: bot.naam, punten: bot.punten, isIk: false };
        });
        deelnemers.push({ naam: spel.naam, punten: spel.punten, isIk: true });
        deelnemers.sort(function (a, b) { return b.punten - a.punten || (a.isIk ? 1 : -1); });

        var plek = 0;
        for (var i = 0; i < deelnemers.length; i++) {
            if (deelnemers[i].isIk) { plek = i + 1; break; }
        }

        var staart;
        if (plek === 1) {
            var tweede = deelnemers[1];
            staart = 'voorsprong ' + (spel.punten - tweede.punten) + ' op ' + ontsnap(tweede.naam);
        } else {
            var boven = deelnemers[plek - 2];
            staart = ontsnap(boven.naam) + ' staat ' + (boven.punten - spel.punten) + ' voor';
        }
        el.rangstrip.innerHTML = '<b>' + plek + 'e</b> van ' + deelnemers.length + ' &middot; ' + staart;
    }

    function ontsnap(tekst) {
        return String(tekst).replace(/[&<>"']/g, function (teken) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[teken];
        });
    }

    /* ---------------------------------------------------------------- *
     * Invoer: slepen en tikken                                          *
     * ---------------------------------------------------------------- */

    function magToevoegen(vak) {
        if (pad.indexOf(vak) !== -1) return false;
        if (pad.length === 0) return true;
        return BUREN[pad[pad.length - 1]].indexOf(vak) !== -1;
    }

    function vakOnder(gebeurtenis) {
        var doel = document.elementFromPoint(gebeurtenis.clientX, gebeurtenis.clientY);
        if (!doel) return -1;
        var steen = doel.closest ? doel.closest('.steen') : null;
        return steen ? Number(steen.dataset.vak) : -1;
    }

    el.raster.addEventListener('pointerdown', function (gebeurtenis) {
        if (!spel || !spel.loopt) return;
        var vak = vakOnder(gebeurtenis);
        if (vak < 0) return;
        gebeurtenis.preventDefault();
        Geluid.wek();
        getypt = '';

        /* Tikmodus: het pad staat nog open van een vorige tik. */
        if (pad.length > 0) {
            if (vak === pad[pad.length - 1]) { indienen(); return; }
            if (magToevoegen(vak)) {
                pad.push(vak);
                pointerNeer = true;
                versleept = false;
                tekenSelectie();
                return;
            }
        }

        pad = [vak];
        pointerNeer = true;
        versleept = false;
        tekenSelectie();
    });

    el.raster.addEventListener('pointermove', function (gebeurtenis) {
        if (!pointerNeer || !spel || !spel.loopt) return;
        var vak = vakOnder(gebeurtenis);
        if (vak < 0 || vak === pad[pad.length - 1]) return;

        /* Terugkrabbelen: over de voorlaatste steen gaan haalt de laatste weg. */
        if (pad.length >= 2 && vak === pad[pad.length - 2]) {
            pad.pop();
            versleept = true;
            tekenSelectie();
            return;
        }
        if (magToevoegen(vak)) {
            pad.push(vak);
            versleept = true;
            tekenSelectie();
        }
    });

    function pointerLos() {
        if (!pointerNeer) return;
        pointerNeer = false;
        /* Alleen slepen dient meteen in; een losse tik houdt het pad open. */
        if (versleept && pad.length >= 2) indienen();
    }

    el.raster.addEventListener('pointerup', pointerLos);
    el.raster.addEventListener('pointercancel', function () {
        pointerNeer = false;
        versleept = false;
    });
    window.addEventListener('pointerup', pointerLos);

    /* Voorkomt dat de pagina meescrolt tijdens het slepen op iOS. */
    el.raster.addEventListener('touchmove', function (gebeurtenis) {
        if (pointerNeer) gebeurtenis.preventDefault();
    }, { passive: false });

    /* ---------------------------------------------------------------- *
     * Invoer: toetsenbord                                               *
     * ---------------------------------------------------------------- */

    document.addEventListener('keydown', function (gebeurtenis) {
        if (!spel || !spel.loopt) return;
        if (document.activeElement === el.naam) return;
        if (gebeurtenis.metaKey || gebeurtenis.ctrlKey || gebeurtenis.altKey) return;

        var toets = gebeurtenis.key;
        if (toets === 'Enter') {
            gebeurtenis.preventDefault();
            indienen();
        } else if (toets === 'Backspace') {
            gebeurtenis.preventDefault();
            if (getypt) getypt = getypt.slice(0, -1);
            else if (pad.length) pad.pop();
            tekenSelectie();
        } else if (toets === 'Escape') {
            gebeurtenis.preventDefault();
            wisSelectie();
        } else if (toets.length === 1 && /[a-zA-Z]/.test(toets)) {
            gebeurtenis.preventDefault();
            if (pad.length && !getypt) { for (var i = 0; i < pad.length; i++) getypt += spel.oplossing.letters[pad[i]]; }
            pad = [];
            getypt += toets.toLowerCase();
            Geluid.wek();
            tekenSelectie();
        }
    });

    /* ---------------------------------------------------------------- *
     * Ronde starten, lopen en afronden                                  *
     * ---------------------------------------------------------------- */

    function startRonde() {
        var raster = maakRaster();
        if (!raster) { el.laadstatus.textContent = 'Kon geen speelbaar raster maken. Probeer opnieuw.'; return; }

        var oplossing = maakOplossing(raster);
        var naam = (el.naam.value || '').trim() || 'Jij';
        Opslag.schrijf('naam', naam);

        spel = {
            oplossing: oplossing,
            naam: naam,
            niveau: huidigNiveau,
            gevonden: Object.create(null),
            volgorde: [],
            punten: 0,
            bots: maakBots(huidigNiveau, oplossing),
            begonnen: 0,
            loopt: true
        };

        for (var i = 0; i < VAKKEN; i++) stenen[i].textContent = oplossing.letters[i];
        el.gevonden.innerHTML = '';
        el.aantalGevonden.textContent = '0';
        el.doelMax.textContent = String(oplossing.maximum);
        werkMetersBij();
        werkLengtetabelBij();
        werkBotsBij(spel.bots, 0);
        werkLiveRanglijstBij();
        wisSelectie();

        toonScherm('spel');
        laatsteTik = -1;
        spel.begonnen = Date.now();
        klok = window.setInterval(tik, 100);
        tik();
    }

    function tik() {
        if (!spel || !spel.loopt) return;
        var verstreken = (Date.now() - spel.begonnen) / 1000;
        var over = Math.max(0, RONDE_SECONDEN - verstreken);

        var hele = Math.ceil(over);
        var minuten = Math.floor(hele / 60);
        var seconden = hele % 60;
        el.tijd.textContent = minuten + ':' + (seconden < 10 ? '0' : '') + seconden;
        el.tijd.parentNode.classList.toggle('is-krap', over <= 10);

        if (over <= 10 && hele !== laatsteTik && hele > 0) {
            laatsteTik = hele;
            Geluid.tik();
        }

        werkBotsBij(spel.bots, verstreken / RONDE_SECONDEN);
        werkLiveRanglijstBij();

        if (over <= 0) beeindig();
    }

    function beeindig() {
        if (!spel) return;
        spel.loopt = false;
        window.clearInterval(klok);
        klok = null;
        wisSelectie();
        werkBotsBij(spel.bots, 1);
        Geluid.einde();
        toonUitslag();
        toonScherm('uitslag');
    }

    function toonUitslag() {
        var maximum = spel.oplossing.maximum;
        var percentage = maximum > 0 ? (spel.punten / maximum) * 100 : 0;

        var deelnemers = spel.bots.map(function (bot) {
            return { naam: bot.naam, punten: bot.punten, woorden: bot.woorden, isIk: false };
        });
        deelnemers.push({
            naam: spel.naam, punten: spel.punten, woorden: spel.volgorde.length, isIk: true
        });
        deelnemers.sort(function (a, b) { return b.punten - a.punten || b.woorden - a.woorden; });

        var plek = 0;
        var html = '';
        for (var i = 0; i < deelnemers.length; i++) {
            var d = deelnemers[i];
            if (d.isIk) plek = i + 1;
            html += '<tr' + (d.isIk ? ' class="ik"' : '') + '>' +
                '<td>' + (i + 1) + '</td>' +
                '<td>' + ontsnap(d.naam) + '</td>' +
                '<td>' + d.woorden + '</td>' +
                '<td>' + d.punten + '</td></tr>';
        }
        el.eindstand.innerHTML = html;

        el.uitslagSamenvatting.innerHTML =
            'Plaats <strong>' + plek + '</strong> van ' + deelnemers.length + '. Je vond <strong>' +
            spel.volgorde.length + '</strong> van de ' + spel.oplossing.woorden.length +
            ' woorden en scoorde <strong>' + spel.punten + '</strong> van de ' + maximum +
            ' punten (' + percentage.toFixed(1).replace('.', ',') + ' %).';

        /* Gemiste woorden: de langste eerst, want die zijn het interessantst. */
        var gemist = spel.oplossing.woorden.filter(function (woord) {
            return !spel.gevonden[woord];
        }).sort(function (a, b) { return b.length - a.length || a.localeCompare(b); });

        el.gemistTelling.textContent = '(' + gemist.length + ')';
        el.gemist.innerHTML = gemist.slice(0, 120).map(function (woord) {
            return '<li>' + woord + '</li>';
        }).join('');

        var mijne = spel.volgorde.slice().sort(function (a, b) {
            return b.length - a.length || a.localeCompare(b);
        });
        el.mijnTelling.textContent = '(' + mijne.length + ')';
        el.mijnWoorden.innerHTML = mijne.map(function (woord) {
            return '<li>' + woord + '</li>';
        }).join('') || '<li>geen</li>';

        bewaarRecord(spel.punten, percentage);
    }

    function bewaarRecord(punten, percentage) {
        var record = Opslag.lees('record', { punten: 0, percentage: 0 });
        var nieuw = false;
        if (punten > record.punten) { record.punten = punten; nieuw = true; }
        if (percentage > record.percentage) { record.percentage = percentage; nieuw = true; }
        if (nieuw) Opslag.schrijf('record', record);
        toonRecord();
    }

    function toonRecord() {
        var record = Opslag.lees('record', null);
        if (!record || !record.punten) { el.record.hidden = true; return; }
        el.record.hidden = false;
        el.record.textContent = 'Jouw record: ' + record.punten + ' punten — beste dekking ' +
            record.percentage.toFixed(1).replace('.', ',') + ' %';
    }

    /* ---------------------------------------------------------------- *
     * Knoppen                                                           *
     * ---------------------------------------------------------------- */

    var huidigNiveau = Opslag.lees('niveau', 'normaal');
    if (!NIVEAUS[huidigNiveau]) huidigNiveau = 'normaal';

    Array.prototype.forEach.call(el.niveaus.querySelectorAll('.niveau'), function (knop) {
        var isActief = knop.dataset.niveau === huidigNiveau;
        knop.classList.toggle('is-actief', isActief);
        knop.setAttribute('aria-checked', String(isActief));

        knop.addEventListener('click', function () {
            huidigNiveau = knop.dataset.niveau;
            Opslag.schrijf('niveau', huidigNiveau);
            Array.prototype.forEach.call(el.niveaus.querySelectorAll('.niveau'), function (ander) {
                var actief = ander === knop;
                ander.classList.toggle('is-actief', actief);
                ander.setAttribute('aria-checked', String(actief));
            });
        });
    });

    el.naam.value = Opslag.lees('naam', '') || '';
    toonRecord();

    el.startKnop.addEventListener('click', function () { Geluid.wek(); startRonde(); });
    el.opnieuwKnop.addEventListener('click', function () { startRonde(); });
    el.menuKnop.addEventListener('click', function () { toonScherm('start'); });
    el.stopKnop.addEventListener('click', function () { beeindig(); });

    Geluid.aan = Opslag.lees('geluid', true);
    function werkGeluidknopBij() {
        el.geluidKnop.setAttribute('aria-pressed', String(Geluid.aan));
        el.geluidIcoon.innerHTML = Geluid.aan ? '&#9834;' : '&#9834;';
    }
    werkGeluidknopBij();
    el.geluidKnop.addEventListener('click', function () {
        Geluid.aan = !Geluid.aan;
        Opslag.schrijf('geluid', Geluid.aan);
        werkGeluidknopBij();
        if (Geluid.aan) Geluid.tik();
    });

    /* ---------------------------------------------------------------- *
     * Woordenboek laden                                                 *
     * ---------------------------------------------------------------- */

    function laadWoordenboek() {
        el.laadstatus.textContent = 'Het Nederlandse woordenboek wordt eenmalig opgehaald…';

        fetch('woorden.txt')
            .then(function (antwoord) {
                if (!antwoord.ok) throw new Error('HTTP ' + antwoord.status);
                return antwoord.text();
            })
            .then(function (tekst) {
                el.laadstatus.textContent = 'Woordenboek klaarzetten…';
                /* Even ademruimte zodat de statusregel ook echt getekend wordt. */
                return new Promise(function (klaar) {
                    window.setTimeout(function () {
                        Woordenboek.ontleed(tekst);
                        klaar();
                    }, 30);
                });
            })
            .then(function () {
                /* Eén oplosronde vooraf zet de JIT aan het werk; zonder deze
                   opwarming duurt juist het eerste raster bijna een seconde. */
                losOp('abcdefghijklmnop'.split(''));
                el.startKnop.disabled = false;
                el.startLabel.textContent = 'Start de jacht';
                el.laadstatus.textContent = Woordenboek.aantal.toLocaleString('nl-NL') +
                    ' Nederlandse woorden geladen. Vanaf hier speelt alles offline.';
            })
            .catch(function (fout) {
                el.startLabel.textContent = 'Laden mislukt';
                el.laadstatus.textContent = 'Het woordenboek kon niet geladen worden (' +
                    fout.message + '). Ververs de pagina om het opnieuw te proberen.';
            });
    }

    laadWoordenboek();
})();
