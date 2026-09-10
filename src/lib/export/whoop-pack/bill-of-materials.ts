import { getShapeKindLabel, type Translate } from "@/lib/track/items/registry";
import { getObstacleNumberMap } from "@/lib/track/obstacleNumbering";
import {
  getStructureGaps,
  type StructureGapEndpoint,
  type StructureGapEntry,
} from "@/lib/track/structure-gaps";
import {
  formatFieldSize,
  formatMeasurement,
  type MeasurementUnitSystem,
} from "@/lib/track/units";
import type { TrackDesign } from "@/lib/types";
import type { WhoopPackPartsList } from "./parts-list";

/**
 * The Whoop Pack's bill of materials, written twice: a Markdown table a crew
 * can read on a phone in the hall, and a CSV the same numbers can be pasted
 * from into a shopping list or a spreadsheet.
 *
 * Both are built from the same `WhoopPackPartsList`, so the two files can
 * never disagree.
 */

export interface WhoopPackTranslate {
  /** `exportPdf` namespace. */
  t: Translate;
  /** `shapes` namespace, for obstacle labels. */
  tShapes: Translate;
  /** `inspector` namespace, for the shared PVC fitting labels. */
  tInspector: Translate;
}

export interface WhoopPackBomContext {
  design: TrackDesign;
  dateText: string;
  parts: WhoopPackPartsList;
  routeLengthMeters: number | null;
  unitSystem: MeasurementUnitSystem;
  /** Files in the archive, in the order they are written. */
  archiveEntries: WhoopPackArchiveEntrySummary[];
}

export interface WhoopPackArchiveEntrySummary {
  name: string;
  description: string;
}

function getTrackTitle(design: TrackDesign, t: Translate) {
  return design.title.trim() || t("untitledTrack");
}

/**
 * How one end of a gap is named: the obstacle number when the structure is on
 * the route, otherwise its kind plus a short id so two identical frames can
 * still be told apart.
 */
export function getStructureGapEndpointLabel(
  endpoint: StructureGapEndpoint,
  { t, tShapes }: WhoopPackTranslate
) {
  if (endpoint.number !== null) {
    return t("buildSheet.spacingObstacle", { number: endpoint.number });
  }
  return t("whoopPack.bom.structureLabel", {
    kind: getShapeKindLabel(endpoint.kind, tShapes),
    id: endpoint.id.slice(-4),
  });
}

function getStructureGapRows(
  { design, unitSystem }: WhoopPackBomContext,
  translate: WhoopPackTranslate
) {
  return getStructureGaps(design).map((gap: StructureGapEntry) => ({
    from: getStructureGapEndpointLabel(gap.from, translate),
    to: getStructureGapEndpointLabel(gap.to, translate),
    centre: formatMeasurement(gap.centreDistanceMeters, unitSystem, {
      precision: 2,
    }),
    edge:
      gap.edgeGapMeters === null
        ? ""
        : formatMeasurement(gap.edgeGapMeters, unitSystem, { precision: 2 }),
  }));
}

function markdownCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function markdownTable(headers: string[], rows: string[][]) {
  const lines = [
    `| ${headers.map(markdownCell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(markdownCell).join(" | ")} |`),
  ];
  return lines.join("\n");
}

