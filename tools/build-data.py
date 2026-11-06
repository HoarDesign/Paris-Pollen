#!/usr/bin/env python3
"""Extrait les arbres allergisants du CSV « les-arbres » (Paris Open Data)
et écrit un JSON compact pour la web app.

Usage : python3 tools/build-data.py les-arbres-2.csv data/arbres.json
"""
import csv, json, sys, re

GENRES = {
    "BETULA", "ALNUS", "CARPINUS", "CORYLUS", "FRAXINUS", "CUPRESSUS",
    "X CUPRESSOCYPARIS", "OLEA", "BROUSSONETIA", "PLATANUS", "QUERCUS",
    "TILIA", "ACER", "FAGUS", "SALIX", "LIGUSTRUM",
}

SMALL = {"de", "du", "des", "la", "le", "les", "et", "d", "l", "à", "au", "aux", "sur", "en"}


def nice(text):
    text = (text or "").strip()
    if not text:
        return ""
    words = re.split(r"(\s+|/|-|')", text.lower())
    out = []
    for i, w in enumerate(words):
        if w and w not in SMALL and w.strip() and w not in "/-'":
            w = w[0].upper() + w[1:]
        out.append(w)
    s = "".join(out)
    return s[0].upper() + s[1:]


def arrondissement(text):
    text = (text or "").strip().upper()
    m = re.match(r"PARIS (\d+)(ER|E) ARRDT", text)
    if m:
        n = int(m.group(1))
        return f"Paris {n}{'er' if n == 1 else 'e'}"
    return nice(text)


def main(src, dst):
    species, species_idx = [], {}
    addrs, addr_idx = [], {}
    trees = []
    with open(src, encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh, delimiter=";")
        for row in reader:
            genre = (row.get("GENRE") or "").strip()
            key = genre.upper()
            if key not in GENRES:
                continue
            try:
                lat = float(row["LATITUDE"]); lon = float(row["LONGITUDE"])
            except (TypeError, ValueError, KeyError):
                continue
            espece = (row.get("ESPECE") or "").strip()
            libelle = (row.get("LIBELLE FRANCAIS") or "").strip()
            sk = (key, espece, libelle)
            if sk not in species_idx:
                species_idx[sk] = len(species)
                species.append([key, espece, libelle])
            lieu = nice(row.get("LIEU / ADRESSE"))
            arr = arrondissement(row.get("ARRONDISSEMENT"))
            addr = f"{lieu} · {arr}" if lieu and arr else (lieu or arr)
            if addr not in addr_idx:
                addr_idx[addr] = len(addrs)
                addrs.append(addr)
            trees.append([species_idx[sk], round(lat * 1e5), round(lon * 1e5), addr_idx[addr]])
    with open(dst, "w", encoding="utf-8") as out:
        json.dump({"source": "Paris Open Data, « Les arbres »", "species": species,
                   "addresses": addrs, "trees": trees}, out, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(trees)} arbres, {len(species)} espèces, {len(addrs)} adresses -> {dst}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
