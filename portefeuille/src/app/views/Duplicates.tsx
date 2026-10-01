import { useMemo, useState } from "react";
import { pickPrimary, type DuplicateGroup } from "../../core/dedupe";
import { SEGMENT_BY_ID } from "../../core/segments";
import { Icon } from "../icons";
import { useStore } from "../store";
import { fmt, Seg, useToast, Who } from "../ui";

type Level = "tous" | "sur" | "probable";

export function Duplicates({ openClient }: { openClient: (id: string) => void }) {
  const { state, d, owner, duplicates, actions, undo } = useStore();
  const toast = useToast();
  const team = state.team;
  const groups = duplicates();
  const [level, setLevel] = useState<Level>("tous");
  const [choice, setChoice] = useState<Record<string, string>>({});
  const sites = useMemo(() => {
    const m = new Map<string, number>();
    d.active.forEach((c) => c.payeur && m.set(c.payeur, (m.get(c.payeur) ?? 0) + 1));
    return m;
  }, [d.active]);

  const shown = groups.filter((g) => (level === "sur" ? g.confiance >= 0.9 : level === "probable" ? g.confiance < 0.9 : true));
  const sure = groups.filter((g) => g.confiance >= 0.95);
  const primaryOf = (g: DuplicateGroup) => choice[g.key] ?? pickPrimary(g.ids, d.byId, sites);
  const merged = Object.keys(state.merges).length;

  const merge = (g: DuplicateGroup) => {
    const p = primaryOf(g);
    actions.merge(
      p,
      g.ids.filter((id) => id !== p),
    );
    toast("Fiches fusionnées", { label: "Annuler", run: undo });
  };

  const mergeAllSure = () => {
    for (const g of sure) {
      const p = pickPrimary(g.ids, d.byId, sites);
      actions.merge(
        p,
        g.ids.filter((id) => id !== p),
      );
    }
    toast(`${sure.length} groupes fusionnés`);
  };

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <h1>Doublons</h1>
          <p>
            {fmt(groups.length)} groupe(s) à vérifier · {fmt(merged)} fiche(s) déjà fusionnée(s). Les lignes répétées de l'export (même numéro) ont été fusionnées à l'import.
          </p>
        </div>
        {sure.length > 0 && (
          <button className="btn primary" onClick={mergeAllSure}>
            <Icon name="merge" size={16} /> Fusionner les {sure.length} cas certains
          </button>
        )}
      </div>
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <Seg<Level>
          value={level}
          onChange={setLevel}
          options={[
            ["tous", `Tous (${groups.length})`],
            ["sur", `Quasi certains (${groups.filter((g) => g.confiance >= 0.9).length})`],
            ["probable", `À vérifier (${groups.filter((g) => g.confiance < 0.9).length})`],
          ]}
        />
      </div>
      {shown.length === 0 && (
        <div className="card empty">
          <Icon name="check" size={28} />
          <b>Aucun doublon à vérifier.</b>
        </div>
      )}
      <div className="col" style={{ gap: 14 }}>
        {shown.map((g) => {
          const p = primaryOf(g);
          return (
            <div className="card" key={g.key}>
              <div className="card-head">
                <span className={`pill ${g.confiance >= 0.9 ? "bad" : "warn"}`}>{g.confiance >= 0.9 ? "Quasi certain" : "Probable"}</span>
                <span className="small dim grow">{g.raisons.join(" · ")}</span>
                <button className="btn sm ghost" onClick={() => (actions.ignoreDuplicate(g.key), toast("Marqué comme différents"))}>
                  Ce ne sont pas des doublons
                </button>
                <button className="btn sm primary" onClick={() => merge(g)}>
                  <Icon name="merge" size={14} /> Fusionner
                </button>
              </div>
              <div className="grid" style={{ gridTemplateColumns: `repeat(${Math.min(3, g.ids.length)}, minmax(0,1fr))` }}>
                {g.ids.map((id) => {
                  const c = d.byId.get(id)!;
                  const keep = id === p;
                  return (
                    <label
                      key={id}
                      className="card"
                      style={{ boxShadow: "none", background: keep ? "var(--surface-2)" : undefined, borderColor: keep ? "var(--text-2)" : undefined, cursor: "pointer", padding: 14 }}
                    >
                      <div className="row" style={{ marginBottom: 8 }}>
                        <input type="radio" name={g.key} checked={keep} onChange={() => setChoice((x) => ({ ...x, [g.key]: id }))} />
                        <span className="small">{keep ? "Fiche conservée" : "Sera fusionnée"}</span>
                        <span className="spacer" />
                        <button className="btn sm ghost icon" onClick={(e) => (e.preventDefault(), openClient(id))} aria-label="Ouvrir">
                          <Icon name="eye" size={14} />
                        </button>
                      </div>
                      <b>{c.nom}</b>
                      <div className="small dim">
                        N° {c.numero} · {c.type === "1" ? "donneur d'ordre" : "site"} · code {c.code || "–"}
                      </div>
                      <div className="small" style={{ marginTop: 6 }}>
                        {c.adresse}
                        <br />
                        {c.cp} {c.ville}
                      </div>
                      <div className="small muted" style={{ marginTop: 6 }}>
                        {[c.tel, c.mail, c.siren].filter(Boolean).join(" · ") || "Pas de coordonnées"}
                      </div>
                      <div className="row small" style={{ marginTop: 8 }}>
                        <Who team={team} id={owner(id)} />
                        <span className="muted">{SEGMENT_BY_ID[c.segment].court}</span>
                        {c.contrat && <span className="pill">contrat</span>}
                        {sites.get(id) ? <span className="pill">{sites.get(id)} sites</span> : null}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
