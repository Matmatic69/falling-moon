// Génère src/geo/geo-data.json : table code postal -> coordonnées, contours
// simplifiés des départements et des communes du Rhône, pour une carte 100 % hors-ligne.
//
// Sources publiques (Licence Ouverte / Etalab) :
//  - contours : https://github.com/gregoiredavid/france-geojson (IGN ADMIN EXPRESS)
//  - codes postaux : paquet npm `codes-postaux` (base officielle La Poste)
//
// Usage : npm run geo   (télécharge les sources dans .cache/ si absentes)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = path.join(root, ".cache");
const outFile = path.join(root, "src/geo/geo-data.json");
const BASE = "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/";

async function cached(name) {
  const file = path.join(cacheDir, name);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(cacheDir, { recursive: true });
    const res = await fetch(BASE + name);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

// --- géométrie -------------------------------------------------------------
function ringsOf(geometry) {
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

/** Centroïde pondéré par l'aire (sur l'anneau extérieur de chaque polygone). */
function centroid(geometry) {
  let a = 0, cx = 0, cy = 0;
  for (const poly of ringsOf(geometry)) {
    const ring = poly[0];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x0, y0] = ring[j];
      const [x1, y1] = ring[i];
      const f = x0 * y1 - x1 * y0;
      a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
    }
  }
  if (Math.abs(a) < 1e-12) {
    const pts = ringsOf(geometry).flatMap((p) => p[0]);
    const n = pts.length || 1;
    return [pts.reduce((s, p) => s + p[1], 0) / n, pts.reduce((s, p) => s + p[0], 0) / n];
  }
  return [cy / (3 * a), cx / (3 * a)]; // [lat, lng]
}

function perpDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  if (!len) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

function simplify(points, tol) {
  if (points.length < 4) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let max = 0, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpDist(points[i], points[s], points[e]);
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol && idx > 0) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
  }
  return points.filter((_, i) => keep[i]);
}

/** Polygones -> liste d'anneaux extérieurs simplifiés, aplatis [lng,lat,lng,lat...]. */
function outline(geometry, tol, digits) {
  const out = [];
  for (const poly of ringsOf(geometry)) {
    const ring = simplify(poly[0], tol);
    if (ring.length < 4) continue;
    out.push(ring.flatMap(([x, y]) => [round(x, digits), round(y, digits)]));
  }
  return out;
}

// Les arrondissements de Lyon n'existent pas dans les contours communaux :
// centroïdes approximatifs pour que Lyon ne soit pas un seul point.
const LYON_ARR = {
  69381: [45.7675, 4.832], 69382: [45.7485, 4.827], 69383: [45.757, 4.862],
  69384: [45.779, 4.826], 69385: [45.759, 4.802], 69386: [45.772, 4.852],
  69387: [45.734, 4.839], 69388: [45.735, 4.869], 69389: [45.776, 4.805],
};

// --- main ------------------------------------------------------------------
const departements = await cached("departements-version-simplifiee.geojson");
const communes = await cached("communes-version-simplifiee.geojson");
const codesPostaux = require("codes-postaux/codes-postaux.json");

const communeCentre = new Map();
for (const f of communes.features) if (f.geometry) communeCentre.set(f.properties.code, centroid(f.geometry));

const parentOf = (code) => {
  if (/^751\d\d$/.test(code)) return "75056";
  if (/^132\d\d$/.test(code)) return "13055";
  if (/^6938\d$/.test(code)) return "69123";
  return null;
};

const byCp = new Map();
let missing = 0;
for (const e of codesPostaux) {
  const c = LYON_ARR[e.codeCommune] ?? communeCentre.get(e.codeCommune) ?? communeCentre.get(parentOf(e.codeCommune));
  if (!c) { missing++; continue; }
  const cur = byCp.get(e.codePostal) ?? { lat: 0, lng: 0, n: 0, labels: new Map() };
  cur.lat += c[0]; cur.lng += c[1]; cur.n++;
  cur.labels.set(e.libelleAcheminement, (cur.labels.get(e.libelleAcheminement) ?? 0) + 1);
  byCp.set(e.codePostal, cur);
}

const cp = {};
for (const [code, v] of [...byCp].sort((a, b) => a[0].localeCompare(b[0]))) {
  const label = [...v.labels].sort((a, b) => b[1] - a[1])[0][0];
  cp[code] = [round(v.lat / v.n, 4), round(v.lng / v.n, 4), label];
}

const metropole = departements.features.filter((f) => !/^97/.test(f.properties.code));
const depts = metropole
  .map((f) => {
    const [lat, lng] = centroid(f.geometry);
    return { code: f.properties.code, nom: f.properties.nom, lat: round(lat, 3), lng: round(lng, 3), rings: outline(f.geometry, 0.006, 3) };
  })
  .sort((a, b) => a.code.localeCompare(b.code));

// Détail communal pour le cœur de la zone (Rhône + Métropole de Lyon).
const DETAIL = new Set(["69"]);
const communesDetail = communes.features
  .filter((f) => f.geometry && DETAIL.has(f.properties.code.slice(0, 2)))
  .map((f) => ({ code: f.properties.code, nom: f.properties.nom, rings: outline(f.geometry, 0.0012, 4) }));

const data = { source: "IGN ADMIN EXPRESS via france-geojson · La Poste via codes-postaux", cp, depts, communes: communesDetail };
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(data));
console.log(
  `codes postaux: ${Object.keys(cp).length} (communes introuvables: ${missing}) · départements: ${depts.length} · communes détaillées: ${communesDetail.length} · ${(fs.statSync(outFile).size / 1024).toFixed(0)} Ko`,
);
