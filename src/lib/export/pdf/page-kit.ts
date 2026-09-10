import type { jsPDF } from "@/lib/vendor/jspdf";
import type { SupportedLocale } from "@/lib/i18n/locales";
import {
  getRequiredInventoryCounts,
  inventoryKinds,
  normalizeInventoryProfile,
} from "@/lib/planning/inventory";
import { getShapeKindLabel, type Translate } from "@/lib/track/items/registry";
import type { TrackDesign } from "@/lib/types";
import {
  designToSvg,
  type Export2DOptions,
  type ExportTheme,
} from "../exportSvg";
import { setPdfFont } from "../pdf-font";
import { loadSvgAsPng } from "../raster";

/**
 * Page furniture shared by the printable packs (Race Pack, Whoop Pack): the
 * print palette, the brand logo, headers, footers, section rules, and info
 * cards. Pack-specific layout stays in the pack module.
 */

export const PRINT_BG: [number, number, number] = [255, 255, 255];
export const INK: [number, number, number] = [24, 39, 60];
export const MUTED: [number, number, number] = [95, 112, 140];
export const BORDER: [number, number, number] = [215, 223, 235];
export const PANEL: [number, number, number] = [245, 248, 252];
export const WARN: [number, number, number] = [180, 83, 9];
export const BRAND_LOGO_ASPECT = 1027 / 200;

export function formatPdfDate(locale: SupportedLocale | undefined) {
  const dateLocale =
    locale === "zh-CN"
      ? locale
      : locale === "nl"
        ? "nl-NL"
        : locale === "de"
          ? "de-DE"
          : "en-GB";

  return new Date().toLocaleDateString(dateLocale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export async function renderDesignPngDataUrl(
  design: TrackDesign,
  theme: ExportTheme,
  options?: Export2DOptions
) {
  const svgString = designToSvg(design, theme, options);
  const svgBlob = new Blob([svgString], { type: "image/svg+xml" });
  const svgUrl = URL.createObjectURL(svgBlob);
  const dataUrl = await loadSvgAsPng(
    svgUrl,
    Math.round(design.field.width * design.field.ppm * 2),
    Math.round(design.field.height * design.field.ppm * 2)
  );
  URL.revokeObjectURL(svgUrl);
  return dataUrl;
}

export async function loadBrandLogo() {
  return loadSvgAsPng(
    "/assets/brand/trackdraw-logo-mono-lightbg.svg",
    799,
    200
  );
}

export function setPageBackground(pdf: jsPDF) {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  pdf.setFillColor(...PRINT_BG);
  pdf.rect(0, 0, pageW, pageH, "F");
}

export function drawPageFooter(
  pdf: jsPDF,
  {
    pageLabel,
    pageNumber,
    totalPages,
    t,
  }: {
    pageLabel: string;
    pageNumber: number;
    totalPages: number;
    t: Translate;
  }
) {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 14;
  const footerY = pageH - 10;

  pdf.setDrawColor(...BORDER);
  pdf.setLineWidth(0.25);
  pdf.line(margin, footerY - 3.5, pageW - margin, footerY - 3.5);

  setPdfFont(pdf, "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(...MUTED);
  pdf.text(t("footer.brand", { pageLabel }), margin, footerY);
  pdf.text(
    t("footer.pageOf", { pageNumber, totalPages }),
    pageW - margin,
    footerY,
    { align: "right" }
  );
}

export function drawSmallPageLogo(pdf: jsPDF, logoDataUrl: string) {
  if (!logoDataUrl) return;
  const pageW = pdf.internal.pageSize.getWidth();
  const margin = 14;
  const logoH = 3.8;
  const logoW = logoH * BRAND_LOGO_ASPECT;
  pdf.addImage(
    logoDataUrl,
    "PNG",
    pageW - margin - logoW,
    margin - 1,
    logoW,
    logoH
  );
}

export function drawSectionTitle(
  pdf: jsPDF,
  title: string,
  x: number,
  y: number,
  w: number
) {
  setPdfFont(pdf, "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(...MUTED);
  pdf.text(title.toUpperCase(), x, y);
  pdf.setDrawColor(...BORDER);
  pdf.setLineWidth(0.25);
  pdf.line(x, y + 2.5, x + w, y + 2.5);
}

export function drawInfoCard(
  pdf: jsPDF,
  {
    x,
    y,
    w,
    h,
    label,
    value,
    tone = "neutral",
  }: {
    x: number;
    y: number;
    w: number;
    h: number;
    label: string;
    value: string;
    tone?: "neutral" | "warn";
  }
) {
  pdf.setFillColor(...PANEL);
  pdf.setDrawColor(...BORDER);
  pdf.setLineWidth(0.25);
  pdf.roundedRect(x, y, w, h, 3, 3, "FD");
  setPdfFont(pdf, "bold");
  pdf.setFontSize(7);
  pdf.setTextColor(...MUTED);
  pdf.text(label.toUpperCase(), x + 4, y + 6);
  setPdfFont(pdf, "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(...(tone === "warn" ? WARN : INK));
  pdf.text(value, x + 4, y + 14);
}

export interface InventoryComparisonRow {
  kind: (typeof inventoryKinds)[number];
  label: string;
  required: number;
  available: number;
  missing: number;
  buildable: boolean;
}

export function getInventoryComparison(
  design: TrackDesign,
  tShapes: Translate
): InventoryComparisonRow[] {
  const available = normalizeInventoryProfile(design.inventory);
  const required = getRequiredInventoryCounts(design);

  return inventoryKinds.map((kind) => {
    const needed = required[kind];
    const stock = available[kind];
    const missing = Math.max(0, needed - stock);

    return {
      kind,
      label: getShapeKindLabel(kind, tShapes),
      required: needed,
      available: stock,
      missing,
      buildable: missing === 0,
    };
  });
}
