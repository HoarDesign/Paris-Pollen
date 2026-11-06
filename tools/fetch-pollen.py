#!/usr/bin/env python3
"""Récupère une fois par jour l'indice pollen (Atmo France / Airparif) pour Paris
et l'écrit dans data/pollen.json, lu par la web app.

Lancé par GitHub Actions (.github/workflows/pollen.yml). Variables d'environnement :
  ATMO_USERNAME, ATMO_PASSWORD   identifiants Atmo Data (secrets GitHub)
  ATMO_BASE      (facultatif) défaut : https://admindata.atmo-france.org
  ATMO_ROUTE     (facultatif) défaut : /api/v2/data/indices/pollens
  ATMO_DATA_ID   (facultatif) si renseigné, utilise l'ancienne route /api/data/<id>/<filtre>
  CODE_ZONE      (facultatif) code INSEE de la commune, défaut 75056 (Paris)
  OUTPUT         (facultatif) défaut : data/pollen.json

Le script n'écrase pas le fichier existant en cas d'échec : l'app garde alors
la dernière prévision valable (ou affiche une estimation si elle est périmée).
"""
import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = (os.environ.get("ATMO_BASE") or "https://admindata.atmo-france.org").rstrip("/")
ROUTE = os.environ.get("ATMO_ROUTE") or "/api/v2/data/indices/pollens"
DATA_ID = os.environ.get("ATMO_DATA_ID", "").strip()
ZONE = os.environ.get("CODE_ZONE") or "75056"
OUTPUT = os.environ.get("OUTPUT") or "data/pollen.json"

# Champs de l'indice pollen Atmo (notice Atmo France) -> noms affichés dans l'app
TAXA = {"code_aul": "Aulne", "code_boul": "Bouleau", "code_oliv": "Olivier",
        "code_gram": "Graminées", "code_arm": "Armoise", "code_ambr": "Ambroisie"}


def http(method, url, body=None, token=None):
    headers = {"Accept": "application/json", "User-Agent": "paris-pollens/1.0"}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def login():
    user, pwd = os.environ.get("ATMO_USERNAME"), os.environ.get("ATMO_PASSWORD")
    if not user or not pwd:
        sys.exit("ATMO_USERNAME / ATMO_PASSWORD manquants (secrets GitHub).")
    j = http("POST", BASE + "/api/login", {"username": user, "password": pwd})
    token = (j.get("token") or j.get("value") or j.get("access_token")) if isinstance(j, dict) else None
    if not token:
        sys.exit("Connexion Atmo Data : jeton introuvable dans la réponse " + str(list(j)[:10]))
    return token


def records_from(payload):
    """Accepte les formes de réponse courantes : liste, GeoJSON, {data: [...]}."""
    if isinstance(payload, list):
        rows = payload
    elif isinstance(payload, dict):
        rows = payload.get("features") or payload.get("data") or payload.get("results") or payload.get("items") or []
    else:
        rows = []
    out = []
    for r in rows:
        if isinstance(r, dict) and "properties" in r:
            r = r["properties"]
        if isinstance(r, dict):
            out.append(r)
    return out


def fetch(token, today):
    attempts = []
    if DATA_ID:
        flt = json.dumps({"code_zone": {"operator": "=", "value": ZONE},
                          "date_ech": {"operator": ">=", "value": today}})
        attempts.append(f"{BASE}/api/data/{DATA_ID}/{urllib.parse.quote(flt)}?withGeom=false")
    q = urllib.parse.urlencode
    attempts += [
        f"{BASE}{ROUTE}?{q({'code_zone': ZONE, 'date_historique': today, 'date_now': today})}",
        f"{BASE}{ROUTE}?{q({'code_zone': ZONE})}",
    ]
    last = None
    for url in attempts:
        try:
            rows = [r for r in records_from(http("GET", url, token=token)) if str(r.get("code_zone", ZONE)) == ZONE]
            print(f"{len(rows)} enregistrement(s) : {url}")
            if rows:
                print("Champs reçus :", sorted(rows[0].keys()))
                return rows
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code} sur {url}"
            print(last)
    sys.exit("Aucune donnée pollen reçue. " + (last or "") +
             " Vérifiez la route dans la documentation " + BASE + "/api/doc/v2 et réglez ATMO_ROUTE ou ATMO_DATA_ID.")


def main():
    today = dt.date.today().isoformat()
    rows = fetch(login(), today)
    days = {}
    for r in rows:
        date = str(r.get("date_ech", ""))[:10]
        if not date or date < today:
            continue
        taxa = {name: int(r.get(field) or 0) for field, name in TAXA.items()}
        days[date] = {"date": date, "taxa": taxa}
    if not days:
        sys.exit("Données reçues mais aucune prévision à partir d'aujourd'hui.")
    out = {
        "commune": "Paris" if ZONE == "75056" else ZONE,
        "code_zone": ZONE,
        "updated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes"),
        "source": "Atmo France / Airparif — indice pollen communal (ODbL)",
        "days": [days[k] for k in sorted(days)][:3],
    }
    os.makedirs(os.path.dirname(OUTPUT) or ".", exist_ok=True)
    with open(OUTPUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)
    print(f"{OUTPUT} écrit : " + ", ".join(f"{d['date']} -> max {max(d['taxa'].values())}" for d in out["days"]))


if __name__ == "__main__":
    main()
