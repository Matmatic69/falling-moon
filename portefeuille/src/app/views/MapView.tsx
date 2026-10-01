import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { GEO } from "../../core/geo";
import { SEGMENTS } from "../../core/segments";
import type { Client, SegmentId } from "../../core/types";
import { Icon } from "../icons";
import { useStore } from "../store";
import { colorOf, fmt, memberVar, pct, Switch, Tooltip, useTheme } from "../ui";

const LAT0 = 45.76;
const K = Math.cos((LAT0 * Math.PI) / 180);
const px = (lng: number) => lng * K;
const py = (lat: number) => -lat;
const POOL = "";

interface Pt {
  c: Client;
  x: number;
  y: number;
  o: string;
}

interface Cluster {
  x: number;
  y: number;
  pts: Pt[];
  byOwner: Map<string, number>;
}

/** Contours pré-calculés (coordonnées projetées), dessinés à l'échelle de la caméra. */
function buildPaths() {
  const toPath = (rings: number[][]) => {
    const p = new Path2D();
    for (const r of rings) {
      p.moveTo(px(r[0]), py(r[1]));
      for (let i = 2; i < r.length; i += 2) p.lineTo(px(r[i]), py(r[i + 1]));
      p.closePath();
    }
    return p;
  };
  return {
    depts: GEO.depts.map((dp) => ({ code: dp.code, nom: dp.nom, x: px(dp.lng), y: py(dp.lat), path: toPath(dp.rings) })),
    communes: GEO.communes.map((cm) => {
      const r = cm.rings[0] ?? [];
      let sx = 0, sy = 0;
      for (let i = 0; i < r.length; i += 2) {
        sx += r[i];
        sy += r[i + 1];
      }
      const n = Math.max(1, r.length / 2);
      return { nom: cm.nom, x: px(sx / n), y: py(sy / n), path: toPath(cm.rings) };
    }),
  };
}

