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
    var VELDGROOTTE = 20;   /* het speelveld telt altijd 20 deelnemers */
    var PAUZE_SECONDEN = 10;   /* scorebord tussen twee rondes */

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
    /* Deze getallen zijn geijkt op een veld van negentien tegenstanders. Dat
       is belangrijker dan het lijkt: je speelt niet tegen de middelmaat maar
       tegen de beste van negentien trekkingen, en die ligt fors hoger dan de
       mediaan. Toen het veld van vijf naar negentien ging werd het spel
       daardoor ineens veel zwaarder zonder dat er aan de sterkte iets
       veranderd was. Pas deze reeksen dus nooit aan zonder opnieuw te meten
       wat de BESTE bot haalt; de mediaan zegt hier weinig. */
    var NIVEAUS = {
        makkelijk: { naam: 'Makkelijk', laag: 0.40, hoog: 1.10 },
        normaal: { naam: 'Normaal', laag: 0.80, hoog: 1.80 },
        lastig: { naam: 'Lastig', laag: 1.50, hoog: 2.80 },
        meester: { naam: 'Meester', laag: 2.40, hoog: 4.20 }
    };

    /* Bijnamen in plaats van voornamen: een ranglijst vol Sanne en Joost leest
       als een klassenlijst, terwijl dit een spelletje is. Houd ze kort -- bij
       meer dan zestien tekens loopt de ranglijststrip op een smalle telefoon
       vol -- en denk eraan dat ze door ontsnap() gaan, dus een '<' mag. */
    var BOTNAMEN = [
        'Meeuw', 'Doctorandus P', 'Bertha 39', 'Grutto', 'Kievit', 'Koolmees',
        'Roodborst', 'Wilde Eend', 'Tante Riet', 'Ome Jan', 'Opa Henk', 'Beppie',
        'Tante Sjaan', 'Turbo Truus', 'Snelle Jelle', 'Scrabble Sjaak',
        'Anagram Ans', 'Puzzelpiet', 'Woordbaas68', 'Letterzee44', 'Woordaap92',
        'Gerda 61', 'Henk 1953', 'Truus 74', 'Sjaak 88', 'xX_Beppie_Xx',
        'Woordzoeker2000', 'TaalTijger', 'De Letterdief', 'Klinkerkoning',
        'Puntenpakker', 'Rasterrat', 'Woordwolf', 'Letterkoek', 'Stroopwafel',
        'Hagelslag', 'Pindakaas', 'Krentenbol', 'Poffertje', 'Kroket', 'Tosti',
        'Havermout', 'Drop', 'Kaaskop', 'De Kaasschaaf', 'Bakfiets', 'Fietsbel',
        'Rollator', 'Regenjas', 'Bloempot', 'Molensteen', 'Klaas Vaak',
        'Jan Modaal', 'Jan met de Pet', 'Gebakken Lucht', 'Losse Flodder',
        'Halve Zool', 'Rare Snuiter', 'Klein Duimpje', 'Nachtbraker', 'Dubbelop',
        'Vinkje', 'Zeeuws Meisje', 'Dikke Duim', 'Mevr. Jansen', 'Buurman',
        'De Typemachine', 'Woordenboek', 'Sloddervos', 'Kladblok', 'Kruiswoord',
        'Teletekst',
        /* De koppels hieronder: zie DUOS. */
        'Folkert<3 Sanne', 'Sanne<3 Folkert', 'Sjonnie', 'Anita',
        'Hans', 'Grietje', 'Jut', 'Jul'
    ];

    /* Deze namen horen bij elkaar en komen samen op het bord, of geen van
       beide. Los van elkaar is er niets aan; naast elkaar in de ranglijst
       wel. */
    var DUOS = [
        ['Folkert<3 Sanne', 'Sanne<3 Folkert'],
        ['Sjonnie', 'Anita'],
        ['Hans', 'Grietje'],
        ['Jut', 'Jul']
    ];

    function partnerVan(naam) {
        for (var i = 0; i < DUOS.length; i++) {
            if (DUOS[i][0] === naam) return DUOS[i][1];
            if (DUOS[i][1] === naam) return DUOS[i][0];
        }
        return null;
    }

    /* Trekt namen voor een veld. Loopt volledig via de meegegeven generator,
       zodat een gedeelde ronde bij iedereen dezelfde namen oplevert. */
    function kiesNamen(willekeur, hoeveel) {
        var pot = BOTNAMEN.slice();
        var gekozen = [];

        while (gekozen.length < hoeveel && pot.length > 0) {
            var naam = pot.splice(Math.floor(willekeur() * pot.length), 1)[0];
            gekozen.push(naam);

            var partner = partnerVan(naam);
            if (partner && gekozen.length < hoeveel) {
                var plek = pot.indexOf(partner);
                if (plek !== -1) {
                    pot.splice(plek, 1);
                    gekozen.push(partner);
                }
            }
        }
        return gekozen;
    }

    /* Hoe een tegenstander zijn woorden over de 90 seconden verdeelt. De functie
       zet een gelijkmatig getrokken getal om in een tijdstip: een lage uitkomst
       is vroeg in de ronde, een hoge laat. Dat levert de sprongen op waardoor de
       ranglijst tijdens het spelen blijft schuiven in plaats van stil te staan. */
    var PROFIELEN = [
        { naam: 'spurter', kromme: function (u) { return Math.pow(u, 1.9); } },
        { naam: 'denker', kromme: function (u) { return Math.pow(u, 0.55); } },
        { naam: 'gestaag', kromme: function (u) { return u; } },
        { naam: 'golver', kromme: function (u) { return u < 0.5 ? 0.04 + u * 0.52 : 0.56 + (u - 0.5) * 0.86; } },
        { naam: 'laatkomer', kromme: function (u) { return 0.24 + u * 0.76; } }
    ];

    /* ---------------------------------------------------------------- *
     * Willekeur                                                         *
     *                                                                   *
     * Solo speelt iedereen zijn eigen spel, daar volstaat Math.random.   *
     * Samen spelen eist het tegenovergestelde: elke browser moet uit     *
     * hetzelfde rondezaadje exact hetzelfde raster en dezelfde           *
     * tegenstanders afleiden. Dan hoeft de server niets van dat alles    *
     * te versturen — alleen het zaadje.                                  *
     * ---------------------------------------------------------------- */

    /* mulberry32: klein, snel en over browsers heen identiek. */
    function zaadbareWillekeur(zaad) {
        var toestand = zaad >>> 0;
        return function () {
            toestand = (toestand + 0x6D2B79F5) >>> 0;
            var t = toestand;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    /* Zet een tekstzaadje (bijvoorbeeld een rondecode van de server) om in
       een 32-bits getal. FNV-1a: kort en botsingsarm genoeg voor dit doel. */
    function zaadUitTekst(tekst) {
        var hash = 2166136261;
        for (var i = 0; i < tekst.length; i++) {
            hash ^= tekst.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    var losseWillekeur = function () { return Math.random(); };

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

    function trekLetters(willekeur) {
        var pot = LETTERPOT.slice();
        for (var i = pot.length - 1; i > 0; i--) {
            var j = Math.floor(willekeur() * (i + 1));
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
    var LANG_WOORD = 9;     /* de lengte die minstens om de ronde moet voorkomen */

    /* Slechts een op de tien rasters bevat vanzelf een woord van negen letters
       of meer, en juist die maken een ronde de moeite waard. Daarom eisen we
       er periodiek een. Dit onthoudt of de vorige ronde er een had; zo niet,
       dan moet de volgende het leveren. Twee saaie rondes achter elkaar kan
       dus niet. Bij samen spelen telt deze schuld niet: daar moet de eis uit
       het zaadje volgen, anders krijgen spelers die op verschillende momenten
       instapten verschillende rasters. */
    var langWoordSchuld = false;

    /* Trekt net zolang rasters tot er een speelbaar exemplaar tussen zit:
       genoeg klinkers, genoeg te halen punten en minstens één langer woord.
       Lukt dat niet, dan wint het rijkste raster dat we onderweg zagen. */
    function maakRaster(willekeur, eisLangWoord) {
        willekeur = willekeur || losseWillekeur;
        var beste = null, besteWaarde = -1;
        /* Een lang woord vergt meer pogingen, maar een raster oplossen kost
           maar een paar milliseconden; doorschudden is goedkoop. */
        var maxPogingen = eisLangWoord ? 60 : 40;

        for (var poging = 0; poging < maxPogingen; poging++) {
            var letters = trekLetters(willekeur);

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

            /* Gaan we voor een lang woord, dan telt de lengte zwaarder dan de
               puntenoogst -- anders wint een rijk raster zonder lang woord het
               van een magerder raster dat wel levert wat gevraagd is. */
            var waarde = eisLangWoord ? langste * 100000 + punten : punten;
            if (waarde > besteWaarde) {
                besteWaarde = waarde;
                beste = { letters: letters, woorden: woorden };
            }

            var voldoet = punten >= MIN_PUNTEN && woorden.length >= MIN_WOORDEN && langste >= MIN_LANGSTE;
            if (eisLangWoord && langste < LANG_WOORD) voldoet = false;
            if (voldoet) break;
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
    function maakBots(niveau, oplossing, willekeur) {
        willekeur = willekeur || losseWillekeur;
        var instelling = NIVEAUS[niveau];
        var beschikbaar = oplossing.woorden.length;
        var namen = kiesNamen(willekeur, VELDGROOTTE - 1);
        var bots = [];

        for (var i = 0; i < VELDGROOTTE - 1; i++) {
            var naam = namen[i];
            var vaardigheid = instelling.laag + willekeur() * (instelling.hoog - instelling.laag);

            var hoeveel = Math.round(vaardigheid * Math.sqrt(beschikbaar));
            hoeveel = Math.max(1, Math.min(hoeveel, Math.floor(beschikbaar * 0.85) || 1));

            /* Zwakkere spelers blijven aan de korte woorden hangen, sterkere zien
               de lange ook. Vandaar dat de voorkeur meeschaalt met de vaardigheid. */
            var spreiding = (vaardigheid - instelling.laag) / Math.max(0.001, instelling.hoog - instelling.laag);
            var voorkeur = 1.4 - spreiding * 0.8;

            var profiel = PROFIELEN[Math.floor(willekeur() * PROFIELEN.length)];
            var vondsten = planVondsten(oplossing.woorden, hoeveel, voorkeur, profiel, willekeur);

            var punten = 0, beste = '';
            for (var v = 0; v < vondsten.length; v++) {
                punten += vondsten[v].woord.length;
                if (vondsten[v].woord.length > beste.length) beste = vondsten[v].woord;
            }

            bots.push({
                naam: naam,
                isIk: false,
                profiel: profiel.naam,
                vondsten: vondsten,
                wijzer: 0,
                eindpunten: punten,
                eindwoorden: vondsten.length,
                besteWoord: beste,
                punten: 0,
                woorden: 0
            });
        }
        return bots;
    }

    /* Kiest de woorden die één tegenstander gaat vinden en zet er tijdstippen
       bij. Korte woorden worden vaker gekozen dan lange, en lange woorden vallen
       gemiddeld later in de ronde: die zie je nu eenmaal niet meteen liggen. */
    function planVondsten(alleWoorden, hoeveel, voorkeur, profiel, willekeur) {
        var vijver = alleWoorden.slice();
        var gewichten = new Array(vijver.length);
        var totaal = 0;
        for (var i = 0; i < vijver.length; i++) {
            gewichten[i] = 1 / Math.pow(vijver[i].length - 2, voorkeur);
            totaal += gewichten[i];
        }

        var gekozen = [];
        for (var k = 0; k < hoeveel && vijver.length > 0; k++) {
            var trek = willekeur() * totaal, index = 0;
            while (index < vijver.length - 1 && trek > gewichten[index]) {
                trek -= gewichten[index];
                index++;
            }
            gekozen.push(vijver[index]);
            totaal -= gewichten[index];
            vijver.splice(index, 1);
            gewichten.splice(index, 1);
        }

        var tijden = [];
        for (var t = 0; t < gekozen.length; t++) {
            tijden.push(profiel.kromme(willekeur()) * RONDE_SECONDEN);
        }
        tijden.sort(function (a, b) { return a - b; });
        gekozen.sort(function (a, b) { return a.length - b.length; });

        /* Zonder deze schudbeurt vindt elke bot zijn woorden keurig van kort naar
           lang; dat is te netjes om op een echte speler te lijken. */
        for (var w = 0; w < gekozen.length - 1; w++) {
            if (willekeur() < 0.35) {
                var tussen = gekozen[w]; gekozen[w] = gekozen[w + 1]; gekozen[w + 1] = tussen;
            }
        }

        var vondsten = [];
        for (var n = 0; n < gekozen.length; n++) {
            vondsten.push({ woord: gekozen[n], tijd: tijden[n] });
        }
        return vondsten;
    }

    /* Zet elke bot op de stand die hoort bij het aantal verstreken seconden. De
       wijzer loopt alleen vooruit, dus dit kost een paar vergelijkingen per
       aanroep, ook bij twintig deelnemers en tien keer per seconde. */
    function werkBotsBij(bots, verstreken) {
        for (var i = 0; i < bots.length; i++) {
            var bot = bots[i];
            if (verstreken <= 0) {
                bot.wijzer = 0;
                bot.punten = 0;
                bot.woorden = 0;
                continue;
            }
            while (bot.wijzer < bot.vondsten.length && bot.vondsten[bot.wijzer].tijd <= verstreken) {
                bot.punten += bot.vondsten[bot.wijzer].woord.length;
                bot.woorden++;
                bot.wijzer++;
            }
        }
    }

    /* ---------------------------------------------------------------- *
     * Samen spelen                                                      *
     *                                                                   *
     * Er is precies een lobby. Speelt er iemand, dan schuif je aan bij   *
     * diezelfde ronde; is er niemand, dan open jij hem. De server stuurt *
     * alleen een zaadje en de tijden -- raster en tegenstanders leidt    *
     * elke browser daar zelf uit af, en komt zo op hetzelfde uit.        *
     * ---------------------------------------------------------------- */

    /* Leeg laten zolang de dienst niet draait; dan blijft samen spelen uit en
       verandert er niets aan het spel zelf. */
    var API_BASIS = 'https://api.elconteo.nl';

    /* Tijdens lokaal ontwikkelen mag ?api= dit overschrijven. Alleen op
       localhost, zodat niemand de live site naar een vreemde server kan
       laten praten door een link door te sturen. */
    (function () {
        if (['localhost', '127.0.0.1'].indexOf(window.location.hostname) === -1) return;
        var treffer = /[?&]api=([^&]+)/.exec(window.location.search);
        if (treffer) API_BASIS = decodeURIComponent(treffer[1]);
    })();

    var POLL_MS = 2000;
    var VERZOEK_TIJDSLIMIET = 8000;

    var Samen = {
        aan: false,
        rondeId: null,
        spelerId: null,
        zaad: null,
        /* serverTijd - Date.now(), zodat iedereen dezelfde klok volgt. */
        klokverschil: 0,
        spelers: [],
        poll: null,
        wachtend: false,

        beschikbaar: function () { return Boolean(API_BASIS); },

        vraag: function (pad, gegevens) {
            /* Zonder dit slot zou een lege API_BASIS van '/samen/meedoen' een
               verzoek aan onze eigen site maken. Cloudflare Pages weigert
               POSTs met een 405, en dat is een raadselachtige fout voor iets
               wat simpelweg niet ingesteld is. */
            if (!API_BASIS) {
                return Promise.reject(new Error('samen spelen staat uit'));
            }

            /* Zonder tijdslimiet blijft een onbereikbare dienst hangen en
               krijgt de speler nooit te horen dat er iets mis is. */
            var afbreker = typeof AbortController === 'function' ? new AbortController() : null;
            var wekker = window.setTimeout(function () {
                if (afbreker) afbreker.abort();
            }, VERZOEK_TIJDSLIMIET);

            return fetch(API_BASIS + pad, {
                method: gegevens ? 'POST' : 'GET',
                headers: gegevens ? { 'Content-Type': 'application/json' } : undefined,
                body: gegevens ? JSON.stringify(gegevens) : undefined,
                signal: afbreker ? afbreker.signal : undefined
            }).then(function (antwoord) {
                window.clearTimeout(wekker);
                if (!antwoord.ok) throw new Error('HTTP ' + antwoord.status);
                return antwoord.json();
            }, function (fout) {
                window.clearTimeout(wekker);
                throw new Error(fout && fout.name === 'AbortError'
                    ? 'dienst reageert niet' : 'geen verbinding');
            });
        },

        neemOver: function (beeld) {
            this.klokverschil = beeld.serverTijd - Date.now();
            this.spelers = beeld.spelers || [];
            if (beeld.ronde) {
                this.rondeId = beeld.ronde.id;
                this.zaad = beeld.ronde.zaad;
                this.eindigtOp = beeld.ronde.eindigtOp;
                this.pauzeTot = beeld.ronde.pauzeTot;
            }
            if (beeld.jij) this.spelerId = beeld.jij;
        },

        /* Servertijd omgerekend naar de klok van deze browser. */
        lokaal: function (serverTijdstip) {
            return serverTijdstip - this.klokverschil;
        },

        /* Iedereen behalve ikzelf; mijn eigen stand komt uit het spel zelf,
           die is verser dan wat de server twee seconden geleden hoorde. */
        anderen: function () {
            var eigen = this.spelerId;
            return this.spelers.filter(function (s) { return s.id !== eigen; });
        },

        startPollen: function () {
            var zelf = this;
            this.stopPollen();
            this.poll = window.setInterval(function () { zelf.klop(); }, POLL_MS);
        },

        stopPollen: function () {
            if (this.poll) { window.clearInterval(this.poll); this.poll = null; }
        },

        klop: function () {
            var zelf = this;
            var oudeRonde = this.rondeId;
            var oudeSpeler = this.spelerId;

            return this.vraag('/samen/stand', {
                rondeId: oudeRonde,
                spelerId: oudeSpeler,
                punten: spel ? spel.punten : 0,
                woorden: spel ? spel.volgorde.length : 0
            }).then(function (beeld) {
                if (!beeld.ronde) { zelf.verlaat(); return; }

                var nieuweRonde = beeld.ronde.id !== oudeRonde;
                var kwijt = !beeld.jij;
                zelf.neemOver(beeld);

                if (!nieuweRonde && !kwijt) {
                    /* Sta je op het scorebord, dan komen de eindstanden van de
                       anderen hier binnen. Opnieuw tekenen dus: pas daardoor
                       zien alle spelers dezelfde uitslag. */
                    if (spel && spel.samen && !el.uitslagscherm.hidden) tekenEindstand();
                    return;
                }

                /* Binnen dezelfde ronde eerst netjes afmelden, anders blijft de
                   oude inschrijving staan tot de server hem vergeet en zien de
                   anderen ons ondertussen dubbel. */
                if (!nieuweRonde && oudeSpeler) {
                    zelf.vraag('/samen/vertrek', { rondeId: oudeRonde, spelerId: oudeSpeler })
                        .catch(function () { });
                }

                /* Doorgerolde ronde, of de server is ons kwijt (bijvoorbeeld na
                   een haperende verbinding). In beide gevallen opnieuw
                   inschrijven; alleen bij een nieuwe ronde stappen we ook
                   daadwerkelijk in een nieuw spel. */
                zelf.vraag('/samen/meedoen', { naam: spel ? spel.naam : 'Speler' })
                    .then(function (opnieuw) {
                        zelf.neemOver(opnieuw);
                        if (nieuweRonde) startRonde(opnieuw.ronde);
                    })
                    .catch(function () { });
            }).catch(function () { /* een gemiste klop is niet erg; de volgende komt zo */ });
        },

        /* Een afgeknepen achtergrondtabblad pollt bijna niet meer. Zodra de
           speler terug is dus niet wachten op de volgende beurt, maar meteen
           van je laten horen -- anders is hij net vergeten. */
        bijTerugkeer: function () {
            if (!this.aan || document.hidden) return;
            this.klop();
        },

        /* Wie het tabblad sluit kan geen gewoon verzoek meer afmaken; een
           beacon overleeft dat wel. Zonder dit blijft hij tot de vergeettijd
           op het scorebord van de anderen staan. */
        meldAf: function () {
            if (!this.aan || !this.rondeId || !this.spelerId) return;
            var pakket = JSON.stringify({ rondeId: this.rondeId, spelerId: this.spelerId });
            if (navigator.sendBeacon) {
                /* text/plain houdt het een eenvoudig verzoek, zodat er geen
                   preflight nodig is die een beacon niet kan doen. */
                navigator.sendBeacon(API_BASIS + '/samen/vertrek',
                    new Blob([pakket], { type: 'text/plain' }));
            }
        },

        verlaat: function () {
            this.stopPollen();
            if (this.rondeId && this.spelerId) {
                this.vraag('/samen/vertrek', { rondeId: this.rondeId, spelerId: this.spelerId })
                    .catch(function () { });
            }
            this.aan = false;
            this.rondeId = null;
            this.spelerId = null;
            this.spelers = [];
            this.wachtend = false;
        }
    };

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
        eindstandVak: $('eindstand-vak'),
        uitslagSamenvatting: $('uitslag-samenvatting'),
        gemist: $('gemist'),
        gemistTelling: $('gemist-telling'),
        mijnWoorden: $('mijn-woorden'),
        mijnTelling: $('mijn-telling'),
        sessie: $('sessie'),
        aftellen: $('aftellen'),
        aftelTekst: $('aftel-tekst'),
        aftelVul: $('aftel-vul'),
        samenKnop: $('samen-knop'),
        samenUitleg: $('samen-uitleg'),
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
    var aftelKlok = null;
    var aftelRest = 0;

    /* Tellers over de hele doorspeelsessie, niet over één ronde. */
    var sessie = { rondes: 0, punten: 0, maximum: 0, woorden: 0 };

    function nieuweSessie() {
        sessie = { rondes: 0, punten: 0, maximum: 0, woorden: 0 };
    }

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
        var deelnemers = alleDeelnemers();

        var plek = 0;
        for (var i = 0; i < deelnemers.length; i++) {
            if (deelnemers[i].isIk) { plek = i + 1; break; }
        }

        var staart;
        if (plek === 1) {
            var tweede = deelnemers[1];
            var voor = spel.punten - tweede.punten;
            staart = voor === 0
                ? 'nek aan nek met ' + ontsnap(tweede.naam)
                : 'voorsprong ' + voor + ' op ' + ontsnap(tweede.naam);
        } else {
            var boven = deelnemers[plek - 2];
            var achter = boven.punten - spel.punten;
            staart = achter === 0
                ? 'gelijk met ' + ontsnap(boven.naam)
                : ontsnap(boven.naam) + ' staat ' + achter + ' voor';
        }
        el.rangstrip.innerHTML = '<b>' + plek + 'e</b> van ' + deelnemers.length + ' &middot; ' + staart;
    }

    /* Alle deelnemers van deze ronde: de tegenstanders, de echte medespelers
       (alleen bij samen spelen) en ikzelf. Mijn eigen stand komt uit het spel
       en niet van de server, want die is altijd verser. */
    function alleDeelnemers() {
        var mijnBeste = '';
        for (var m = 0; m < spel.volgorde.length; m++) {
            if (spel.volgorde[m].length > mijnBeste.length) mijnBeste = spel.volgorde[m];
        }

        var deelnemers = spel.bots.map(function (bot) {
            return {
                sleutel: 'b:' + bot.naam,
                naam: bot.naam, punten: bot.punten, woorden: bot.woorden,
                beste: bot.besteWoord, isIk: false, isMens: false, laatIn: 0
            };
        });

        if (spel.samen) {
            Samen.anderen().forEach(function (ander) {
                deelnemers.push({
                    sleutel: 's:' + ander.id,
                    naam: ander.naam, punten: ander.punten, woorden: ander.woorden,
                    beste: '', isIk: false, isMens: true,
                    laatIn: ander.meegedaanVanaf > 5 ? ander.meegedaanVanaf : 0
                });
            });
        }

        deelnemers.push({
            sleutel: 's:' + (Samen.spelerId || 'ik'),
            naam: spel.naam, punten: spel.punten, woorden: spel.volgorde.length,
            beste: mijnBeste, isIk: true, isMens: true, laatIn: 0
        });

        /* Deze volgorde moet bij elke speler identiek uitpakken, anders staat
           dezelfde ronde bij twee mensen in een andere volgorde. Daarom geen
           localeCompare (die hangt van de taalinstelling af) en geen isIk als
           laatste criterium (die verschilt per speler per definitie), maar een
           sleutel die overal hetzelfde is. */
        deelnemers.sort(function (a, b) {
            if (b.punten !== a.punten) return b.punten - a.punten;
            if (b.woorden !== a.woorden) return b.woorden - a.woorden;
            if (a.naam !== b.naam) return a.naam < b.naam ? -1 : 1;
            return a.sleutel < b.sleutel ? -1 : a.sleutel > b.sleutel ? 1 : 0;
        });
        return deelnemers;
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

    /* samenRonde is de ronde zoals de server hem beschrijft, of null bij solo.
       In een gedeelde ronde komt alle willekeur uit het zaadje, zodat elke
       browser hetzelfde raster en dezelfde tegenstanders uitrekent. Het niveau
       ligt dan ook vast: koos iedereen zijn eigen niveau, dan zaten we met
       verschillende tegenstanders in dezelfde ronde. */
    function startRonde(samenRonde) {
        stopAftellen();

        var willekeur = samenRonde
            ? zaadbareWillekeur(zaadUitTekst(samenRonde.zaad))
            : losseWillekeur;
        var niveau = samenRonde ? 'normaal' : huidigNiveau;

        /* Bij samen spelen moet de eis uit het zaadje volgen, zodat elke
           browser hem hetzelfde afleidt. Deze trekking is met opzet de eerste
           uit de generator, nog voor het raster getrokken wordt. */
        var eisLangWoord = samenRonde ? willekeur() < 0.5 : langWoordSchuld;

        var raster = maakRaster(willekeur, eisLangWoord);
        if (!raster) { el.laadstatus.textContent = 'Kon geen speelbaar raster maken. Probeer opnieuw.'; return; }

        var oplossing = maakOplossing(raster);
        var naam = (el.naam.value || '').trim() || 'Jij';
        Opslag.schrijf('naam', naam);

        spel = {
            oplossing: oplossing,
            naam: naam,
            niveau: niveau,
            gevonden: Object.create(null),
            volgorde: [],
            punten: 0,
            bots: maakBots(niveau, oplossing, willekeur),
            samen: Boolean(samenRonde),
            begonnen: 0,
            loopt: true
        };

        /* Leverde deze ronde geen lang woord, dan moet de volgende het doen. */
        if (!samenRonde) {
            langWoordSchuld = ((oplossing.perLengte[9] || 0) + (oplossing.perLengte[10] || 0)) === 0;
        }

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
        /* In een gedeelde ronde telt de klok van de server. Stap je halverwege
           in, dan begin je dus ook halverwege; dat is nu juist de bedoeling. */
        spel.begonnen = samenRonde ? Samen.lokaal(samenRonde.gestartOp) : Date.now();
        klok = window.setInterval(tik, 100);
        tik();
    }

    function tik() {
        if (!spel || !spel.loopt) return;
        var verstreken = (Date.now() - spel.begonnen) / 1000;
        /* In een gedeelde ronde is de server de baas over het einde; anders
           zou een browser met een afwijkende klok eerder of later stoppen
           dan de rest. */
        var over = spel.samen
            ? Math.max(0, (Samen.lokaal(Samen.eindigtOp) - Date.now()) / 1000)
            : Math.max(0, RONDE_SECONDEN - verstreken);

        var hele = Math.ceil(over);
        var minuten = Math.floor(hele / 60);
        var seconden = hele % 60;
        el.tijd.textContent = minuten + ':' + (seconden < 10 ? '0' : '') + seconden;
        el.tijd.parentNode.classList.toggle('is-krap', over <= 10);

        if (over <= 10 && hele !== laatsteTik && hele > 0) {
            laatsteTik = hele;
            Geluid.tik();
        }

        werkBotsBij(spel.bots, verstreken);
        werkLiveRanglijstBij();

        if (over <= 0) beeindig();
    }

    function beeindig() {
        if (!spel) return;
        spel.loopt = false;
        window.clearInterval(klok);
        klok = null;
        wisSelectie();
        werkBotsBij(spel.bots, RONDE_SECONDEN);
        Geluid.einde();
        toonUitslag();
        toonScherm('uitslag');
        scrollNaarMijnRij();

        /* Niet wachten op de volgende klop: de punten van de laatste seconden
           moeten de anderen halen voordat zij hun scorebord tekenen. */
        if (spel.samen && Samen.aan) Samen.klop();
    }

    /* Bij twintig deelnemers staat je eigen regel zelden vanzelf in beeld.
       Dit kan pas als het uitslagscherm getoond is: zolang het verborgen is,
       heeft de scrollbak geen hoogte en blijft scrollTop op nul staan. */
    function scrollNaarMijnRij() {
        var mijnRij = document.getElementById('mijn-rij');
        if (!mijnRij) return;
        el.eindstandVak.scrollTop = Math.max(0,
            mijnRij.offsetTop - el.eindstandVak.clientHeight / 2 + mijnRij.offsetHeight / 2);
    }

    /* De eindstand wordt tijdens het scorebord opnieuw getekend zodra er
       verse standen binnenkomen. Zonder dat bevriest ieders scherm op de
       laatste polling voor de finish, en ziet iedereen andere eindcijfers. */
    function tekenEindstand() {
        var maximum = spel.oplossing.maximum;
        var percentage = maximum > 0 ? (spel.punten / maximum) * 100 : 0;

        var deelnemers = alleDeelnemers();

        var plek = 0;
        var html = '';
        for (var i = 0; i < deelnemers.length; i++) {
            var d = deelnemers[i];
            if (d.isIk) plek = i + 1;
            var klassen = (d.isIk ? 'ik' : '') + (d.isMens && !d.isIk ? ' mens' : '');
            var onder = d.laatIn
                ? '<span class="beste-woord">meegedaan vanaf ' + d.laatIn + ' s</span>'
                : (d.beste ? '<span class="beste-woord">' + ontsnap(d.beste) + '</span>' : '');
            html += '<tr' + (klassen.trim() ? ' class="' + klassen.trim() + '"' : '') +
                (d.isIk ? ' id="mijn-rij"' : '') + '>' +
                '<td>' + (i + 1) + '</td>' +
                '<td>' + ontsnap(d.naam) + onder + '</td>' +
                '<td>' + d.woorden + '</td>' +
                '<td>' + d.punten + '</td></tr>';
        }
        el.eindstand.innerHTML = html;



        el.uitslagSamenvatting.innerHTML =
            'Plaats <strong>' + plek + '</strong> van ' + deelnemers.length + '. Je vond <strong>' +
            spel.volgorde.length + '</strong> van de ' + spel.oplossing.woorden.length +
            ' woorden en scoorde <strong>' + spel.punten + '</strong> van de ' + maximum +
            ' punten (' + percentage.toFixed(1).replace('.', ',') + ' %).';
    }

    function toonUitslag() {
        var maximum = spel.oplossing.maximum;
        var percentage = maximum > 0 ? (spel.punten / maximum) * 100 : 0;

        tekenEindstand();

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

        sessie.rondes++;
        sessie.punten += spel.punten;
        sessie.maximum += maximum;
        sessie.woorden += spel.volgorde.length;

        if (sessie.rondes > 1) {
            var sessiePercentage = sessie.maximum > 0 ? (sessie.punten / sessie.maximum) * 100 : 0;
            el.sessie.hidden = false;
            el.sessie.textContent = 'Sessie: ' + sessie.rondes + ' rondes, ' + sessie.woorden +
                ' woorden, ' + sessie.punten + ' punten (' +
                sessiePercentage.toFixed(1).replace('.', ',') + ' %)';
        } else {
            el.sessie.hidden = true;
        }

        if (spel.samen) startSamenAftellen(); else startAftellen();
        /* In een gedeelde ronde kun je niet eerder beginnen dan de anderen. */
        el.opnieuwKnop.hidden = Boolean(spel.samen);
    }

    /* ---------------------------------------------------------------- *
     * Doorspelen: scorebord, aftellen, volgende ronde                   *
     * ---------------------------------------------------------------- */

    /* Het aftellen staat stil zolang de speler de gemiste woorden openklapt
       of het tabblad weg is: niemand wordt een nieuwe ronde in getrokken
       terwijl hij nog zit te lezen. */
    function aftellenGepauzeerd() {
        if (document.hidden) return true;
        var lijsten = el.uitslagscherm.querySelectorAll('details');
        for (var i = 0; i < lijsten.length; i++) {
            if (lijsten[i].open) return true;
        }
        return false;
    }

    function tekenAftellen() {
        var pauze = aftellenGepauzeerd();
        el.aftellen.classList.toggle('is-pauze', pauze);
        el.aftelVul.style.width = pauze ? '100%' : (aftelRest / PAUZE_SECONDEN * 100) + '%';
        el.aftelTekst.textContent = pauze
            ? 'Het aftellen staat stil zolang je leest.'
            : 'Volgende ronde over ' + aftelRest + '\u2026';
    }

    function startAftellen() {
        stopAftellen();
        aftelRest = PAUZE_SECONDEN;
        el.aftellen.hidden = false;
        tekenAftellen();
        aftelKlok = window.setInterval(function () {
            if (aftellenGepauzeerd()) { tekenAftellen(); return; }
            aftelRest--;
            tekenAftellen();
            if (aftelRest <= 0) { stopAftellen(); startRonde(); }
        }, 1000);
    }

    /* Bij samen spelen bepaalt de server wanneer de volgende ronde begint. Het
       aftellen hier is dus alleen weergave: de ronde wordt gestart door de
       eerstvolgende klop die een nieuwe ronde meldt, nooit door deze klok.
       Anders zouden twee browsers met een iets andere klok uit de pas lopen. */
    function startSamenAftellen() {
        stopAftellen();
        el.aftellen.hidden = false;
        el.aftellen.classList.remove('is-pauze');

        var teken = function () {
            var rest = Math.max(0, Math.round((Samen.lokaal(Samen.pauzeTot) - Date.now()) / 1000));
            el.aftelVul.style.width = Math.min(100, rest / PAUZE_SECONDEN * 100) + '%';
            el.aftelTekst.textContent = rest > 0
                ? 'Volgende ronde over ' + rest + '\u2026'
                : 'Wachten op de volgende ronde\u2026';
        };
        teken();
        aftelKlok = window.setInterval(teken, 250);
    }

    function stopAftellen() {
        if (aftelKlok) { window.clearInterval(aftelKlok); aftelKlok = null; }
        el.aftellen.hidden = true;
    }

    document.addEventListener('visibilitychange', function () {
        if (aftelKlok) tekenAftellen();
        Samen.bijTerugkeer();
    });

    window.addEventListener('pagehide', function () { Samen.meldAf(); });

    Array.prototype.forEach.call(el.uitslagscherm.querySelectorAll('details'), function (blok) {
        blok.addEventListener('toggle', function () { if (aftelKlok) tekenAftellen(); });
    });

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

    el.startKnop.addEventListener('click', function () {
        Geluid.wek();
        nieuweSessie();
        startRonde();
    });
    el.opnieuwKnop.addEventListener('click', function () { stopAftellen(); startRonde(); });
    el.menuKnop.addEventListener('click', function () {
        stopAftellen();
        if (Samen.aan) Samen.verlaat();
        nieuweSessie();
        el.opnieuwKnop.hidden = false;
        toonScherm('start');
    });

    el.samenKnop.addEventListener('click', function () {
        Geluid.wek();
        nieuweSessie();
        el.samenKnop.disabled = true;
        el.samenKnop.textContent = 'Aansluiten\u2026';

        Samen.vraag('/samen/meedoen', { naam: (el.naam.value || '').trim() || 'Jij' })
            .then(function (beeld) {
                Samen.aan = true;
                Samen.neemOver(beeld);
                Samen.startPollen();

                if (beeld.fase === 'scorebord') {
                    /* Er wordt net afgerond. Instappen in een ronde die al
                       voorbij is heeft geen zin, dus wachten we op de volgende;
                       de eerstvolgende klop start hem. */
                    el.laadstatus.textContent = 'Er wordt net een ronde afgerond. ' +
                        'Je doet mee vanaf de volgende, die begint zo.';
                } else {
                    startRonde(beeld.ronde);
                }
            })
            .catch(function (fout) {
                el.laadstatus.textContent = 'Samen spelen lukte niet (' + fout.message +
                    '). Solo spelen kan gewoon.';
            })
            .then(function () {
                el.samenKnop.disabled = false;
                el.samenKnop.textContent = 'Samen spelen';
            });
    });
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
                if (Samen.beschikbaar()) {
                    el.samenKnop.hidden = false;
                    el.samenUitleg.hidden = false;
                }
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