export function escapeCsvValue(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function csvRow(cells: string[]) {
  return cells.map(escapeCsvValue).join(",");
}

interface BomSummaryRow {
  label: string;
  value: string;
}

function getSummaryRows(
  {
    design,
    dateText,
    parts,
    routeLengthMeters,
    unitSystem,
  }: WhoopPackBomContext,
  { t }: WhoopPackTranslate
): BomSummaryRow[] {
  const rows: BomSummaryRow[] = [
    { label: t("whoopPack.bom.trackRow"), value: getTrackTitle(design, t) },
    {
      label: t("whoopPack.bom.fieldRow"),
      value: formatFieldSize(
        design.field.width,
        design.field.height,
        unitSystem
      ),
    },
    { label: t("whoopPack.bom.dateRow"), value: dateText },
    {
      label: t("whoopPack.bom.obstaclesRow"),
      value: String(getObstacleNumberMap(design).size),
    },
  ];

  if (routeLengthMeters !== null) {
    rows.push({
      label: t("whoopPack.bom.lapLengthRow"),
      value: formatMeasurement(routeLengthMeters, unitSystem, { precision: 1 }),
    });
  }
  if (parts.hasPvcFrames) {
    rows.push({
      label: t("whoopPack.partsPage.framesRow"),
      value: String(parts.pvc.frames),
    });
  }

  return rows;
}

interface BomQuantityRow {
  label: string;
  value: string;
}

function getPvcRows(
  { parts, unitSystem }: WhoopPackBomContext,
  { t }: WhoopPackTranslate
): BomQuantityRow[] {
  if (!parts.hasPvcFrames) return [];

  return [
    {
      label: t("whoopPack.partsPage.framesRow"),
      value: String(parts.pvc.frames),
    },
    ...parts.tubeGroups.map((group) => ({
      label: t("whoopPack.partsPage.tubesRow", {
        length: formatMeasurement(group.lengthMeters, unitSystem, {
          precision: 2,
        }),
      }),
      value: String(group.count),
    })),
    {
      label: t("whoopPack.partsPage.totalTubeLengthRow"),
      value: formatMeasurement(parts.totalTubeLengthMeters, unitSystem, {
        precision: 1,
      }),
    },
  ];
}

function getFittingRows(
  { parts }: WhoopPackBomContext,
  { t, tInspector }: WhoopPackTranslate
): BomQuantityRow[] {
  if (!parts.hasPvcFrames) return [];

  return [
    ...parts.fittingRows.map((row) => ({
      label: tInspector(`pvcFrame.fittings.${row.kind}`),
      value: String(row.count),
    })),
    { label: t("whoopPack.partsPage.feetRow"), value: String(parts.pvc.feet) },
  ];
}

export function buildWhoopPackBomMarkdown(
  context: WhoopPackBomContext,
  translate: WhoopPackTranslate
): string {
  const { t } = translate;
  const { parts, unitSystem } = context;
  const sections: string[] = [];

  sections.push(
    `# ${t("whoopPack.bom.title")} — ${getTrackTitle(context.design, t)}`
  );
  sections.push(
    getSummaryRows(context, translate)
      .map((row) => `- **${row.label}:** ${row.value}`)
      .join("\n")
  );

  const pvcRows = getPvcRows(context, translate);
  if (pvcRows.length) {
    sections.push(
      `## ${t("whoopPack.partsPage.pvcTitle")}\n\n${markdownTable(
        [t("whoopPack.bom.itemColumn"), t("whoopPack.bom.quantityColumn")],
        pvcRows.map((row) => [row.label, row.value])
      )}`
    );
  }

  const fittingRows = getFittingRows(context, translate);
  if (fittingRows.length) {
    const table = markdownTable(
      [t("whoopPack.bom.fittingColumn"), t("whoopPack.bom.quantityColumn")],
      fittingRows.map((row) => [row.label, row.value])
    );
    const intro = parts.fittingRows.length
      ? ""
      : `${t("whoopPack.partsPage.noFittings")}\n\n`;
    sections.push(
      `## ${t("whoopPack.partsPage.fittingsTitle")}\n\n${intro}${table}`
    );
  }

  if (parts.pvc.unbuildableJoints > 0) {
    sections.push(
      `> ${t("whoopPack.partsPage.unbuildableWarning", {
        count: parts.pvc.unbuildableJoints,
      })}`
    );
  }

  if (parts.relevantInventory.length) {
    sections.push(
      `## ${t("whoopPack.partsPage.stockTitle")}\n\n${markdownTable(
        [
          t("buildSheet.obstacleColumn"),
          t("buildSheet.requiredColumn"),
          t("buildSheet.availableColumn"),
          t("buildSheet.missingColumn"),
        ],
        parts.relevantInventory.map((row) => [
          row.label,
          String(row.required),
          String(row.available),
          String(row.missing),
        ])
      )}`
    );
  }

  if (parts.obstacleSpacing.length) {
    sections.push(
      `## ${t("buildSheet.spacingTitle")}\n\n${markdownTable(
        [
          t("buildSheet.spacingFromColumn"),
          t("buildSheet.spacingToColumn"),
          t("buildSheet.spacingDistanceColumn"),
        ],
        parts.obstacleSpacing.map((entry) => [
          t("buildSheet.spacingObstacle", { number: entry.fromNumber }),
          t("buildSheet.spacingObstacle", { number: entry.toNumber }),
          formatMeasurement(entry.distanceMeters, unitSystem, { precision: 2 }),
        ])
      )}`
    );
  }

  const gapRows = getStructureGapRows(context, translate);
  if (gapRows.length) {
    sections.push(
      `## ${t("whoopPack.bom.structureGapsTitle")}

${t("whoopPack.bom.structureGapsNote")}

${markdownTable(
  [
    t("buildSheet.spacingFromColumn"),
    t("buildSheet.spacingToColumn"),
    t("buildSheet.spacingDistanceColumn"),
    t("whoopPack.bom.edgeGapColumn"),
  ],
  gapRows.map((row) => [row.from, row.to, row.centre, row.edge])
)}`
    );
  }

  if (context.archiveEntries.length) {
    sections.push(
      `## ${t("whoopPack.bom.contentsTitle")}\n\n${context.archiveEntries
        .map((entry) => `- \`${entry.name}\` — ${entry.description}`)
        .join("\n")}`
    );
  }

  sections.push(
    `## ${t("whoopPack.partsPage.notesTitle")}\n\n${[
      t("whoopPack.partsPage.note1"),
      t("whoopPack.partsPage.note2"),
      t("whoopPack.partsPage.note3"),
    ]
      .map((note) => `- ${note}`)
      .join("\n")}`
  );

  return `${sections.join("\n\n")}\n`;
}

export function buildWhoopPackBomCsv(
  context: WhoopPackBomContext,
  translate: WhoopPackTranslate
): string {
  const { t } = translate;
  const { parts, unitSystem } = context;

  const lines: string[] = [
    csvRow([
      t("whoopPack.bom.csv.sectionColumn"),
      t("whoopPack.bom.csv.itemColumn"),
      t("whoopPack.bom.csv.quantityColumn"),
      t("whoopPack.bom.csv.availableColumn"),
      t("whoopPack.bom.csv.missingColumn"),
      t("whoopPack.bom.csv.distanceColumn"),
      t("whoopPack.bom.edgeGapColumn"),
    ]),
  ];

  const summaryTitle = t("whoopPack.bom.summaryTitle");
  for (const row of getSummaryRows(context, translate)) {
    lines.push(csvRow([summaryTitle, row.label, row.value, "", "", "", ""]));
  }

  const pvcTitle = t("whoopPack.partsPage.pvcTitle");
  for (const row of getPvcRows(context, translate)) {
    lines.push(csvRow([pvcTitle, row.label, row.value, "", "", "", ""]));
  }

  const fittingsTitle = t("whoopPack.partsPage.fittingsTitle");
  for (const row of getFittingRows(context, translate)) {
    lines.push(csvRow([fittingsTitle, row.label, row.value, "", "", "", ""]));
  }

  const stockTitle = t("whoopPack.partsPage.stockTitle");
  for (const row of parts.relevantInventory) {
    lines.push(
      csvRow([
        stockTitle,
        row.label,
        String(row.required),
        String(row.available),
        String(row.missing),
        "",
        "",
      ])
    );
  }

  const spacingTitle = t("buildSheet.spacingTitle");
  for (const entry of parts.obstacleSpacing) {
    lines.push(
      csvRow([
        spacingTitle,
        `${t("buildSheet.spacingObstacle", { number: entry.fromNumber })} → ${t(
          "buildSheet.spacingObstacle",
          { number: entry.toNumber }
        )}`,
        "",
        "",
        "",
        formatMeasurement(entry.distanceMeters, unitSystem, { precision: 2 }),
        "",
      ])
    );
  }

  const structureGapsTitle = t("whoopPack.bom.structureGapsTitle");
  for (const row of getStructureGapRows(context, translate)) {
    lines.push(
      csvRow([
        structureGapsTitle,
        `${row.from} → ${row.to}`,
        "",
        "",
        "",
        row.centre,
        row.edge,
      ])
    );
  }

  return `${lines.join("\r\n")}\r\n`;
}
