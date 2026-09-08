import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Vite bundles the worker locally — no CDN, fully offline extraction.
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export interface PdfExtractResult {
  /** One entry per page with reconstructed visual lines. */
  pages: { pageNumber: number; lines: string[] }[];
  numPages: number;
}

interface TextItemLike {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL?: boolean;
}

/**
 * Extracts text from a PDF entirely in the browser using pdf.js.
 * Reconstructs visual lines from positioned text items (same baseline),
 * so the heuristic parser downstream sees document structure, not word soup.
 */
export async function extractPdfText(
  file: File,
  onProgress?: (page: number, total: number) => void,
): Promise<PdfExtractResult> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
  }).promise;

  const pages: PdfExtractResult["pages"] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const lines = mergeTextItemsIntoLines(content.items as TextItemLike[]);
    pages.push({ pageNumber: p, lines });
    onProgress?.(p, pdf.numPages);
  }

  const numPages = pdf.numPages;
  await pdf.cleanup();
  return { pages, numPages };
}

type Piece = { x: number; y: number; endX: number; str: string };

/**
 * Groups pdf.js text items into visual lines using their y-baseline,
 * then joins them left-to-right with smart spacing.
 */
function mergeTextItemsIntoLines(items: TextItemLike[]): string[] {
  const pieces: Piece[] = [];

  for (const item of items) {
    const str = item.str ?? "";
    if (!str.trim()) continue;
    const x = item.transform?.[4] ?? 0;
    const y = item.transform?.[5] ?? 0;
    pieces.push({ x, y, endX: x + (item.width || 0), str });
  }

  if (pieces.length === 0) return [];

  const tolerance = baselineTolerance(pieces);

  // Sort top-to-bottom, then left-to-right within a line.
  pieces.sort((a, b) =>
    Math.abs(a.y - b.y) <= tolerance ? a.x - b.x : b.y - a.y,
  );

  const lines: string[] = [];
  let current: Piece[] = [];
  let currentY = pieces[0].y;

  for (const piece of pieces) {
    if (Math.abs(piece.y - currentY) <= tolerance) {
      current.push(piece);
    } else {
      lines.push(joinPieces(current));
      current = [piece];
      currentY = piece.y;
    }
  }
  if (current.length) lines.push(joinPieces(current));
  return lines;
}

/** Median vertical gap between distinct baselines — approximates line pitch. */
function baselineTolerance(pieces: Piece[]): number {
  const ys = [...new Set(pieces.map((p) => Math.round(p.y * 2) / 2))].sort(
    (a, b) => b - a,
  );
  if (ys.length < 2) return 3;
  const gaps: number[] = [];
  for (let i = 1; i < ys.length && gaps.length < 30; i++) {
    const gap = ys[i - 1] - ys[i];
    if (gap > 1.5) gaps.push(gap);
  }
  if (!gaps.length) return 3;
  gaps.sort((a, b) => a - b);
  return Math.max(2, gaps[Math.floor(gaps.length / 2)] * 0.5);
}

function joinPieces(pieces: Piece[]): string {
  if (pieces.length === 0) return "";
  let out = pieces[0].str;
  for (let i = 1; i < pieces.length; i++) {
    const gap = pieces[i].x - pieces[i - 1].endX;
    out += needsSpace(out, pieces[i].str, gap) ? " " : "";
    out += pieces[i].str;
  }
  return out;
}

function needsSpace(left: string, right: string, gap: number): boolean {
  if (!left || !right) return false;
  if (/\s$/.test(left) || /^\s/.test(right)) return false;
  const last = left[left.length - 1];
  const first = right[0];
  // Punctuation that glues to the next fragment without a space.
  if ("([{“‘'\"-—–/".includes(last)) return false;
  if (")]},.;:!?%”’'\"".includes(first)) return false;
  // Explicit geometry: a real gap means a space; overlap means none.
  if (gap > 1.2) return true;
  if (gap < -0.5) return false;
  return true;
}
