import { useMemo, useState } from "react";
import { mainOf } from "../../core/accounts";
import { cityKey, deptCode, deptName } from "../../core/geo";
import { ROLE_LABEL } from "../../core/roles";
import { SEGMENTS, SEGMENT_BY_ID } from "../../core/segments";
import type { SegmentId } from "../../core/types";
import { exportWorkbook } from "../../lib/excel";
import { download, slug, today } from "../../lib/file";
import type { Nav } from "../App";
import { AccountTable } from "../AccountTable";
import { Icon } from "../icons";
import { useStore } from "../store";
import { fmt, memberVar, pct, useToast, Who, w } from "../ui";

export function Portfolio({ id, go, openClient }: { id: string; go: Nav; openClient: (id: string) => void }) {
  const { state, d, owner, isAdmin, session, actions } = useStore();
  const toast = useToast();
  const prospects = (state.prospects ?? []).filter((p) => p.owner === id).sort((a, b) => a.segment.localeCompare(b.segment) || a.nom.localeCompare(b.nom));
  const [np, setNp] = useState({ nom: "", ville: "", segment: "facilities" as SegmentId });
  const team = state.team;
  const m = team.find((t) => t.id === id);
  const s = d.stats.find((x) => x.id === id);
  const accounts = useMemo(() => [...d.accounts.values()].filter((a) => a.clientIds.some((cid) => owner(cid) === id)), [d.accounts, owner, id]);
  const pending = state.ajouts.filter((a) => a.par === id && a.statut === "en-attente");
  if (!m || !s) return <div className="empty">Personne inconnue.</div>;

  const total = Math.max(1, d.accounts.size);
  const segs = SEGMENTS.map((g) => ({ g, n: s.parSegment[g.id] }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  const maxSeg = Math.max(1, ...segs.map((x) => x.n));
  const count = (key: (a: (typeof accounts)[number]) => string) => {
    const m = new Map<string, number>();
    accounts.forEach((a) => {
      const k = key(a);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    });
    return [...m].sort((x, y) => y[1] - x[1]);
  };
  const depts = count((a) => mainOf(a, d.byId, (c) => deptCode(c.cp)));
  const located = depts.reduce((n, [, v]) => n + v, 0);
  const cities = count((a) => mainOf(a, d.byId, (c) => cityKey(c.cp, c.ville)));
  const canExport = isAdmin || id === session.me;

  const exportXlsx = () => {
    const bytes = exportWorkbook(d.active, team, (c) => owner(c.id), (code) => (code ? `${code}${state.settings.libellesCodes[code] ? " – " + state.settings.libellesCodes[code] : ""}` : ""), id, (c) => ROLE_LABEL[d.roles.get(c.id) ?? "site"]);
    download(`Portefeuille-${slug(m.nom)}-${today()}.xlsx`, bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  };

  return (
    <>
      <div className="page-head">
        <div className="grow col" style={{ gap: 8 }}>
          <Who team={team} id={id} big label={`Portefeuille de ${m.nom}`} />
          <p>
            {m.responsable ? "Responsable · garde ses clients et les grands comptes" : m.codes.length ? `Codes ERP : ${m.codes.join(", ")}` : "Commercial"}
            {id === session.me && !isAdmin ? " · c'est toi" : ""}
          </p>
        </div>
        <button className="btn" onClick={() => go({ view: "carte", owner: id })}>
          <Icon name="map" size={16} /> Sur la carte
        </button>
        {canExport && (
          <button className="btn" onClick={exportXlsx}>
            <Icon name="download" size={16} /> Excel
          </button>
        )}
      </div>

      <div className="grid g4">
        <div className="card stat">
          <span className="stat-label">Comptes clients</span>
          <span className="hero-num" style={{ fontSize: 44 }}>
            {fmt(s.comptes)}
          </span>
          <span className="stat-sub">{pct(s.comptes / total)} des comptes de l'entreprise</span>
        </div>
        <div className="card stat">
          <span className="stat-label">Première typologie</span>
          <span className="stat-value">{segs[0]?.g.court ?? "–"}</span>
          <span className="stat-sub">{segs[0] ? `${fmt(segs[0].n)} comptes · ${pct(segs[0].n / Math.max(1, s.comptes))}` : ""}</span>
        </div>
        <div className="card stat">
          <span className="stat-label">Départements</span>
          <span className="stat-value">{fmt(depts.length)}</span>
          <span className="stat-sub">{depts[0] ? `${pct(depts[0][1] / Math.max(1, located))} des comptes : ${deptName(depts[0][0])}` : ""}</span>
        </div>
        <div className="card stat">
          <span className="stat-label">Villes</span>
          <span className="stat-value">{fmt(cities.length)}</span>
          <span className="stat-sub">{cities[0] ? `la première : ${cities[0][0].charAt(0) + cities[0][0].slice(1).toLowerCase()} (${fmt(cities[0][1])} comptes)` : ""}</span>
        </div>
      </div>

      <div className="grid g3" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-head">
            <h3 className="grow">Typologies</h3>
            <span className="small muted">en comptes</span>
          </div>
          {segs.map((x) => (
            <div className="hbar" key={x.g.id} style={{ gridTemplateColumns: "minmax(90px,130px) 1fr auto" }}>
              <span className="hbar-label ellipsis">{x.g.court}</span>
              <span className="hbar-track">
                <span style={{ width: w(x.n / maxSeg), background: memberVar(team, id), borderRadius: "0 4px 4px 0" }} />
              </span>
              <span className="hbar-value">
                {fmt(x.n)}
                {prospects.some((p) => p.segment === x.g.id) && <span className="muted small"> +{prospects.filter((p) => p.segment === x.g.id).length} prosp.</span>}
              </span>
            </div>
          ))}
          {!segs.length && <p className="muted">Aucun client pour l'instant.</p>}
        </div>
        <div className="col span2" style={{ gap: 16 }}>
          {pending.length > 0 && (
            <div className="card">
              <div className="card-head">
                <h3 className="grow">En attente de validation</h3>
                <span className="badge warn">{pending.length}</span>
              </div>
              {pending.map((a) => (
                <div key={a.client.id} className="row small" style={{ padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                  <b className="grow ellipsis">{a.client.nom}</b>
                  <span className="muted">
                    {a.client.cp} {a.client.ville}
                  </span>
                </div>
              ))}
            </div>
          )}
          {(prospects.length > 0 || isAdmin) && (
            <div className="card">
              <div className="card-head">
                <div className="grow">
                  <h3>Prospects à démarcher</h3>
                  <p>Sociétés qui ne sont pas encore clientes, confiées à {m.nom}. Elles ne comptent pas dans les comptes clients.</p>
                </div>
                <span className="badge">{prospects.length}</span>
              </div>
              {prospects.map((p) => (
                <div key={p.id} className="row wrap" style={{ padding: "7px 0", borderTop: "1px solid var(--line)", gap: 8 }}>
                  <span className="grow" style={{ minWidth: 180 }}>
                    <b>{p.nom}</b>
                    <div className="small muted">
                      {[p.cp, p.ville].filter(Boolean).join(" ")} · {SEGMENT_BY_ID[p.segment].court}
                      {p.note ? ` · ${p.note}` : ""}
                    </div>
                  </span>
                  {isAdmin && (
                    <>
                      <select className="select" style={{ height: 30 }} value={p.owner} aria-label={`Confier ${p.nom} à`} onChange={(e) => (actions.moveProspect(p.id, e.target.value), toast(`${p.nom} confié à ${team.find((t) => t.id === e.target.value)?.nom}`))}>
                        {team.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.nom}
                          </option>
                        ))}
                      </select>
                      <button className="btn sm ghost" aria-label={`Retirer ${p.nom}`} onClick={() => (actions.removeProspect(p.id), toast("Prospect retiré"))}>
                        <Icon name="x" size={14} />
                      </button>
                    </>
                  )}
                </div>
              ))}
              {isAdmin && (
                <form
                  className="row wrap"
                  style={{ gap: 6, marginTop: 10 }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!np.nom.trim()) return;
                    actions.addProspect({ nom: np.nom.trim().toUpperCase(), ville: np.ville.trim().toUpperCase(), segment: np.segment, owner: id });
                    setNp({ ...np, nom: "", ville: "" });
                    toast("Prospect ajouté");
                  }}
                >
                  <input className="input" style={{ flex: "2 1 160px" }} placeholder="Société" value={np.nom} onChange={(e) => setNp({ ...np, nom: e.target.value })} aria-label="Société" />
                  <input className="input" style={{ flex: "1 1 110px" }} placeholder="Ville" value={np.ville} onChange={(e) => setNp({ ...np, ville: e.target.value })} aria-label="Ville" />
                  <select className="select" value={np.segment} onChange={(e) => setNp({ ...np, segment: e.target.value as SegmentId })} aria-label="Typologie">
                    {SEGMENTS.filter((g) => g.id !== "autre").map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.court}
                      </option>
                    ))}
                  </select>
                  <button className="btn sm" type="submit" disabled={!np.nom.trim()}>
                    Ajouter
                  </button>
                </form>
              )}
            </div>
          )}
          <AccountTable accounts={accounts} openClient={openClient} emptyText={`${m.nom} n'a pas encore de clients.`} />
        </div>
      </div>
    </>
  );
}
