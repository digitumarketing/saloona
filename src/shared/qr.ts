/**
 * QR code rendering.
 *
 * The customer journey starts with a code on the reception desk, so this has to
 * produce something that scans reliably from a printed page and survives being
 * photocopied. Output is a single SVG path rather than one rect per module —
 * a 33×33 code is over a thousand rects otherwise, which makes both the printed
 * file and the browser's layout work needlessly heavy.
 *
 * Error correction is fixed at 'M' (~15% recoverable): 'L' is too fragile once a
 * poster has been on a counter for a month, and 'H' inflates the code so much
 * that the module size shrinks below what a cheap phone camera resolves.
 */

import qrcode from "qrcode-generator";

export interface QrOptions {
  /** Size of the rendered square in CSS pixels. */
  size?: number;
  /** Quiet-zone width in modules. The spec requires 4; less will fail to scan. */
  margin?: number;
  foreground?: string;
  background?: string;
  /** Leaves a clear square in the middle for a logo. Kept small on purpose. */
  logoHolePercent?: number;
}

export interface QrResult {
  svg: string;
  moduleCount: number;
}

/**
 * Builds an SVG for `text`.
 *
 * Type number 0 lets the library pick the smallest version that fits, so a short
 * join URL renders as a coarse, easily-scanned code instead of a dense one.
 */
export function qrSvg(text: string, options: QrOptions = {}): QrResult {
  const size = options.size ?? 320;
  const margin = options.margin ?? 4;
  const foreground = options.foreground ?? "#0b1b2b";
  const background = options.background ?? "#ffffff";

  const code = qrcode(0, "M");
  code.addData(text);
  code.make();

  const moduleCount = code.getModuleCount();
  const total = moduleCount + margin * 2;

  // Modules are emitted as run-length horizontal bars: adjacent dark modules in a
  // row become one path segment, which cuts the path data by roughly half.
  const parts: string[] = [];
  for (let row = 0; row < moduleCount; row += 1) {
    let runStart = -1;
    for (let column = 0; column <= moduleCount; column += 1) {
      const dark = column < moduleCount && code.isDark(row, column);
      if (dark && runStart === -1) runStart = column;
      if (!dark && runStart !== -1) {
        parts.push(`M${runStart + margin} ${row + margin}h${column - runStart}v1h-${column - runStart}z`);
        runStart = -1;
      }
    }
  }

  const hole = options.logoHolePercent ?? 0;
  const holeRect =
    hole > 0
      ? (() => {
          const holeModules = Math.round(moduleCount * hole);
          const offset = margin + Math.floor((moduleCount - holeModules) / 2);
          return `<rect x="${offset}" y="${offset}" width="${holeModules}" height="${holeModules}" rx="1" fill="${background}"/>`;
        })()
      : "";

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${total} ${total}" ` +
    `shape-rendering="crispEdges" role="img" aria-label="QR code">` +
    `<rect width="${total}" height="${total}" fill="${background}"/>` +
    `<path d="${parts.join("")}" fill="${foreground}"/>` +
    holeRect +
    `</svg>`;

  return { svg, moduleCount };
}
