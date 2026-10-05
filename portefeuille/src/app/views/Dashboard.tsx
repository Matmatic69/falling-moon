import { useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import { mainOf } from "../../core/accounts";
import { cityKey, deptCode, deptName } from "../../core/geo";
import { SEGMENTS } from "../../core/segments";
import type { Account } from "../../core/types";
import type { Nav } from "../App";
import { Icon } from "../icons";
import { useStore } from "../store";
import { fmt, memberVar, OwnerBar, pct, Tooltip, Who, w } from "../ui";

interface Row {
  key: string;
  label: string;
  byOwner: Map<string, number>;
  total: number;
}

const POOL = "";

export function Dashboard({ go }: { go: Nav }) {
  const { state, d, duplicates, isAdmin } = useStore();
  const team = state.team;
  const [tip, setTip] = useState<{ x: number; y: number; row: Row } | null>(null);
  const owners = [...team.map((m) => m.id), POOL];
  const accts = useMemo(() => [...d.accounts.values()], [d.accounts]);

  // Tout se compte en comptes, chacun chez son propriétaire principal ; géographie : là où le compte a le plus de sites.
  const group = (key: (a: Account) => string, label: (k: string) => string) => {
    const rows = new Map<string, Row>();
    for (const a of accts) {
      const k = key(a);
      if (!k) continue;
      const r = rows.get(k) ?? { key: k, label: label(k), byOwner: new Map(), total: 0 };
      const o = d.acctOwner.get(a.id) ?? POOL;
      r.byOwner.set(o, (r.byOwner.get(o) ?? 0) + 1);
      r.total++;
      rows.set(k, r);
    }
    return [...rows.values()].sort((a, b) => b.total - a.total);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const bySegment = useMemo(() => group((a) => a.segment, (k) => SEGMENTS.find((s) => s.id === k)!.label), [accts, d.acctOwner]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const deptRows = useMemo(() => group((a) => mainOf(a, d.byId, (c) => deptCode(c.cp)), (k) => `${deptName(k)} (${k})`), [accts, d.acctOwner]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const byCity = useMemo(() => group((a) => mainOf(a, d.byId, (c) => cityKey(c.cp, c.ville)), (k) => k.charAt(0) + k.slice(1).toLowerCase()).slice(0, 12), [accts, d.acctOwner]);
  const byDept = deptRows.slice(0, 10);

  const total = d.accounts.size;
  const located = deptRows.reduce((s, r) => s + r.total, 0);
  const merged = Object.keys(state.merges).length;
  // En comptes : la fiche du payeur fait foi.
  const head = (a: (typeof accts)[number]) => d.byId.get(a.id);
  const estimated = accts.filter((a) => head(a)?.segmentSource === "defaut").length;
  const noContact = accts.filter((a) => a.clientIds.every((id) => { const c = d.byId.get(id); return !c?.tel && !c?.mail && !c?.portable; })).length;
  const added = accts.filter((a) => head(a)?.ajout).length;
  const dups = isAdmin ? duplicates().length : 0;


  const codes = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const a of accts) {
      const o = d.acctOwner.get(a.id) ?? POOL;
      for (const k of a.codes.length ? a.codes : [""]) {
        const row = m.get(k || "—") ?? new Map<string, number>();
        row.set(o, (row.get(o) ?? 0) + 1);
        m.set(k || "—", row);
      }
    }
    return [...m].map(([code, row]) => ({ code, row, n: [...row.values()].reduce((s, v) => s + v, 0) })).sort((a, b) => b.n - a.n);
  }, [accts, d.acctOwner]);

  const color = (id: string) => (id === POOL ? "var(--pool)" : memberVar(team, id));
  const parts = (r: Row) => owners.map((id) => ({ id, value: r.byOwner.get(id) ?? 0, color: color(id) }));
  const max = (rows: Row[]) => Math.max(1, ...rows.map((r) => r.total));
  const legend = (
    <div className="legend">
      {owners.map((id) => (
        <span key={id || "pool"}>
          <i style={{ background: color(id) }} />
          {id ? team.find((m) => m.id === id)?.nom : "À répartir"}
        </span>
      ))}
    </div>
  );
  const hover = (row: Row) => (e: ReactMouseEvent | null) => setTip(e ? { x: e.clientX, y: e.clientY, row } : null);

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <h1>Tableau de bord</h1>
          <p>
            Source : {state.source} · importé le {new Date(state.importedAt).toLocaleDateString("fr-FR")}
          </p>
        </div>
      </div>

      <div className="grid g4">
        <div className="card stat">
          <span className="stat-label">Comptes clients</span>
          <span className="hero-num">{fmt(total)}</span>
          <span className="stat-sub">un client = un compte</span>
        </div>
        <div className="card stat">
          <span className="stat-label">À répartir</span>
          <span className="stat-value">{fmt(d.pool)}</span>
          <span className="stat-sub">{d.pool ? `${pct(d.pool / Math.max(1, total))} des comptes` : "Tout est réparti"}</span>
        </div>
        <div className="card stat">
          <span className="stat-label">Première typologie</span>
          <span className="stat-value">{bySegment[0] ? SEGMENTS.find((g) => g.id === bySegment[0].key)!.court : "–"}</span>
          <span className="stat-sub">
            {bySegment[0] ? `${fmt(bySegment[0].total)} comptes · ${pct(bySegment[0].total / Math.max(1, total))}` : ""}
          </span>
        </div>
        <div className="card stat">
          <span className="stat-label">Départements</span>
          <span className="stat-value">{fmt(deptRows.length)}</span>
          <span className="stat-sub">
            {pct((byDept[0]?.total ?? 0) / Math.max(1, located))} des comptes : {byDept[0]?.label.split(" (")[0]}
          </span>
        </div>
      </div>

      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="card span2">
          <div className="card-head">
            <div className="grow">
              <h3>Typologie des comptes</h3>
              <p>Qui tient quoi, typologie par typologie, en nombre de comptes</p>
            </div>
            {legend}
          </div>
          {bySegment.map((r) => (
            <OwnerBar key={r.key} label={r.label} parts={parts(r)} total={r.total} max={max(bySegment)} onHover={hover(r)} />
          ))}
        </div>

        <div className="card">
          <div className="card-head">
            <div className="grow">
              <h3>Départements</h3>
              <p>Les 10 premiers, en comptes</p>
            </div>
          </div>
          {byDept.map((r) => (
            <OwnerBar key={r.key} label={r.label} parts={parts(r)} total={r.total} max={max(byDept)} onHover={hover(r)} onClick={() => go({ view: "carte" })} />
          ))}
        </div>

        <div className="card">
          <div className="card-head">
            <div className="grow">
              <h3>Villes</h3>
              <p>Les 12 premières, en comptes (Lyon : tous arrondissements)</p>
            </div>
          </div>
          {byCity.map((r) => (
            <OwnerBar key={r.key} label={r.label} parts={parts(r)} total={r.total} max={max(byCity)} onHover={hover(r)} />
          ))}
        </div>

        <div className="card">
          <div className="card-head">
            <div className="grow">
              <h3>Qualité des données</h3>
              <p>Ce que le nettoyage a corrigé, et ce qui reste à surveiller</p>
            </div>
          </div>
          <table className="table">
            <tbody>
              <tr>
                <td>Doublons fusionnés{isAdmin ? ` (${fmt(dups)} groupe(s) encore à vérifier)` : ""}</td>
                <td className="r num">{fmt(merged)}</td>
                <td />
              </tr>
              <tr>
                <td>Comptes à typologie estimée</td>
                <td className="r num">{fmt(estimated)}</td>
                <td className="r num muted">{pct(estimated / Math.max(1, total))}</td>
              </tr>
              <tr>
                <td>Typologies corrigées à la main</td>
                <td className="r num">{fmt(Object.keys(state.segmentOverrides).length)}</td>
                <td />
              </tr>
              <tr>
                <td>Comptes sans téléphone ni e-mail</td>
                <td className="r num">{fmt(noContact)}</td>
                <td className="r num muted">{pct(noContact / Math.max(1, total))}</td>
              </tr>
              <tr>
                <td>Clients ajoutés dans l'outil</td>
                <td className="r num">{fmt(added)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="grow">
              <h3>Par personne</h3>
              <p>Nombre de comptes et part du portefeuille</p>
            </div>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th />
                <th className="r">Comptes</th>
                <th className="r">Part</th>
                <th className="r">Prospects</th>
              </tr>
            </thead>
            <tbody>
              {d.stats.map((s) => (
                <tr key={s.id} className="clickable" onClick={() => go({ view: "portefeuille", id: s.id })}>
                  <td>
                    <Who team={team} id={s.id} />
                  </td>
                  <td className="r num">{fmt(s.comptes)}</td>
                  <td className="r num">{pct(s.comptes / Math.max(1, total))}</td>
                  <td className="r num">{fmt((state.prospects ?? []).filter((p) => p.owner === s.id).length) || "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="grow">
              <h3>Codes commerciaux d'origine (ERP)</h3>
              <p>Où sont partis les comptes de chaque ancien code</p>
            </div>
          </div>
          {codes.slice(0, 8).map((c) => (
            <div key={c.code} style={{ padding: "6px 0" }}>
              <div className="row small">
                <span className="grow">
                  <b>{c.code}</b> <span className="muted">{state.settings.libellesCodes[c.code] ?? ""}</span>
                </span>
                <span className="num dim">{fmt(c.n)}</span>
              </div>
              <div className="meter" style={{ marginTop: 5 }}>
                {owners.map((o) => (c.row.get(o) ? <span key={o || "p"} style={{ width: w(c.row.get(o)! / c.n), background: color(o) }} /> : null))}
              </div>
            </div>
          ))}
          {codes.length > 8 && <p className="small muted">+ {codes.length - 8} autres codes ({fmt(codes.slice(8).reduce((s, c) => s + c.n, 0))} comptes)</p>}
        </div>
      </div>

      <Tooltip at={tip}>
        {tip && (
          <>
            <b>{tip.row.label}</b>
            {owners.map((o) =>
              tip.row.byOwner.get(o) ? (
                <div key={o || "p"} className="row small" style={{ gap: 8 }}>
                  <i style={{ width: 8, height: 8, borderRadius: 2, background: color(o) }} />
                  <span className="grow">{o ? team.find((m) => m.id === o)?.nom : "À répartir"}</span>
                  <span className="num">{fmt(tip.row.byOwner.get(o)!)}</span>
                  <span className="num muted">{pct(tip.row.byOwner.get(o)! / tip.row.total)}</span>
                </div>
              ) : null,
            )}
          </>
        )}
      </Tooltip>
      {!isAdmin && (
        <p className="small muted" style={{ marginTop: 16 }}>
          <Icon name="info" size={13} /> Les chiffres couvrent toute l'équipe ; les coordonnées des clients des autres ne sont pas incluses dans ton fichier.
        </p>
      )}
    </>
  );
}