export function MapView({ initialOwner, openClient }: { initialOwner?: string; openClient: (id: string) => void }) {
  const { state, d, owner } = useStore();
  const theme = useTheme();
  const team = state.team;
  const allOwners = [...team.map((m) => m.id), POOL];
  const [show, setShow] = useState<Set<string>>(() => new Set(initialOwner ? [initialOwner] : allOwners));
  const [segment, setSegment] = useState<SegmentId | "">("");
  const [contrat, setContrat] = useState(false);
  const [facturation, setFacturation] = useState(false);
  const [tip, setTip] = useState<{ x: number; y: number; html: ReactNode } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const paths = useMemo(buildPaths, []);
  const cam = useRef<{ cx: number; cy: number; s: number } | null>(null);
  const redraw = useRef<() => void>(() => {});
  const clusters = useRef<Cluster[]>([]);

  // Par défaut : uniquement les lieux d'intervention (pas les sièges ni les adresses de facturation).
  const points = useMemo<Pt[]>(
    () =>
      (facturation ? d.active : d.sites)
        .filter((c) => c.lat !== undefined && c.lng !== undefined)
        .map((c) => ({ c, x: px(c.lng!), y: py(c.lat!), o: owner(c.id) ?? POOL }))
        .filter((p) => show.has(p.o) && (!segment || p.c.segment === segment) && (!contrat || p.c.contrat)),
    [d.active, d.sites, facturation, owner, show, segment, contrat],
  );

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    points.forEach((p) => m.set(p.o, (m.get(p.o) ?? 0) + 1));
    return m;
  }, [points]);

  // Cadrage initial : là où sont 95 % des clients.
  const fit = () => {
    const el = wrap.current!;
    const all = d.sites.filter((c) => c.lat !== undefined);
    const xs = all.map((c) => px(c.lng!)).sort((a, b) => a - b);
    const ys = all.map((c) => py(c.lat!)).sort((a, b) => a - b);
    const q = (arr: number[], f: number) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(arr.length * f)))] ?? 0;
    const x0 = q(xs, 0.12), x1 = q(xs, 0.88), y0 = q(ys, 0.12), y1 = q(ys, 0.88);
    const s = Math.min(el.clientWidth / Math.max(0.05, x1 - x0), el.clientHeight / Math.max(0.05, y1 - y0)) * 0.8;
    cam.current = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, s };
    redraw.current();
  };

  useEffect(() => {
    const cv = canvas.current!;
    const el = wrap.current!;
    const ctx = cv.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = 0, H = 0, raf = 0;

    const draw = () => {
      raf = 0;
      if (!cam.current) return;
      const { cx, cy, s } = cam.current;
      const th = theme;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = th.surface;
      ctx.fillRect(0, 0, W, H);
      const tx = W / 2 - cx * s;
      const ty = H / 2 - cy * s;
      // départements
      ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * tx, dpr * ty);
      ctx.lineJoin = "round";
      for (const dp of paths.depts) {
        ctx.fillStyle = th.surface2;
        ctx.fill(dp.path, "evenodd");
      }
      ctx.lineWidth = 1.1 / s;
      ctx.strokeStyle = th.line;
      for (const dp of paths.depts) ctx.stroke(dp.path);
      if (s > 260) {
        ctx.lineWidth = 0.7 / s;
        ctx.strokeStyle = th.grid;
        for (const cm of paths.communes) ctx.stroke(cm.path);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // libellés de fond
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = th.muted;
      if (s < 900) {
        ctx.font = `500 ${s > 150 ? 12 : 10.5}px system-ui, sans-serif`;
        for (const dp of paths.depts) {
          const x = dp.x * s + tx, y = dp.y * s + ty;
          if (x > -50 && x < W + 50 && y > -20 && y < H + 20 && s > 45) ctx.fillText(dp.nom, x, y);
        }
      } else {
        ctx.font = "500 11px system-ui, sans-serif";
        for (const cm of paths.communes) {
          const x = cm.x * s + tx, y = cm.y * s + ty;
          if (x > 0 && x < W && y > 0 && y < H) ctx.fillText(cm.nom, x, y);
        }
      }

      // regroupement à l'écran : une grille de 34 px
      const cell = s > 2500 ? 10 : 34;
      const grid = new Map<string, Cluster>();
      for (const p of points) {
        const x = p.x * s + tx, y = p.y * s + ty;
        if (x < -40 || x > W + 40 || y < -40 || y > H + 40) continue;
        const k = `${Math.floor(x / cell)}:${Math.floor(y / cell)}`;
        const g: Cluster = grid.get(k) ?? { x: 0, y: 0, pts: [], byOwner: new Map() };
        g.x += x;
        g.y += y;
        g.pts.push(p);
        g.byOwner.set(p.o, (g.byOwner.get(p.o) ?? 0) + 1);
        grid.set(k, g);
      }
      const list = [...grid.values()].map((g) => ({ ...g, x: g.x / g.pts.length, y: g.y / g.pts.length }));
      list.sort((a, b) => a.pts.length - b.pts.length);
      clusters.current = list;
      for (const g of list) {
        const n = g.pts.length;
        if (n === 1) {
          const p = g.pts[0];
          const r = p.c.contrat ? 5 : 4;
          ctx.beginPath();
          ctx.arc(g.x, g.y, r + 2, 0, Math.PI * 2);
          ctx.fillStyle = th.surface;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(g.x, g.y, r, 0, Math.PI * 2);
          if (d.isSite(p.c.id)) {
            ctx.fillStyle = colorOf(th, team, p.o || undefined);
            ctx.fill();
          } else {
            // adresse de facturation : anneau creux
            ctx.strokeStyle = colorOf(th, team, p.o || undefined);
            ctx.lineWidth = 2;
            ctx.stroke();
          }
          continue;
        }
        const r = Math.min(30, 7 + Math.sqrt(n) * 2.1);
        ctx.beginPath();
        ctx.arc(g.x, g.y, r + 2, 0, Math.PI * 2);
        ctx.fillStyle = th.surface;
        ctx.fill();
        let a0 = -Math.PI / 2;
        for (const o of allOwners) {
          const v = g.byOwner.get(o);
          if (!v) continue;
          const a1 = a0 + (v / n) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(g.x, g.y);
          ctx.arc(g.x, g.y, r, a0, a1);
          ctx.closePath();
          ctx.fillStyle = colorOf(th, team, o || undefined);
          ctx.fill();
          a0 = a1;
        }
        // trou central (donut) pour lire le nombre
        ctx.beginPath();
        ctx.arc(g.x, g.y, r * 0.58, 0, Math.PI * 2);
        ctx.fillStyle = th.surface;
        ctx.fill();
        ctx.fillStyle = th.text;
        ctx.font = `650 ${r > 16 ? 11.5 : 10}px system-ui, sans-serif`;
        ctx.fillText(n > 999 ? `${Math.round(n / 100) / 10}k` : String(n), g.x, g.y + 0.5);
      }
    };
    redraw.current = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };

    const resize = () => {
      W = el.clientWidth;
      H = el.clientHeight;
      cv.width = W * dpr;
      cv.height = H * dpr;
      if (!cam.current) fit();
      redraw.current();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const zoomAt = (mx: number, my: number, f: number) => {
      const c = cam.current!;
      const s2 = Math.max(30, Math.min(20000, c.s * f));
      const wx = c.cx + (mx - W / 2) / c.s;
      const wy = c.cy + (my - H / 2) / c.s;
      c.cx = wx - (mx - W / 2) / s2;
      c.cy = wy - (my - H / 2) / s2;
      c.s = s2;
      redraw.current();
    };

    const pointers = new Map<number, { x: number; y: number }>();
    let moved = false;
    let pinch = 0;
    const local = (e: PointerEvent | WheelEvent | MouseEvent) => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const hit = (x: number, y: number) => {
      let best: Cluster | null = null;
      let bd = Infinity;
      for (const g of clusters.current) {
        const r = g.pts.length === 1 ? 8 : Math.min(30, 7 + Math.sqrt(g.pts.length) * 2.1) + 3;
        const dd = Math.hypot(g.x - x, g.y - y);
        if (dd < r && dd < bd) {
          bd = dd;
          best = g;
        }
      }
      return best;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0018));
    };
    const onDown = (e: PointerEvent) => {
      cv.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, local(e));
      moved = false;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const onMove = (e: PointerEvent) => {
      const p = local(e);
      const prev = pointers.get(e.pointerId);
      if (prev) {
        if (pointers.size === 2) {
          pointers.set(e.pointerId, p);
          const [a, b] = [...pointers.values()];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (pinch) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, dist / pinch);
          pinch = dist;
          moved = true;
          return;
        }
        const dx = p.x - prev.x, dy = p.y - prev.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
        cam.current!.cx -= dx / cam.current!.s;
        cam.current!.cy -= dy / cam.current!.s;
        pointers.set(e.pointerId, p);
        redraw.current();
        setTip(null);
        return;
      }
      const g = hit(p.x, p.y);
      cv.style.cursor = g ? "pointer" : "grab";
      if (!g) return setTip(null);
      if (g.pts.length === 1) {
        const c = g.pts[0].c;
        const o = g.pts[0].o;
        setTip({
          x: e.clientX,
          y: e.clientY,
          html: (
            <>
              <b>{c.nom || "Client confidentiel"}</b>
              <div className="dim">
                {c.ville} · {SEGMENTS.find((s) => s.id === c.segment)?.court}
                {c.contrat ? " · sous contrat" : ""}
                {!d.isSite(c.id) ? " · adresse de facturation" : ""}
              </div>
              <div className="row small" style={{ gap: 6, marginTop: 4 }}>
                <i style={{ width: 8, height: 8, borderRadius: 4, background: memberVar(team, o || undefined) }} />
                {o ? team.find((m) => m.id === o)?.nom : "À répartir"}
              </div>
            </>
          ),
        });
      } else {
        setTip({
          x: e.clientX,
          y: e.clientY,
          html: (
            <>
              <b>{fmt(g.pts.length)} clients ici</b>
              {allOwners.map((o) =>
                g.byOwner.get(o) ? (
                  <div key={o || "p"} className="row small" style={{ gap: 6 }}>
                    <i style={{ width: 8, height: 8, borderRadius: 4, background: memberVar(team, o || undefined) }} />
                    <span className="grow">{o ? team.find((m) => m.id === o)?.nom : "À répartir"}</span>
                    <span className="num">{fmt(g.byOwner.get(o)!)}</span>
                  </div>
                ) : null,
              )}
              <div className="muted small">Cliquez pour zoomer</div>
            </>
          ),
        });
      }
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = 0;
      if (moved) return;
      const p = local(e);
      const g = hit(p.x, p.y);
      if (!g) return;
      if (g.pts.length === 1) openClient(g.pts[0].c.id);
      else {
        const c = cam.current!;
        c.cx += (g.x - W / 2) / c.s;
        c.cy += (g.y - H / 2) / c.s;
        zoomAt(W / 2, H / 2, 2.6);
      }
    };
    const onDbl = (e: MouseEvent) => {
      const p = local(e);
      zoomAt(p.x, p.y, 2);
    };
    const onLeave = () => setTip(null);
    cv.addEventListener("wheel", onWheel, { passive: false });
    cv.addEventListener("pointerdown", onDown);
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerup", onUp);
    cv.addEventListener("pointercancel", onUp);
    cv.addEventListener("dblclick", onDbl);
    cv.addEventListener("pointerleave", onLeave);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      cv.removeEventListener("wheel", onWheel);
      cv.removeEventListener("pointerdown", onDown);
      cv.removeEventListener("pointermove", onMove);
      cv.removeEventListener("pointerup", onUp);
      cv.removeEventListener("pointercancel", onUp);
      cv.removeEventListener("dblclick", onDbl);
      cv.removeEventListener("pointerleave", onLeave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, theme, paths, team]);

  const toggle = (o: string) =>
    setShow((prev) => {
      const next = new Set(prev);
      if (next.has(o)) next.delete(o);
      else next.add(o);
      return next.size ? next : new Set(allOwners);
    });

  const zoom = (f: number) => {
    const el = wrap.current!;
    const c = cam.current!;
    c.s = Math.max(30, Math.min(20000, c.s * f));
    void el;
    redraw.current();
  };

  const missing = d.sites.length - d.sites.filter((c) => c.lat !== undefined).length;
  const billing = d.active.length - d.sites.length;

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <h1>Carte des clients</h1>
          <p>Lieux d'intervention uniquement (pas les sièges) · couleur = propriétaire · les anneaux regroupent les sites proches : cliquez pour zoomer</p>
        </div>
      </div>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        {allOwners.map((o) => (
          <button key={o || "pool"} className="chip" aria-pressed={show.has(o)} onClick={() => toggle(o)}>
            <span className="dot" style={{ background: memberVar(team, o || undefined) }} />
            {o ? team.find((m) => m.id === o)?.nom : "À répartir"}
            <span className="num muted">{fmt(counts.get(o) ?? 0)}</span>
          </button>
        ))}
        <select className="select" value={segment} onChange={(e) => setSegment(e.target.value as SegmentId | "")} aria-label="Typologie">
          <option value="">Toutes les typologies</option>
          {SEGMENTS.filter((s) => s.id !== "autre").map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <Switch checked={contrat} onChange={setContrat} label="Sous contrat seulement" />
        <Switch checked={facturation} onChange={setFacturation} label={`Afficher aussi les ${fmt(billing)} adresses de facturation`} />
      </div>
      <div className="map-wrap" ref={wrap}>
        <canvas ref={canvas} role="img" aria-label="Carte des clients colorés par propriétaire" />
        <div className="map-tools">
          <button className="btn icon" onClick={() => zoom(1.6)} aria-label="Zoomer">
            <Icon name="plus" />
          </button>
          <button className="btn icon" onClick={() => zoom(1 / 1.6)} aria-label="Dézoomer">
            <Icon name="minus" />
          </button>
          <button className="btn icon" onClick={fit} aria-label="Recadrer">
            <Icon name="expand" />
          </button>
        </div>
        <div className="map-panel">
          <b>
            {fmt(points.length)} {facturation ? "adresses" : "sites d'intervention"}
          </b>
          <div className="legend" style={{ marginTop: 6, flexDirection: "column", gap: 4 }}>
            {allOwners
              .filter((o) => show.has(o))
              .map((o) => (
                <span key={o || "p"}>
                  <i style={{ background: memberVar(team, o || undefined), borderRadius: 5 }} />
                  {o ? team.find((m) => m.id === o)?.nom : "À répartir"} · {pct((counts.get(o) ?? 0) / Math.max(1, points.length))}
                </span>
              ))}
          </div>
          {missing > 0 && <div className="muted" style={{ marginTop: 6 }}>{fmt(missing)} sans adresse localisable</div>}
        </div>
      </div>
      <Tooltip at={tip}>{tip?.html}</Tooltip>
    </>
  );
}
