# Paris Pollens

Carte des arbres allergisants de Paris et indice pollen quotidien (Atmo France / Airparif), selon vos allergies.

## Structure

| Fichier | Rôle |
| --- | --- |
| `index.html`, `css/app.css`, `js/app.js` | La web app (site statique) |
| `data/arbres.json` | Arbres allergisants extraits du CSV « Les arbres » (Paris Open Data) |
| `data/pollen.json` | Indice pollen du jour, écrit chaque jour par GitHub Actions |
| `tools/build-data.py` | Régénère `data/arbres.json` à partir d'un nouveau CSV |
| `tools/fetch-pollen.py` | Récupère l'indice pollen et écrit `data/pollen.json` |
| `.github/workflows/pollen.yml` | Lance `fetch-pollen.py` tous les jours vers 12 h 15 |

## Mise à jour des arbres

```bash
python3 tools/build-data.py les-arbres-2.csv data/arbres.json
```

Le CSV (37 Mo) n'est pas versionné (voir `.gitignore`).

## Indice pollen

1. Demander un compte Atmo Data : https://admindata.atmo-france.org/inscription-api
2. Dans le dépôt GitHub : Settings › Secrets and variables › Actions › New repository secret
   - `ATMO_USERNAME` : votre identifiant Atmo Data
   - `ATMO_PASSWORD` : votre mot de passe
3. Actions › « Indice pollen quotidien » › Run workflow, pour un premier essai.

Si l'essai échoue sur la route des données, vérifier la route pollen dans la documentation
(https://admindata.atmo-france.org/api/doc/v2) et la renseigner dans Settings › Secrets and variables ›
Actions › Variables : `ATMO_ROUTE` (ex. `/api/v2/data/indices/pollens`) ou `ATMO_DATA_ID`.

Tant que `data/pollen.json` n'existe pas ou date d'avant aujourd'hui, l'app affiche une estimation
signalée « Démo ».

## Tester en local

```bash
python3 -m http.server 8000
```

puis ouvrir http://localhost:8000

Sources : Paris Open Data (arbres), RNSA (potentiel allergisant), Atmo France / Airparif (indice pollen, ODbL),
OpenStreetMap (fond de carte).
