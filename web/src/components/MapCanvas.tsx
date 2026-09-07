import { useEffect, useRef, useState } from "react";
import { Scene, type StreetStyle } from "../gl/scene";
import type { Geometry, Street, Terrain } from "../types";

export interface SceneInputs {
  terrain: Terrain;
  heights: Float32Array;
  geometry: Geometry[];
  streets: Street[];
  centre: [number, number];
}

export interface SceneSettings {
  exaggeration: number;
  lineWidth: number;
  liftScale: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export interface StyleSpec {
  /** Colour per vía index. */
  colour: (s: Street) => string;
  /** 0 hides it, 1 shows it at full strength. */
  visible: (s: Street) => boolean;
  /** 0-1, floats the vía above the terrain. */
  lift: (s: Street) => number;
  /** 0-1, scales the drawn width. */
  weight: (s: Street) => number;
}

export function MapCanvas({
  inputs, settings, spec, highlight, onPick, onHover,
}: {
  inputs: SceneInputs;
  settings: SceneSettings;
  spec: StyleSpec;
  highlight: number | null;
  onPick: (index: number | null) => void;
  onHover: (index: number | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // Build the scene once per city; the buffers are static after that.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let scene: Scene;
    try {
      scene = new Scene(
        canvas, inputs.terrain, inputs.heights, inputs.geometry,
        inputs.streets.length, inputs.centre,
      );
    } catch (err) {
      setFailed(String(err instanceof Error ? err.message : err));
      return;
    }
    sceneRef.current = scene;
    scene.invalidate();

    const onResize = () => scene.invalidate();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      scene.dispose();
      sceneRef.current = null;
    };
  }, [inputs]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.options = { ...settings };
    scene.invalidate();
  }, [settings]);

  // Restyle whenever the grouping, the filters or the selection change.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const n = inputs.streets.length;
    const style: StreetStyle = {
      colour: new Uint8Array(n * 3),
      alpha: new Uint8Array(n),
      lift: new Uint8Array(n),
      weight: new Uint8Array(n),
      flag: new Uint8Array(n),
    };
    for (let i = 0; i < n; i++) {
      const s = inputs.streets[i];
      const on = spec.visible(s);
      const [r, g, b] = hexToRgb(spec.colour(s));
      style.colour[i * 3] = r;
      style.colour[i * 3 + 1] = g;
      style.colour[i * 3 + 2] = b;
      const isHit = highlight === i;
      style.alpha[i] = isHit ? 255 : on ? 216 : 16;
      style.lift[i] = Math.round(Math.min(Math.max(spec.lift(s), 0), 1) * 255);
      style.weight[i] = Math.round(Math.min(Math.max(spec.weight(s), 0), 1) * 255);
      style.flag[i] = isHit ? 255 : 0;
    }
    scene.setStyle(style);
  }, [spec, highlight, inputs.streets]);

  // Pointer interaction: orbit, pan, zoom, pick.
  useEffect(() => {
    const canvas = canvasRef.current;
    const scene = sceneRef.current;
    if (!canvas || !scene) return;

    let mode: "none" | "orbit" | "pan" = "none";
    let last: [number, number] = [0, 0];
    let moved = 0;
    let hoverTimer = 0;

    const down = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      mode = e.shiftKey || e.button === 2 ? "pan" : "orbit";
      last = [e.clientX, e.clientY];
      moved = 0;
      setDragging(true);
    };
    const move = (e: PointerEvent) => {
      const dx = e.clientX - last[0];
      const dy = e.clientY - last[1];
      if (mode === "none") {
        window.clearTimeout(hoverTimer);
        hoverTimer = window.setTimeout(() => {
          const rect = canvas.getBoundingClientRect();
          const hit = scene.pick(e.clientX - rect.left, e.clientY - rect.top);
          onHover(hit >= 0 && hit < inputs.streets.length ? hit : null);
        }, 40);
        return;
      }
      last = [e.clientX, e.clientY];
      moved += Math.abs(dx) + Math.abs(dy);
      const cam = scene.camera;
      if (mode === "orbit") {
        cam.azimuth += dx * 0.005;
        cam.elevation = Math.min(Math.max(cam.elevation - dy * 0.005, 0.06), 1.52);
      } else {
        const k = cam.distance * 0.0016;
        const ca = Math.cos(cam.azimuth), sa = Math.sin(cam.azimuth);
        cam.target[0] -= (dx * ca - dy * sa) * k;
        cam.target[1] -= (dx * sa + dy * ca) * k;
      }
      scene.invalidate();
    };
    const up = (e: PointerEvent) => {
      if (mode !== "none" && moved < 5) {
        const rect = canvas.getBoundingClientRect();
        const hit = scene.pick(e.clientX - rect.left, e.clientY - rect.top);
        onPick(hit >= 0 && hit < inputs.streets.length ? hit : null);
      }
      mode = "none";
      setDragging(false);
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const cam = scene.camera;
      cam.distance = Math.min(
        Math.max(cam.distance * Math.exp(e.deltaY * 0.0012), 220),
        scene.worldExtent * 3,
      );
      scene.invalidate();
    };
    const leave = () => { window.clearTimeout(hoverTimer); onHover(null); };

    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("wheel", wheel, { passive: false });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    return () => {
      window.clearTimeout(hoverTimer);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("wheel", wheel);
    };
  }, [inputs.streets.length, onHover, onPick]);

  if (failed) {
    return <div className="splash" style={{ padding: 32, textAlign: "center" }}>{failed}</div>;
  }
  return <canvas ref={canvasRef} className={dragging ? "dragging" : ""} />;
}
