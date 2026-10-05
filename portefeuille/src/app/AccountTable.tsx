import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { deptCode } from "../core/geo";
import { norm } from "../core/normalize";
import { SEGMENTS } from "../core/segments";
import { REASON_LABEL, type Reason } from "../core/distribute";
import type { Account, SegmentId } from "../core/types";
import { Icon } from "./icons";
import { useStore } from "./store";
import { fmt, initials, memberVar, useToast, Who } from "./ui";

type Sort = "taille" | "nom" | "ville";

export interface TableFilter {
  /** Restreint aux comptes ayant au moins une fiche de ce propriétaire ("" = pool). */
  owner?: string;
  /** Restreint aux comptes portant ce code ERP d'origine. */
  code?: string;
}

/**
 * Liste de comptes (payeur + sites) avec filtres, tri, sélection multiple et
 * attribution en un clic (responsable seulement).
 */
export function AccountTable({
  accounts,
  openClient,
  proposed,
  reasons,
  base,
  emptyText = "Aucun compte",
}: {
  accounts: Account[];
  openClient: (id: string) => void;
  proposed?: Record<string, string>;
  reasons?: Record<string, Reason>;
  base?: TableFilter;
  emptyText?: string;
}) {
  const { state, d, owner, isAdmin, actions } = useStore();
  const toast = useToast();
  const team = state.team;
  const [q, setQ] = useState("");
  const [segment, setSegment] = useState<SegmentId | "">("");
  const [dept, setDept] = useState("");
  const [sort, setSort] = useState<Sort>("taille");
  const [limit, setLimit] = useState(60);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const more = useRef<HTMLDivElement>(null);

  const ownersOf = (a: Account) => {
    const m = new Map<string, number>();
    a.clientIds.forEach((id) => {
      const o = owner(id) ?? "";
      m.set(o, (m.get(o) ?? 0) + 1);
    });
    return m;
  };

  const rows = useMemo(() => {
    const nq = norm(q);
    let list = accounts.filter((a) => {
      if (segment && a.segment !== segment) return false;
      if (dept && deptCode(a.cp) !== dept) return false;
      if (base?.code && !a.codes.includes(base.code)) return false;
      if (nq) {
        const hay = norm(`${a.nom} ${a.ville} ${a.cp} ${a.id}`);
        if (!nq.split(" ").every((w) => hay.includes(w))) return false;
      }
      return true;
    });
    list = [...list].sort((x, y) =>
      sort === "nom" ? x.nom.localeCompare(y.nom) : sort === "ville" ? x.ville.localeCompare(y.ville) : y.score - x.score || x.nom.localeCompare(y.nom),
    );
    return list;
  }, [accounts, q, segment, dept, sort, base?.code]);

  useEffect(() => setLimit(60), [q, segment, dept, sort]);
  useEffect(() => {
    const el = more.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setLimit((l) => l + 80));
    io.observe(el);
    return () => io.disconnect();
  }, [rows.length, limit]);

  const depts = useMemo(() => {
    const m = new Map<string, number>();
    accounts.forEach((a) => {
      const k = deptCode(a.cp);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    });
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [accounts]);

  const assign = (a: Account | Account[], to: string | null) => {
    const list = Array.isArray(a) ? a : [a];
    const ids = list.flatMap((x) => x.clientIds);
    const who = to ? team.find((m) => m.id === to)?.nom : "le pool";
    actions.assign(ids, to, list.length === 1 ? `« ${list[0].nom} » → ${who}` : `${list.length} comptes → ${who}`);
    toast(list.length === 1 ? `${list[0].nom} → ${who}` : `${list.length} comptes attribués à ${who}`);
  };

  const allSel = rows.length > 0 && rows.slice(0, limit).every((a) => selected.has(a.id));
  const selAccounts = rows.filter((a) => selected.has(a.id));

  const AssignButtons = ({ a, current }: { a: Account; current: Map<string, number> }) => (
    <span className="assign" onClick={(e) => e.stopPropagation()}>
      {team.map((m) => {
        const on = current.size === 1 && current.has(m.id);
        return (
          <button
            key={m.id}
            aria-pressed={on}
            title={`Attribuer à ${m.nom}`}
            style={on ? { background: memberVar(team, m.id) } : { borderColor: memberVar(team, m.id) }}
            onClick={() => !on && assign(a, m.id)}
          >
            {initials(m.nom)}
          </button>
        );
      })}
      <button title="Remettre dans le pool" aria-pressed={current.size === 1 && current.has("")} onClick={() => assign(a, null)}>
        <Icon name="x" size={12} />
      </button>
    </span>
  );

  return (
    <div className="card flush">
      <div className="row wrap" style={{ padding: 14, borderBottom: "1px solid var(--line)" }}>
        <input className="input grow" style={{ minWidth: 180 }} placeholder="Filtrer : nom, ville, CP…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select" value={segment} onChange={(e) => setSegment(e.target.value as SegmentId | "")} aria-label="Typologie">
          <option value="">Toutes typologies</option>
          {SEGMENTS.filter((s) => s.id !== "autre").map((s) => (
            <option key={s.id} value={s.id}>
              {s.court}
            </option>
          ))}
        </select>
        <select className="select" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Département">
          <option value="">Tous départements</option>
          {depts.map(([k, n]) => (
            <option key={k} value={k}>
              {k} ({n})
            </option>
          ))}
        </select>
        <select className="select" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Tri">
          <option value="taille">Plus gros d'abord</option>
          <option value="nom">Nom A→Z</option>
          <option value="ville">Ville A→Z</option>
        </select>
        <span className="muted small nowrap">{fmt(rows.length)} comptes</span>
      </div>

      {isAdmin && selected.size > 0 && (
        <div className="row wrap" style={{ padding: "10px 14px", background: "var(--surface-2)", borderBottom: "1px solid var(--line)" }}>
          <b>{fmt(selected.size)} compte(s) sélectionné(s)</b>
          <span className="spacer" />
          {team.map((m) => (
            <button key={m.id} className="btn sm" onClick={() => (assign(selAccounts, m.id), setSelected(new Set()))}>
              <span className="nav-dot" style={{ background: memberVar(team, m.id) }} /> {m.nom}
            </button>
          ))}
          <button className="btn sm ghost" onClick={() => (assign(selAccounts, null), setSelected(new Set()))}>
            Pool
          </button>
          <select
            className="select"
            style={{ height: 30 }}
            value=""
            aria-label="Reclasser la typologie"
            onChange={(e) => {
              const seg = e.target.value as SegmentId;
              if (!seg) return;
              actions.setSegment(
                selAccounts.flatMap((a) => a.clientIds),
                seg,
              );
              toast(`${selAccounts.length} compte(s) reclassé(s) : ${SEGMENTS.find((s) => s.id === seg)?.label}`);
              setSelected(new Set());
            }}
          >
            <option value="">Reclasser…</option>
            {SEGMENTS.filter((s) => s.id !== "autre").map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <button className="btn sm ghost" onClick={() => setSelected(new Set())}>
            Annuler
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="empty">
          <Icon name="check" size={26} />
          {emptyText}
        </div>
      ) : (
        <div className="table-wrap" style={{ maxHeight: "none" }}>
          <table className="table">
            <thead>
              <tr>
                {isAdmin && (
                  <th style={{ width: 34 }}>
                    <input
                      type="checkbox"
                      aria-label="Tout sélectionner"
                      checked={allSel}
                      onChange={(e) => setSelected(e.target.checked ? new Set(rows.slice(0, limit).map((a) => a.id)) : new Set())}
                    />
                  </th>
                )}
                <th>Compte</th>
                <th className="hide-mobile">Typologie</th>
                <th>{proposed ? "Proposé" : "Propriétaire"}</th>
                {isAdmin && <th className="hide-mobile">Attribuer</th>}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((a) => {
                const cur = ownersOf(a);
                const prop = proposed ? new Set(a.clientIds.map((id) => proposed[id] ?? "")) : null;
                const pinned = a.clientIds.some((id) => state.pins[id]);
                const reason = reasons?.[a.id];
                return (
                  <Fragment key={a.id}>
                    <tr className="clickable" onClick={() => (a.clientIds.length > 1 ? setOpen(open === a.id ? null : a.id) : openClient(a.id))}>
                      {isAdmin && (
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`Sélectionner ${a.nom}`}
                            checked={selected.has(a.id)}
                            onChange={(e) => {
                              const next = new Set(selected);
                              if (e.target.checked) next.add(a.id);
                              else next.delete(a.id);
                              setSelected(next);
                            }}
                          />
                        </td>
                      )}
                      <td style={{ maxWidth: 340 }}>
                        <div className="row" style={{ gap: 6 }}>
                          {a.clientIds.length > 1 && <Icon name="chevron" size={14} style={{ transform: open === a.id ? "rotate(90deg)" : undefined, transition: "transform .15s", color: "var(--muted)" }} />}
                          <b className="ellipsis">{a.nom || "Client confidentiel"}</b>
                          {pinned && isAdmin && <span title="Choix manuel : la proposition automatique n'y touche pas" style={{ color: "var(--muted)" }}><Icon name="pin" size={13} /></span>}
                        </div>
                        <div className="small muted ellipsis">
                          {a.cp} {a.ville}
                          {a.codes.length ? ` · code ${a.codes.join(", ")}` : ""}
                          {reason ? ` · ${REASON_LABEL[reason]}` : ""}
                        </div>
                      </td>
                      <td className="hide-mobile dim">{SEGMENTS.find((s) => s.id === a.segment)?.court}</td>
                      <td>
                        <div className="row" style={{ gap: 4 }}>
                          {[...(prop ?? new Set(cur.keys()))].map((o) => (
                            <Who key={o || "p"} team={team} id={o || undefined} />
                          ))}
                        </div>
                      </td>
                      {isAdmin && (
                        <td className="hide-mobile">
                          <AssignButtons a={a} current={cur} />
                        </td>
                      )}
                    </tr>
                    {open === a.id &&
                      a.clientIds.map((id) => {
                        const c = d.byId.get(id)!;
                        const o = owner(id);
                        return (
                          <tr key={id} className="clickable" style={{ background: "var(--surface-2)" }} onClick={() => openClient(id)}>
                            {isAdmin && <td />}
                            <td style={{ paddingLeft: 34 }}>
                              <div className="ellipsis">{c.nom || "Client confidentiel"}</div>
                              <div className="small muted ellipsis">
                                {c.adresse ? `${c.adresse} · ` : ""}
                                {c.cp} {c.ville}
                                {d.roles.get(id) === "site" ? "" : " · facturation"}
                              </div>
                            </td>
                            <td className="hide-mobile dim small">{SEGMENTS.find((s) => s.id === c.segment)?.court}</td>
                            <td>
                              <Who team={team} id={o} />
                            </td>
                            {isAdmin && (
                              <td className="hide-mobile" onClick={(e) => e.stopPropagation()}>
                                <span className="assign">
                                  {team.map((m) => (
                                    <button
                                      key={m.id}
                                      aria-pressed={o === m.id}
                                      title={`Attribuer cette adresse à ${m.nom}`}
                                      style={o === m.id ? { background: memberVar(team, m.id) } : { borderColor: memberVar(team, m.id) }}
                                      onClick={() => o !== m.id && (actions.assign([id], m.id), toast(`Adresse attribuée à ${m.nom}`))}
                                    >
                                      {initials(m.nom)}
                                    </button>
                                  ))}
                                </span>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {rows.length > limit && (
            <div ref={more} className="empty" style={{ padding: 16 }}>
              <button className="btn sm" onClick={() => setLimit((l) => l + 200)}>
                Afficher plus ({fmt(rows.length - limit)} restants)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
