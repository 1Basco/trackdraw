/**
 * Browser rasterisation helpers shared by the export packs: turning an SVG
 * string into PNG pixels, and turning the resulting data URL into the raw
 * bytes an archive entry needs.
 */

/** Draws an SVG object URL onto a canvas and returns a PNG data URL. */
export async function loadSvgAsPng(
  svgUrl: string,
  w: number,
  h: number
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve("");
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve("");
    img.src = svgUrl;
  });
}

/** Rasterises an SVG document to a PNG data URL at the given pixel size. */
export async function svgStringToPngDataUrl(
  svgString: string,
  width: number,
  height: number
): Promise<string> {
  const svgBlob = new Blob([svgString], { type: "image/svg+xml" });
  const svgUrl = URL.createObjectURL(svgBlob);
  try {
    return await loadSvgAsPng(svgUrl, width, height);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

/** Decodes the base64 payload of a `data:` URL into bytes. */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const separator = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || separator < 0) {
    throw new Error("Not a data URL");
  }
  if (!dataUrl.slice(0, separator).includes(";base64")) {
    throw new Error("Only base64 data URLs can be decoded to bytes");
  }

  const binary = atob(dataUrl.slice(separator + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
