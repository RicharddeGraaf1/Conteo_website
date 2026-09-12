#!/usr/bin/env python3
"""Bouwt public/woordjacht/woorden.txt uit de OpenTaal-woordenlijst.

Bron : https://github.com/OpenTaal/opentaal-wordlist  (BSD-3 / CC BY 3.0)
Versie in gebruik: 2.20.23 (2023-03-10). De licentie staat naast de
woordenlijst in public/woordjacht/woorden-LICENSE.txt; OpenTaal vraagt die
kopie bij elke kopie van de lijst te bewaren.
Uitvoer: front-gecodeerde, alfabetisch gesorteerde lijst. Elke regel is
één teken met de lengte van het gedeelde voorvoegsel met de vorige regel
(chr(48 + n)) gevolgd door de rest van het woord. Dat halveert het bestand
en comprimeert daarna nog eens flink over HTTP.

Gebruik:  python3 tools/bouw-woordenlijst.py [pad/naar/wordlist.txt]
Zonder argument wordt de lijst van GitHub gehaald.
"""
import re
import sys
import urllib.request
from pathlib import Path

BRON = "https://raw.githubusercontent.com/OpenTaal/opentaal-wordlist/master/wordlist.txt"
UITVOER = Path(__file__).resolve().parent.parent / "public" / "woordjacht" / "woorden.txt"

# Een 4x4-raster kan hooguit 16 letters aaneenrijgen, maar woorden van meer
# dan 12 letters zijn in de praktijk onvindbaar en kosten alleen bandbreedte.
MIN_LENGTE, MAX_LENGTE = 3, 12

# Alleen kleine letters a-z: geen eigennamen (hoofdletter), geen koppelteken,
# geen cijfers en geen diakrieten -- die staan immers niet op de stenen.
TOEGESTAAN = re.compile(r"^[a-z]{%d,%d}$" % (MIN_LENGTE, MAX_LENGTE))


def lees_bron(argv):
    if len(argv) > 1:
        return Path(argv[1]).read_text(encoding="utf-8")
    print(f"Ophalen: {BRON}")
    with urllib.request.urlopen(BRON) as r:
        return r.read().decode("utf-8")


def front_codeer(woorden):
    regels, vorige = [], ""
    for woord in woorden:
        gedeeld = 0
        grens = min(len(vorige), len(woord))
        while gedeeld < grens and vorige[gedeeld] == woord[gedeeld]:
            gedeeld += 1
        regels.append(chr(48 + gedeeld) + woord[gedeeld:])
        vorige = woord
    return "\n".join(regels)


def main():
    ruw = lees_bron(sys.argv)
    woorden = sorted({w for w in (r.strip() for r in ruw.splitlines()) if TOEGESTAAN.match(w)})
    UITVOER.parent.mkdir(parents=True, exist_ok=True)
    UITVOER.write_text(front_codeer(woorden), encoding="utf-8")
    plat = sum(len(w) + 1 for w in woorden)
    print(f"{len(woorden)} woorden -> {UITVOER}")
    print(f"  plat {plat / 1e6:.2f} MB, gecodeerd {UITVOER.stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
