export type ExportTheme = "dark" | "light";

/**
 * The 2D export palette, shared by the field export (`designToSvg`) and the
 * Whoop Pack route map so the two never drift apart.
 */
export function getExport2DColors(theme: ExportTheme) {
  const isDark = theme === "dark";

  return {
    bg: isDark ? "#0b0f18" : "#ffffff",
    fieldFill: isDark ? "#0c1520" : "#f8fafc",
    fieldFillOp: isDark ? "0.6" : "1",
    gridMajor: isDark ? "#1e3550" : "#c8d8e8",
    gridCoarse: isDark ? "#172c42" : "#dce8f0",
    gridMinor: isDark ? "#111f30" : "#eaf0f6",
    gridOp: isDark ? "0.85" : "0.7",
    borderGlow: isDark ? "#1a2d44" : "#b0c8e0",
    border: isDark ? "#2a4060" : "#7a9ab8",
    brackets: isDark ? "#3a5878" : "#6a8aa8",
    footerBg: isDark ? "#060a10" : "#f0f4f8",
    footerLine: isDark ? "#1e3550" : "#c0d0e0",
    footerTitle: isDark ? "#6a9abf" : "#1a3050",
    footerMeta: isDark ? "#3a6080" : "#4a6a88",
  };
}
