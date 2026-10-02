import { useMemo, useState } from "react";
import { deptCode, deptName } from "../../core/geo";
import { ROLE_LABEL } from "../../core/roles";
import { search } from "../../core/search";
import { SEGMENTS, SEGMENT_BY_ID } from "../../core/segments";
import type { Client, SegmentId } from "../../core/types";
import { exportWorkbook } from "../../lib/excel";
import { download, today } from "../../lib/file";
import { Icon } from "../icons";
import { useStore } from "../store";
import { fmt, memberVar, Who } from "../ui";

type Sort = "pertinence" | "nom" | "ville" | "proprio";

export function SearchView({ initial, openClient }: { initial?: string; openClient: (id: string) => void }) {
  const { d, state, owner, isAdmin } = useStore();
  const team = state.team;
  const allOwners = [...team.map((m) => m.id), ""];
  const [q, setQ] = useState(initial ?? "");
  const [owners, setOwners] = useState<Set<string>>(new Set(allOwners));
  const [segment, setSegment] = useState<SegmentId | "">("");
  const [dept, setDept] = useState("");
  const [code, setCode] = useState("");
  const [type, setType] = useState<"" | "facturation" | "site">("site");
  const [origine, setOrigine] = useState<"" | "erp" | "ajout">("");
  const [sort, setSort] = useState<Sort>("pertinence");
  const [limit, setLimit] = useState(100);

  const depts = useMemo(() => {
    const m = new Map<string, number>();
    d.active.forEach((c) => {
      const k = deptCode(c.cp);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    });
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [d.active]);
  const codes = useMemo(() => {
    const m = new Map<string, number>();
    d.active.forEach((c) => c.code && m.set(c.code, (m.get(c.code) ?? 0) + 1));
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [d.active]);

  const results = useMemo(() => {
    const base: { c: Client; score: number }[] = q.trim() ? search(d.index, q, 5000) : d.active.map((c) => ({ c, score: 0 }));
    const list = base.filter(({ c }) => {
      const o = owner(c.id) ?? "";
      if (!owners.has(o)) return false;
      if (segment && c.segment !== segment) return false;
      if (dept && deptCode(c.cp) !== dept) return false;
      if (code && c.code !== code) return false;
      if (type === "facturation" && d.isSite(c.id)) return false;
      if (type === "site" && !d.isSite(c.id)) return false;
      if (origine === "erp" && c.ajout) return false;
      if (origine === "ajout" && !c.ajout) return false;
      return true;
    });
    const name = (id: string | undefined) => team.find((m) => m.id === id)?.nom ?? "~";
    if (sort === "nom") list.sort((a, b) => a.c.nom.localeCompare(b.c.nom));
    else if (sort === "ville") list.sort((a, b) => a.c.ville.localeCompare(b.c.ville));
    else if (sort === "proprio") list.sort((a, b) => name(owner(a.c.id)).localeCompare(name(owner(b.c.id))));
    else if (!q.trim()) list.sort((a, b) => a.c.nom.localeCompare(b.c.nom));
    return list;
  }, [q, d.index, d.active, owners, segment, dept, code, type, origine, sort, owner, team]);

  const top = q.trim() && results[0];
  const toggle = (o: string) =>
    setOwners((prev) => {
      const next = new Set(prev);
      if (next.has(o)) next.delete(o);
      else next.add(o);
      return next.size ? next : new Set(allOwners);
    });
  const exportXlsx = () => {
    const ids = new Set(results.map((r) => r.c.id));
    const bytes = exportWorkbook(
      d.active.filter((c) => ids.has(c.id)),
      team,
      (c) => owner(c.id),
      (cd) => cd,
      undefined,
      (c) => ROLE_LABEL[d.roles.get(c.id) ?? "site"],
    );
    download(`Recherche-clients-${today()}.xlsx`, bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  };

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <h1>Recherche avancée</h1>
          <p>Trouvez un client et voyez immédiatement à qui il appartient. Filtres combinables.</p>
        </div>
        {isAdmin && (
          <button className="btn" onClick={exportXlsx} disabled={!results.length}>
            <Icon name="download" size={16} /> Exporter ces {fmt(results.length)} clients
          </button>
        )}
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row wrap">
          <div className="searchbox grow" style={{ maxWidth: "none", cursor: "auto" }}>
            <Icon name="search" size={16} />
            <input
              autoFocus
              className="grow"
              style={{ border: 0, background: "transparent", outline: "none", height: "100%" }}
              placeholder="Nom, ville, n° client, téléphone, e-mail, SIREN…"
              value={q}
              onChange={(e) => (setQ(e.target.value), setLimit(100))}
            />
          </div>
        </div>
        <div className="row wrap" style={{ marginTop: 12 }}>
          {allOwners.map((o) => (
            <button key={o || "p"} className="chip" aria-pressed={owners.has(o)} onClick={() => toggle(o)}>
              <span className="dot" style={{ background: memberVar(team, o || undefined) }} />
              {o ? team.find((m) => m.id === o)?.nom : "À répartir"}
            </button>
          ))}
        </div>
        <div className="row wrap" style={{ marginTop: 12 }}>
          <select className="select" value={segment} onChange={(e) => setSegment(e.target.value as SegmentId | "")} aria-label="Typologie">
            <option value="">Toutes typologies</option>
            {SEGMENTS.filter((s) => s.id !== "autre").map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <select className="select" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Département">
            <option value="">Tous départements</option>
            {depts.map(([k, n]) => (
              <option key={k} value={k}>
                {deptName(k)} ({k}) · {n}
              </option>
            ))}
          </select>
          <select className="select" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Code ERP">
            <option value="">Tous codes ERP</option>
            {codes.map(([k, n]) => (
              <option key={k} value={k}>
                Code {k}
                {state.settings.libellesCodes[k] ? ` – ${state.settings.libellesCodes[k]}` : ""} · {n}
              </option>
            ))}
          </select>
          <select className="select" value={type} onChange={(e) => setType(e.target.value as typeof type)} aria-label="Type">
            <option value="site">Sites d'intervention</option>
            <option value="facturation">Adresses de facturation</option>
            <option value="">Sites et facturation</option>
          </select>
          <select className="select" value={origine} onChange={(e) => setOrigine(e.target.value as typeof origine)} aria-label="Origine">
            <option value="">Toutes origines</option>
            <option value="erp">Export ERP</option>
            <option value="ajout">Ajoutés dans l'outil</option>
          </select>
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Tri">
            <option value="pertinence">Tri : pertinence</option>
            <option value="nom">Tri : nom</option>
            <option value="ville">Tri : ville</option>
            <option value="proprio">Tri : propriétaire</option>
          </select>
        </div>
      </div>

      {top && (
        <div className="answer" style={{ marginBottom: 16 }}>
          <span className="grow" style={{ minWidth: 0 }}>
            <span className="small muted">Meilleur résultat : « {top.c.nom} » ({top.c.ville}) appartient à</span>
            <div style={{ marginTop: 6 }}>
              <Who team={team} id={owner(top.c.id)} big />
            </div>
          </span>
          <button className="btn" onClick={() => openClient(top.c.id)}>
            Ouvrir la fiche
          </button>
        </div>
      )}

      <div className="card flush">
        <div className="row" style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)" }}>
          <b>{fmt(results.length)} résultat(s)</b>
        </div>
        <div className="table-wrap" style={{ maxHeight: "none" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Client</th>
                <th className="hide-mobile">Typologie</th>
                <th className="hide-mobile">Ville</th>
                <th className="hide-mobile">N°</th>
                <th>Propriétaire</th>
              </tr>
            </thead>
            <tbody>
              {results.slice(0, limit).map(({ c }) => (
                <tr key={c.id} className="clickable" onClick={() => openClient(c.id)}>
                  <td style={{ maxWidth: 360 }}>
                    <b className="ellipsis" style={{ display: "block" }}>
                      {c.nom || "Client confidentiel"}
                    </b>
                    <div className="small muted ellipsis">
                      {d.isSite(c.id) ? (c.payeur ? `Site · payeur : ${d.byId.get(c.payeur)?.nom ?? c.payeurNom ?? c.payeur}` : "Site") : "Adresse de facturation"}
                    </div>
                  </td>
                  <td className="hide-mobile dim">{SEGMENT_BY_ID[c.segment].court}</td>
                  <td className="hide-mobile dim">
                    {c.cp} {c.ville}
                  </td>
                  <td className="hide-mobile num muted">{c.numero}</td>
                  <td>
                    <Who team={team} id={owner(c.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {results.length > limit && (
            <div className="empty" style={{ padding: 16 }}>
              <button className="btn sm" onClick={() => setLimit((l) => l + 300)}>
                Afficher plus ({fmt(results.length - limit)} restants)
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
