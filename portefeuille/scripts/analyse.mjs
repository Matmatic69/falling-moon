// Analyse un export ERP en local (aucune donnée n'est écrite dans le dépôt).
// Usage : npm run analyse -- /chemin/vers/Export.xlsx [rapport.json]
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [file, out] = process.argv.slice(2);
if (!file) {
  console.error("Usage : npm run analyse -- Export.xlsx [rapport.json]");
  process.exit(1);
}
await build({
  entryPoints: [path.join(root, "scripts/analyse-entry.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: path.join(root, ".cache/analyse.bundle.mjs"),
  external: ["xlsx"],
  logLevel: "error",
});
const mod = await import(path.join(root, ".cache/analyse.bundle.mjs"));
if (out === "--distribution") await mod.runDistribution(path.resolve(file));
else await mod.run(path.resolve(file), out ? path.resolve(out) : undefined);
