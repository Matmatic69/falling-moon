import geoData from "../geo/geo-data.json";
import { norm } from "./normalize";

export interface DeptShape {
  code: string;
  nom: string;
  lat: number;
  lng: number;
  rings: number[][];
}

export interface CommuneShape {
  code: string;
  nom: string;
  rings: number[][];
}

interface GeoData {
  source: string;
  cp: Record<string, [number, number, string]>;
  depts: DeptShape[];
  communes: CommuneShape[];
}

export const GEO = geoData as unknown as GeoData;

const byLabel = new Map<string, string[]>();
const byPrefix = new Map<string, [number, number, number]>();
for (const [cp, [lat, lng, label]] of Object.entries(GEO.cp)) {
  const key = cp.slice(0, 2) + "|" + norm(label);
  const list = byLabel.get(key);
  if (list) list.push(cp);
  else byLabel.set(key, [cp]);
  const p = byPrefix.get(cp.slice(0, 3)) ?? [0, 0, 0];
  byPrefix.set(cp.slice(0, 3), [p[0] + lat, p[1] + lng, p[2] + 1]);
}
const deptByCode = new Map(GEO.depts.map((d) => [d.code, d]));

export function deptCode(cp: string): string {
  if (!/^\d{5}$/.test(cp)) return "";
  if (cp.startsWith("20")) return Number(cp) < 20200 ? "2A" : "2B";
  if (cp.startsWith("97")) return cp.slice(0, 3);
  return cp.slice(0, 2);
}

export function deptName(code: string): string {
  return deptByCode.get(code)?.nom ?? (code ? `Dépt ${code}` : "Inconnu");
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Décale le point de façon stable (même client → même place) pour éviter les empilements. */
function jitter(id: string, lat: number, lng: number, km: number): [number, number] {
  const h = hash(id);
  const angle = ((h & 0xffff) / 0xffff) * Math.PI * 2;
  const r = Math.sqrt(((h >>> 16) & 0xffff) / 0xffff) * km;
  return [lat + (r / 111) * Math.sin(angle), lng + (r / (111 * Math.cos((lat * Math.PI) / 180))) * Math.cos(angle)];
}

export interface Position {
  lat: number;
  lng: number;
  geo: "cp" | "ville" | "dept";
}

/** Position d'un client à partir du code postal et de la ville (CEDEX compris). */
export function locate(id: string, cpRaw: string, villeRaw: string): Position | undefined {
  let cp = (cpRaw || "").replace(/\D/g, "");
  if (cp.length === 4) cp = "0" + cp;
  const ville = norm(villeRaw);
  const cedex = ville.match(/^(.*?)\s*CEDEX\s*(\d+)?$/);
  const base = cedex ? cedex[1] : ville;
  const dept = deptCode(cp);

  let hit: [number, number] | undefined;
  let geo: Position["geo"] = "cp";
  if (GEO.cp[cp]) hit = [GEO.cp[cp][0], GEO.cp[cp][1]];
  if (!hit && base === "LYON" && cedex?.[2] && Number(cedex[2]) >= 1 && Number(cedex[2]) <= 9) {
    const c = GEO.cp["6900" + Number(cedex[2])];
    if (c) hit = [c[0], c[1]];
  }
  if (!hit && dept) {
    const cps = byLabel.get(cp.slice(0, 2) + "|" + base);
    if (cps) {
      hit = [GEO.cp[cps[0]][0], GEO.cp[cps[0]][1]];
      geo = "ville";
    }
  }
  if (!hit && cp.length === 5) {
    const p = byPrefix.get(cp.slice(0, 3));
    if (p) {
      hit = [p[0] / p[2], p[1] / p[2]];
      geo = "ville";
    }
  }
  if (!hit && dept && deptByCode.get(dept)) {
    const d = deptByCode.get(dept)!;
    hit = [d.lat, d.lng];
    geo = "dept";
  }
  if (!hit) return undefined;
  const [lat, lng] = jitter(id, hit[0], hit[1], geo === "cp" ? 0.9 : geo === "ville" ? 1.6 : 9);
  return { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5, geo };
}

/** Libellé de ville propre (« LYON CEDEX 06 » → « Lyon »), via la table La Poste quand c'est possible. */
/** Ville pour les regroupements : Lyon tous arrondissements confondus, sans CEDEX. */
export function cityKey(cp: string, ville: string): string {
  return cp.startsWith("690") && /^LYON/i.test(ville) ? "LYON" : ville.replace(/\s*CEDEX.*$/i, "").toUpperCase();
}

export function cleanCity(cp: string, ville: string): string {
  const v = norm(ville).replace(/\s*CEDEX\s*\d*$/, "");
  return v || (GEO.cp[cp]?.[2] ?? "");
}
