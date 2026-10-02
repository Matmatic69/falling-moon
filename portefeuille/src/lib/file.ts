import type { Envelope } from "./crypto";
import type { Role } from "../core/types";

/** Bloc de données en clair autour de l'enveloppe chiffrée (de quoi afficher l'écran de déverrouillage). */
export interface FileMeta {
  app: "portefeuille";
  v: 1;
  role: Role;
  /** Prénom du destinataire d'un fichier commercial. */
  pour?: string;
  fileId: string;
  savedAt: string;
  env: Envelope;
}

export function readEmbedded(): FileMeta | null {
  const el = document.getElementById("pf-data");
  if (!el?.textContent?.trim()) return null;
  try {
    const meta = JSON.parse(el.textContent) as FileMeta;
    return meta.app === "portefeuille" ? meta : null;
  } catch {
    return null;
  }
}

const safeJson = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

/** Reconstruit un fichier HTML autonome : le même programme, avec d'autres données. */
export function buildHtml(meta: FileMeta | null, title: string): string {
  const css = document.getElementById("pf-css")?.textContent ?? "";
  const app = document.getElementById("pf-app")?.textContent ?? "";
  const esc = title.replace(/[<&]/g, (c) => (c === "<" ? "&lt;" : "&amp;"));
  return (
    "<!doctype html>\n<html lang=\"fr\">\n<head>\n<meta charset=\"utf-8\">\n" +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n' +
    '<meta name="robots" content="noindex">\n' +
    `<title>${esc}</title>\n<style id="pf-css">${css}</style>\n</head>\n<body>\n<div id="root"></div>\n` +
    (meta ? `<script id="pf-data" type="application/json">${safeJson(meta)}</script>\n` : "") +
    `<script id="pf-app">${app}</script>\n</body>\n</html>\n`
  );
}

export function download(name: string, content: BlobPart, type = "text/html;charset=utf-8"): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function readFileAsText(file: File): Promise<string> {
  return file.text();
}
