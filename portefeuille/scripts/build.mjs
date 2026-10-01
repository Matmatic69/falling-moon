// Construit le fichier HTML autonome (programme + styles intégrés, aucune ressource externe).
//
//   npm run build                       → dist/portefeuille.html (vide : il demandera l'export ERP)
//   npm run build -- --watch            → reconstruit à chaque modification
//   npm run build -- --data Export.xlsx --password "…" --equipe "Prénom:18,Prénom2,Prénom3" --parti "17:Prénom"
//                     --out mon-fichier.html
//                                       → fichier déjà rempli et chiffré (à ne jamais committer)
import { build, context, transform } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const watch = args.includes("--watch");
const dataFile = opt("--data");
const password = opt("--password");
const out = path.resolve(opt("--out") ?? path.join(root, "dist/portefeuille.html"));

const appOptions = {
  entryPoints: [path.join(root, "src/main.tsx")],
  bundle: true,
  minify: !watch,
  format: "iife",
  target: ["es2020", "chrome90", "firefox90", "safari15"],
  jsx: "automatic",
  legalComments: "none",
  define: { "process.env.NODE_ENV": watch ? '"development"' : '"production"' },
  write: false,
  logLevel: "warning",
};

async function html(js, meta) {
  const css = (await transform(fs.readFileSync(path.join(root, "src/styles.css"), "utf8"), { loader: "css", minify: true })).code;
  const safeJs = js.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
  const data = meta ? `<script id="pf-data" type="application/json">${JSON.stringify(meta).replace(/</g, "\\u003c")}</script>\n` : "";
  return (
    '<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<meta name="robots" content="noindex">\n' +
    `<title>Portefeuille clients</title>\n<style id="pf-css">${css}</style>\n</head>\n<body>\n<div id="root"></div>\n${data}` +
    `<script id="pf-app">${safeJs}</script>\n</body>\n</html>\n`
  );
}

async function prefill() {
  if (!dataFile) return null;
  if (!password || password.length < 8) throw new Error("--password (8 caractères minimum) est requis avec --data");
  const bundle = path.join(root, ".cache/prefill.bundle.mjs");
  await build({
    entryPoints: [path.join(root, "scripts/prefill-entry.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: bundle,
    external: ["xlsx"],
    logLevel: "error",
  });
  const mod = await import(bundle + "?t=" + Date.now());
  const [resp, ...others] = (opt("--equipe") ?? "Responsable:18,Commercial 1,Commercial 2").split(",");
  const [respNom, respCode = ""] = resp.split(":");
  const [partiCode, partiNom = ""] = (opt("--parti") ?? "").split(":");
  const setup = { responsable: { nom: respNom, code: respCode }, commerciaux: others, parti: partiCode ? { code: partiCode, nom: partiNom } : undefined };
  return mod.prefill(path.resolve(dataFile), password, setup);
}

async function once() {
  const res = await build(appOptions);
  const meta = await prefill();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, await html(res.outputFiles[0].text, meta));
  console.log(`✓ ${path.relative(process.cwd(), out)} (${(fs.statSync(out).size / 1024).toFixed(0)} Ko)${meta ? " — rempli et chiffré" : ""}`);
}

if (watch) {
  const ctx = await context({
    ...appOptions,
    plugins: [
      {
        name: "write-html",
        setup(b) {
          b.onEnd(async (r) => {
            if (r.errors.length) return;
            fs.mkdirSync(path.dirname(out), { recursive: true });
            fs.writeFileSync(out, await html(r.outputFiles[0].text, await prefill()));
            console.log(`✓ ${new Date().toLocaleTimeString("fr-FR")} ${path.relative(process.cwd(), out)}`);
          });
        },
      },
    ],
  });
  await ctx.watch();
} else {
  await once();
}
