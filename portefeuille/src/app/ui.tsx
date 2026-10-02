import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { SEGMENT_BY_ID } from "../core/segments";
import type { Member, SegmentId } from "../core/types";
import { Icon } from "./icons";

export const nf = new Intl.NumberFormat("fr-FR");
export const fmt = (n: number) => nf.format(Math.round(n));
export const pct = (n: number, d = 0) => `${(n * 100).toLocaleString("fr-FR", { maximumFractionDigits: d, minimumFractionDigits: d })} %`;
/** Largeur CSS en pourcentage (jamais le format français « 57 % », invalide en CSS). */
export const w = (n: number) => `${Math.max(0, Math.min(100, n * 100)).toFixed(2)}%`;
export const plural = (n: number, one: string, many: string) => `${fmt(n)} ${n > 1 ? many : one}`;

export function dateFr(iso: string, withTime = false): string {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) });
}

/** Couleur d'un membre de l'équipe : emplacement fixe de la palette (jamais réattribué). */
export function memberVar(team: Member[], id: string | undefined): string {
  const i = team.findIndex((m) => m.id === id);
  return i >= 0 && i < 4 ? `var(--m${i + 1})` : "var(--pool)";
}

export function initials(nom: string): string {
  return nom
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function Who({ team, id, big, label }: { team: Member[]; id: string | undefined; big?: boolean; label?: string }) {
  const m = team.find((t) => t.id === id);
  return (
    <span className={`who${big ? " big" : ""}`}>
      <span className="avatar" style={{ background: memberVar(team, id) }}>
        {m ? initials(m.nom) : "–"}
      </span>
      {label ?? (m ? m.nom : "À répartir")}
    </span>
  );
}

export function SegTag({ id }: { id: SegmentId }) {
  return <span className="tag">{SEGMENT_BY_ID[id].court}</span>;
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode; disabled?: boolean }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, React.ReactNode][]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="group">
      {options.map(([v, label]) => (
        <button key={v} type="button" aria-pressed={v === value} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="card stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  foot,
  wide,
}: {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  foot?: React.ReactNode;
  wide?: boolean;
}) {
  useEscape(onClose);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? " wide" : ""}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2 className="grow">{title}</h2>
          <button className="btn ghost icon" onClick={onClose} aria-label="Fermer">
            <Icon name="x" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {foot && <div className="modal-foot">{foot}</div>}
      </div>
    </div>
  );
}

export function useEscape(fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && ref.current();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
}

// ---------- Toasts ----------
interface Toast {
  id: number;
  msg: string;
  action?: { label: string; run: () => void };
}
const ToastCtx = createContext<(msg: string, action?: Toast["action"]) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((msg: string, action?: Toast["action"]) => {
    const id = Date.now() + Math.random();
    setList((l) => [...l.slice(-2), { id, msg, action }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), action ? 6500 : 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {list.map((t) => (
          <div className="toast" key={t.id}>
            <Icon name="check" size={16} />
            {t.msg}
            {t.action && (
              <button
                onClick={() => {
                  t.action!.run();
                  setList((l) => l.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/** Couleurs résolues du thème courant (pour les dessins sur canvas). */
export function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return {
    m: [v("--m1"), v("--m2"), v("--m3"), v("--m4")],
    pool: v("--pool"),
    surface: v("--surface"),
    surface2: v("--surface-2"),
    surface3: v("--surface-3"),
    text: v("--text"),
    text2: v("--text-2"),
    muted: v("--muted"),
    grid: v("--grid"),
    line: v("--line-2"),
    bg: v("--bg"),
    light: document.documentElement.dataset.theme === "light",
  };
}
export type Theme = ReturnType<typeof readTheme>;

export function useTheme(): Theme {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(readTheme()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return theme;
}

export function colorOf(theme: Theme, team: Member[], id: string | undefined): string {
  const i = team.findIndex((m) => m.id === id);
  return i >= 0 && i < 4 ? theme.m[i] : theme.pool;
}

/** Barre horizontale empilée par propriétaire. */
export function OwnerBar({
  label,
  parts,
  total,
  max,
  onClick,
  onHover,
}: {
  label: React.ReactNode;
  parts: { id: string; value: number; color: string }[];
  total: number;
  max: number;
  onClick?: () => void;
  onHover?: (e: React.MouseEvent | null) => void;
}) {
  return (
    <div
      className="hbar"
      onClick={onClick}
      style={{ cursor: onClick ? "pointer" : undefined }}
      onMouseMove={onHover}
      onMouseLeave={() => onHover?.(null)}
    >
      <span className="hbar-label ellipsis">{label}</span>
      <span className="hbar-track">
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <span key={p.id} style={{ width: `${(p.value / Math.max(1, max)) * 100}%`, background: p.color }} />
          ))}
      </span>
      <span className="hbar-value">{fmt(total)}</span>
    </div>
  );
}

export function Tooltip({ at, children }: { at: { x: number; y: number } | null; children: React.ReactNode }) {
  if (!at) return null;
  const flip = at.x > window.innerWidth - 320;
  return (
    <div className="tooltip" style={{ left: at.x, top: at.y, transform: flip ? "translate(calc(-100% - 12px), 12px)" : undefined }}>
      {children}
    </div>
  );
}
