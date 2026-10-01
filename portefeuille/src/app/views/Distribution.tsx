import { useMemo, useState } from "react";
import type { Account } from "../../core/types";
import type { Nav } from "../App";
import { AccountTable } from "../AccountTable";
import { Icon } from "../icons";
import { useStore } from "../store";
import { fmt, memberVar, Modal, pct, Seg, Switch, useToast, Who, w } from "../ui";

type Tab = "pool" | "arnaud" | "grands" | "tous" | "manuels";

export function Distribution({ tab: initialTab, openClient }: { tab?: string; go: Nav; openClient: (id: string) => void }) {
  const { state, d, owner, proposal, actions, undo } = useStore();
  const toast = useToast();
  const team = state.team;
  const s = state.settings;
  const [tab, setTab] = useState<Tab>((initialTab as Tab) || "pool");
  const [confirmReset, setConfirmReset] = useState(false);
  const responsable = team.find((m) => m.responsable);
  const receivers = team.filter((m) => m.recoit);
  const departedCode = Object.entries(s.libellesCodes).find(([, v]) => /\(parti\)/i.test(v))?.[0];

  const p = useMemo(() => proposal(), [proposal]);
  const current = d.stats;

  const accounts = useMemo(() => [...d.accounts.values()], [d.accounts]);
  const lists = useMemo(() => {
    const has = (a: Account, f: (id: string) => boolean) => a.clientIds.some(f);
    return {
      pool: accounts.filter((a) => has(a, (id) => !owner(id))),
      arnaud: departedCode ? accounts.filter((a) => a.codes.includes(departedCode)) : [],
      grands: accounts.filter((a) => p.reasons[a.id] === "grand-compte"),
      tous: accounts,
      manuels: accounts.filter((a) => has(a, (id) => !!state.pins[id])),
    };
  }, [accounts, owner, p.reasons, state.pins, departedCode]);

  const apply = () => {
    actions.applyProposal();
    toast("Proposition appliquée", { label: "Annuler", run: undo });
  };

  const changes = d.active.filter((c) => !state.pins[c.id] && (p.owners[c.id] ?? "") !== (state.owners[c.id] ?? "")).length;

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <h1>Répartition</h1>
          <p>
            Vous gardez vos clients ({responsable?.codes.join(", ")}) et les plus gros comptes ; le reste est partagé équitablement entre {receivers.map((r) => r.nom).join(" et ")}.
          </p>
        </div>
      </div>

      <div className="grid g3">
        <div className="card span2">
          <div className="card-head">
            <div className="grow">
              <h3>Proposition automatique</h3>
              <p>Réglez, observez le résultat, puis appliquez. Vos choix manuels (épinglés) ne sont jamais modifiés.</p>
            </div>
            <span className={`pill ${p.ecart < 0.05 ? "ok" : p.ecart < 0.15 ? "warn" : "bad"}`}>
              Écart {receivers.map((r) => r.nom).join("/")} : {pct(p.ecart, 1)}
            </span>
          </div>
          <div className="table-wrap" style={{ maxHeight: "none" }}>
            <table className="table">
              <thead>
                <tr>
                  <th />
                  <th className="r">Fiches</th>
                  <th className="r">Comptes</th>
                  <th className="r">Contrats</th>
                  <th className="r">Poids</th>
                  <th className="r hide-mobile">Variation</th>
                </tr>
              </thead>
              <tbody>
                {p.stats.map((ps) => {
                  const cs = current.find((x) => x.id === ps.id)!;
                  const delta = ps.clients - cs.clients;
                  return (
                    <tr key={ps.id}>
                      <td>
                        <Who team={team} id={ps.id} />
                      </td>
                      <td className="r num">{fmt(ps.clients)}</td>
                      <td className="r num">{fmt(ps.comptes)}</td>
                      <td className="r num">{fmt(ps.contrats)}</td>
                      <td className="r num">
                        <b>{fmt(ps.score)}</b>
                      </td>
                      <td className="r num hide-mobile" style={{ color: delta ? "var(--text-2)" : "var(--muted)" }}>
                        {delta > 0 ? "+" : ""}
                        {fmt(delta)} fiches
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ margin: "14px 0 6px" }}>
            <div className="meter" style={{ height: 12 }}>
              {p.stats.map((ps) => (
                <span key={ps.id} style={{ width: w(ps.score / Math.max(1, p.stats.reduce((x, y) => x + y.score, 0))), background: memberVar(team, ps.id) }} />
              ))}
            </div>
            <div className="legend" style={{ marginTop: 8 }}>
              {p.stats.map((ps) => (
                <span key={ps.id}>
                  <i style={{ background: memberVar(team, ps.id) }} />
                  {team.find((m) => m.id === ps.id)?.nom} {pct(ps.score / Math.max(1, p.stats.reduce((x, y) => x + y.score, 0)))} du poids
                </span>
              ))}
            </div>
          </div>
          <div className="row wrap" style={{ marginTop: 14 }}>
            <button className="btn primary" disabled={!changes} onClick={apply}>
              <Icon name="sparkle" size={16} /> Appliquer la proposition {changes ? `(${fmt(changes)} fiches)` : ""}
            </button>
            <span className="spacer" />
            <button className="btn ghost danger" onClick={() => setConfirmReset(true)}>
              Tout remettre à zéro
            </button>
          </div>
          <ol className="small dim" style={{ margin: "18px 0 0", paddingLeft: 18, display: "grid", gap: 6 }}>
            <li>
              <b>{responsable?.nom}</b> garde tous ses clients (code {responsable?.codes.join(", ")}) et vos choix manuels sont respectés.
            </li>
            {s.rattacherComptes && <li>Un compte (payeur + ses sites) n'est jamais coupé : ses sites libres rejoignent celui qui en tient déjà une partie.</li>}
            {s.grandsComptes > 0 && (
              <li>
                Les {s.grandsComptes} plus gros comptes encore libres reviennent à {responsable?.nom}.
              </li>
            )}
            <li>
              Le reste est partagé entre {receivers.map((r) => r.nom).join(" et ")}{" "}
              {s.mode === "type" ? "typologie par typologie, du plus gros compte au plus petit, en privilégiant les villes où chacun est déjà présent." : "en secteurs géographiques d'un seul tenant, de poids égal."}
            </li>
          </ol>
        </div>

        <div className="card col" style={{ gap: 16 }}>
          <h3>Règles</h3>
          <div className="field">
            <span>Méthode de partage</span>
            <Seg
              value={s.mode}
              onChange={(mode) => actions.settings({ mode })}
              options={[
                ["type", "Par typologie"],
                ["territoire", "Par secteur"],
              ]}
            />
            <span className="small muted">
              {s.mode === "type"
                ? "Chacun reçoit la même part de chaque typologie (industrie, tertiaire, boulangeries…), du plus gros compte au plus petit."
                : "Chacun reçoit un secteur géographique d'un seul tenant autour de Lyon, de poids égal : moins de route."}
            </span>
          </div>
          <label className="field">
            <span>
              Plus gros comptes du pool réservés à {responsable?.nom} : <b>{s.grandsComptes}</b>
            </span>
            <input type="range" min={0} max={40} value={s.grandsComptes} onChange={(e) => actions.settings({ grandsComptes: +e.target.value })} />
          </label>
          <Switch checked={s.rattacherComptes} onChange={(v) => actions.settings({ rattacherComptes: v })} label="Un compte n'est jamais coupé : ses sites suivent celui qui le tient déjà" />
          {s.mode === "type" && <Switch checked={s.proximite} onChange={(v) => actions.settings({ proximite: v })} label="Privilégier la proximité (même ville)" />}
          <label className="field">
            <span>
              Poids d'un contrat d'entretien : <b>+{s.poidsContrat}</b> par site sous contrat
            </span>
            <input type="range" min={0} max={6} step={0.5} value={s.poidsContrat} onChange={(e) => actions.settings({ poidsContrat: +e.target.value })} />
          </label>
          {receivers.map((m) => (
            <label className="field" key={m.id}>
              <span>
                Part du pool pour {m.nom} : <b>{pct(m.part / receivers.reduce((x, y) => x + y.part, 0))}</b>
              </span>
              <input type="range" min={0.25} max={3} step={0.25} value={m.part} onChange={(e) => actions.memberUpdate(m.id, { part: +e.target.value })} />
            </label>
          ))}
        </div>
      </div>

      <div className="row wrap" style={{ margin: "26px 0 12px" }}>
        <Seg<Tab>
          value={tab}
          onChange={setTab}
          options={[
            ["pool", `À répartir (${fmt(lists.pool.length)})`],
            ...(departedCode ? [["arnaud", `${s.libellesCodes[departedCode].replace(/\s*\(parti\)/i, "")} · code ${departedCode} (${fmt(lists.arnaud.length)})`] as [Tab, string]] : []),
            ["grands", `Grands comptes (${fmt(lists.grands.length)})`],
            ["manuels", `Choix manuels (${fmt(lists.manuels.length)})`],
            ["tous", "Tous"],
          ]}
        />
      </div>
      {tab === "arnaud" && (
        <div className="banner" style={{ marginBottom: 12 }}>
          <Icon name="info" />
          <span className="small">
            Les comptes portant le code {departedCode} ({departedCode && s.libellesCodes[departedCode]}). Vous en gérez encore ? Cliquez sur votre initiale pour les reprendre : le choix est épinglé et la proposition
            automatique n'y touchera plus.
          </span>
        </div>
      )}
      {tab === "grands" && (
        <div className="banner" style={{ marginBottom: 12 }}>
          <Icon name="star" />
          <span className="small">
            Les {s.grandsComptes} plus gros comptes encore libres : ils vous reviennent dans la proposition. Réglez leur nombre avec le curseur ci-dessus.
          </span>
        </div>
      )}
      <AccountTable
        key={tab}
        accounts={lists[tab]}
        openClient={openClient}
        proposed={tab === "pool" || tab === "grands" ? p.owners : undefined}
        reasons={p.reasons}
        emptyText={tab === "pool" ? "Tout le portefeuille est réparti." : "Aucun compte"}
      />

      {confirmReset && (
        <Modal
          title="Tout remettre à zéro ?"
          onClose={() => setConfirmReset(false)}
          foot={
            <>
              <button className="btn ghost" onClick={() => setConfirmReset(false)}>
                Annuler
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  actions.resetDistribution();
                  setConfirmReset(false);
                  toast("Répartition remise à zéro", { label: "Annuler", run: undo });
                }}
              >
                Remettre à zéro
              </button>
            </>
          }
        >
          <p className="dim">
            Seuls les clients de vos codes ERP ({responsable?.codes.join(", ")}) restent attribués. Tous les choix manuels sont effacés. Vous pourrez annuler juste après.
          </p>
        </Modal>
      )}
    </>
  );
}
