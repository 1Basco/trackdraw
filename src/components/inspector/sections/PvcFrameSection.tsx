"use client";

import { useTranslations } from "next-intl";
import {
  MeasurementNum,
  Num,
  Row,
  Section,
} from "@/components/inspector/shared";
import { getPvcFrameBillOfMaterials } from "@/lib/track/pvc-frame/bom";
import { PVC_FITTING_KINDS } from "@/lib/track/pvc-frame/joints";
import {
  getPvcFrameCellOpening,
  getPvcFramePitch,
  MAX_PVC_PIPE_DIAMETER_METERS,
  MAX_PVC_TUBE_LENGTH_METERS,
  MIN_PVC_PIPE_DIAMETER_METERS,
  MIN_PVC_TUBE_LENGTH_METERS,
  resolvePvcFrameKit,
} from "@/lib/track/pvc-frame/kit";
import { getPvcFrameTopLevel } from "@/lib/track/pvc-frame/lattice";
import {
  formatMeasurement,
  type MeasurementUnitSystem,
} from "@/lib/track/units";
import type { PvcFrameShape, Shape } from "@/lib/types";
import { useEditor } from "@/store/editor";

function formatSmallMeasurement(
  meters: number,
  unitSystem: MeasurementUnitSystem
) {
  if (unitSystem === "metric") {
    return `${Math.round(meters * 1000)} mm`;
  }
  return formatMeasurement(meters, unitSystem, { precision: 2 });
}

export function PvcFrameSection({
  shape,
  unitSystem,
  unitLabel,
  updateShape,
  defaultOpen,
}: {
  shape: PvcFrameShape;
  unitSystem: MeasurementUnitSystem;
  unitLabel: string;
  updateShape: (id: string, patch: Partial<Shape>) => void;
  defaultOpen: boolean;
}) {
  const t = useTranslations("inspector");
  const buildLevel = useEditor((state) => state.ui.pvcBuildLevel);
  const setPvcBuildLevel = useEditor((state) => state.setPvcBuildLevel);

  const kit = resolvePvcFrameKit(shape);
  const pitch = getPvcFramePitch(kit);
  const opening = getPvcFrameCellOpening(kit);
  const topLevel = getPvcFrameTopLevel(shape.edges);
  const activeLevel = Math.max(0, Math.min(buildLevel, topLevel));
  const bom = getPvcFrameBillOfMaterials(shape);
  const fittingRows = PVC_FITTING_KINDS.filter(
    (kind) => bom.fittings[kind] > 0
  );

  return (
    <Section title={t("pvcFrame.sectionTitle")} defaultOpen={defaultOpen}>
      <Row label={t("pvcFrame.buildLevelLabel")}>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <Num
              value={activeLevel}
              onChange={(value) =>
                setPvcBuildLevel(
                  Math.max(0, Math.min(topLevel, Math.round(value)))
                )
              }
              step={1}
              min={0}
              max={topLevel}
            />
          </div>
          <span className="text-muted-foreground/65 shrink-0 font-mono text-[10px]">
            {t("pvcFrame.levelHeight", {
              height: formatMeasurement(activeLevel * pitch, unitSystem),
            })}
          </span>
        </div>
      </Row>
      <p className="text-muted-foreground/70 text-[11px] leading-relaxed">
        {t("pvcFrame.buildHint")}
      </p>
      <Row label={t("pvcFrame.tubeLengthLabel", { unit: unitLabel })}>
        <MeasurementNum
          valueMeters={kit.tubeLength}
          unitSystem={unitSystem}
          onChange={(value) => updateShape(shape.id, { tubeLength: value })}
          minMeters={MIN_PVC_TUBE_LENGTH_METERS}
          maxMeters={MAX_PVC_TUBE_LENGTH_METERS}
        />
      </Row>
      <Row label={t("pvcFrame.pipeDiameterLabel", { unit: unitLabel })}>
        <MeasurementNum
          valueMeters={kit.pipeDiameter}
          unitSystem={unitSystem}
          onChange={(value) => updateShape(shape.id, { pipeDiameter: value })}
          minMeters={MIN_PVC_PIPE_DIAMETER_METERS}
          maxMeters={MAX_PVC_PIPE_DIAMETER_METERS}
        />
      </Row>
      <Row label={t("pvcFrame.pitchLabel")}>
        <span className="font-mono text-[11px]">
          {formatSmallMeasurement(pitch, unitSystem)}
        </span>
      </Row>
      <Row label={t("pvcFrame.openingLabel")}>
        <span className="font-mono text-[11px]">
          {formatSmallMeasurement(opening, unitSystem)}
        </span>
      </Row>
      <Row label={t("pvcFrame.heightLabel")}>
        <span className="font-mono text-[11px]">
          {formatMeasurement(topLevel * pitch, unitSystem)}
        </span>
      </Row>
      <div className="border-border/40 mt-2 border-t pt-2">
        <p className="text-muted-foreground/70 mb-1 text-[11px] font-medium tracking-[0.08em] uppercase">
          {t("pvcFrame.materialsTitle")}
        </p>
        <Row label={t("pvcFrame.tubesLabel")}>
          <span className="font-mono text-[11px]">
            {t("pvcFrame.tubesValue", {
              count: bom.tubes,
              length: formatSmallMeasurement(kit.tubeLength, unitSystem),
            })}
          </span>
        </Row>
        {fittingRows.map((kind) => (
          <Row key={kind} label={t(`pvcFrame.fittings.${kind}`)}>
            <span className="font-mono text-[11px]">{bom.fittings[kind]}</span>
          </Row>
        ))}
        <Row label={t("pvcFrame.feetLabel")}>
          <span className="font-mono text-[11px]">{bom.feet}</span>
        </Row>
        {bom.unbuildableJoints > 0 ? (
          <p className="mt-1 rounded-lg border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
            {t("pvcFrame.unbuildableWarning", {
              count: bom.unbuildableJoints,
            })}
          </p>
        ) : null}
      </div>
    </Section>
  );
}
