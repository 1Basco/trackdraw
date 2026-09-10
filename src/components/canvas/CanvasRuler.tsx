"use client";

import { memo, useEffect, useRef } from "react";
import {
  formatMeasurement,
  type MeasurementUnitSystem,
} from "@/lib/track/units";

export const RULER_SIZE = 24;

interface RulerProps {
  orientation: "h" | "v";
  /** Current Konva stage transform */
  stageTransform: { x: number; y: number; scale: number };
  /** Pixels per meter at scale 1 */
  ppm: number;
  /** Grid step in meters */
  gridStep: number;
  /** Viewport width (h) or height (v) in pixels */
  length: number;
  isDark: boolean;
  unitSystem?: MeasurementUnitSystem;
}

function CanvasRulerComponent({
  orientation,
  stageTransform,
  ppm,
  gridStep,
  length,
  isDark,
  unitSystem = "metric",
}: RulerProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { x: stX, y: stY, scale } = stageTransform;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || length <= 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const isH = orientation === "h";
    const cw = isH ? length : RULER_SIZE;
    const ch = isH ? RULER_SIZE : length;

    // Assigning canvas.width/height reallocates the backing store and resets
    // the 2D context, which is far too expensive to do on every wheel-zoom
    // frame. Only resize when the pixel size actually changes; otherwise just
    // reset the transform and repaint over the existing buffer.
    const pixelWidth = Math.round(cw * dpr);
    const pixelHeight = Math.round(ch * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // ── Background ───────────────────────────────────────────────
    ctx.fillStyle = isDark ? "#070b12" : "#f2f4f7";
    ctx.fillRect(0, 0, cw, ch);

    // ── Border / separator ───────────────────────────────────────
    ctx.strokeStyle = isDark ? "#1a2636" : "#c8d2db";
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (isH) {
      ctx.moveTo(0, ch - 0.5);
      ctx.lineTo(cw, ch - 0.5);
    } else {
      ctx.moveTo(cw - 0.5, 0);
      ctx.lineTo(cw - 0.5, ch);
    }
    ctx.stroke();

    // ── Adaptive major/coarse intervals ─────────────────────────
    const targetMajorPx = 60;
    const rawMajorM = targetMajorPx / (ppm * scale);
    const niceSteps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
    const majorM = niceSteps.find((v) => v >= rawMajorM) ?? 1000;
    const minorM = majorM / 5;

    const minorScreenStep = minorM * ppm * scale;
    if (minorScreenStep < 2) return;

    const offset = isH ? stX : stY;
    const iStart = Math.floor(-offset / minorScreenStep) - 2;
    const iEnd = Math.ceil((length - offset) / minorScreenStep) + 2;

    ctx.font = `10px ui-monospace, monospace`;

    // Ticks are bucketed by class and stroked in three passes. Stroking each of
    // the ~100 ticks on its own turned the ruler into a per-frame hot spot
    // while the wheel zoom animation runs; the ticks never overlap, so drawing
    // them grouped is visually identical.
    const tickClasses = [
      {
        tickLen: 5,
        lineWidth: 0.75,
        strokeStyle: isDark ? "#1e3448" : "#bdd0dc",
        positions: [] as number[],
      },
      {
        tickLen: 9,
        lineWidth: 0.75,
        strokeStyle: isDark ? "#2a4860" : "#9ab0c4",
        positions: [] as number[],
      },
      {
        tickLen: 14,
        lineWidth: 1,
        strokeStyle: isDark ? "#4a7090" : "#6a8aa8",
        positions: [] as number[],
      },
    ];
    const labels: { sp: number; text: string }[] = [];

    for (let i = iStart; i <= iEnd; i++) {
      const sp = offset + i * minorScreenStep;
      if (sp < -1 || sp > length + 1) continue;

      const metersRaw = i * minorM;
      const meters = Math.round(metersRaw * 1000) / 1000;
      const isMajor = Math.abs(meters % majorM) < majorM * 0.01;
      const isCoarse =
        !isMajor && Math.abs(meters % (majorM / 2)) < majorM * 0.01;

      tickClasses[isMajor ? 2 : isCoarse ? 1 : 0].positions.push(sp);

      if (isMajor) {
        labels.push({
          sp,
          text: formatMeasurement(meters, unitSystem, {
            precision: Number.isInteger(meters) ? 0 : 1,
          }),
        });
      }
    }

    for (const tickClass of tickClasses) {
      if (!tickClass.positions.length) continue;
      ctx.strokeStyle = tickClass.strokeStyle;
      ctx.lineWidth = tickClass.lineWidth;
      ctx.beginPath();
      for (const sp of tickClass.positions) {
        if (isH) {
          ctx.moveTo(sp + 0.5, ch - tickClass.tickLen);
          ctx.lineTo(sp + 0.5, ch);
        } else {
          ctx.moveTo(cw - tickClass.tickLen, sp + 0.5);
          ctx.lineTo(cw, sp + 0.5);
        }
      }
      ctx.stroke();
    }

    ctx.fillStyle = isDark ? "#7aa8cc" : "#4a6a88";
    for (const { sp, text } of labels) {
      if (isH) {
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(text, sp + 3, 2);
      } else {
        // Rotate label to run bottom-to-top, centered on tick position
        ctx.save();
        ctx.translate(cw / 2 - 1, sp);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, 0, 0);
        ctx.restore();
      }
    }
    // Primitive deps: the caller rebuilds the stageTransform object on every
    // render, so depending on the object would repaint even when nothing moved.
  }, [orientation, stX, stY, scale, ppm, gridStep, length, isDark, unitSystem]);

  const isH = orientation === "h";
  return (
    <canvas
      ref={ref}
      className="pointer-events-none absolute z-10"
      style={{
        top: 0,
        left: 0,
        width: isH ? length : RULER_SIZE,
        height: isH ? RULER_SIZE : length,
      }}
    />
  );
}

// The stage transform arrives as a freshly built object on every parent render,
// so compare it field by field instead of by identity.
export const CanvasRuler = memo(CanvasRulerComponent, (prev, next) => {
  return (
    prev.orientation === next.orientation &&
    prev.stageTransform.x === next.stageTransform.x &&
    prev.stageTransform.y === next.stageTransform.y &&
    prev.stageTransform.scale === next.stageTransform.scale &&
    prev.ppm === next.ppm &&
    prev.gridStep === next.gridStep &&
    prev.length === next.length &&
    prev.isDark === next.isDark &&
    prev.unitSystem === next.unitSystem
  );
});
