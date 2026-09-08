import mammoth from "mammoth";

export type ExtractProgress =
  | { kind: "reading"; detail?: string }
  | { kind: "ocr"; page: number; total: number };

export interface ExtractResult {
  /** Reconstructed text lines per source "page" (docx pages = chunked). */
  pages: { pageNumber: number; lines: string[] }[];
  sourceKind: "pdf" | "docx" | "doc" | "image";
}

/**
 * Dispatches extraction by file type. Everything runs client-side:
 * pdf.js for PDFs, mammoth for .docx, tesseract.js OCR for images,
 * and a lightweight binary text scrape for legacy .doc.
 */
export async function extractText(
  file: File,
  onProgress?: (p: ExtractProgress) => void,
): Promise<ExtractResult> {
  const name = file.name.toLowerCase();

  if (file.type === "application/pdf" || name.endsWith(".pdf")) {
    const { extractPdfText } = await import("./pdf");
    const result = await extractPdfText(file, (page, total) =>
      onProgress?.({ kind: "ocr", page, total }),
    );
    return { pages: result.pages, sourceKind: "pdf" };
  }

  if (
    name.endsWith(".docx") ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return extractDocx(file, onProgress);
  }

  if (
    name.endsWith(".doc") ||
    file.type === "application/msword"
  ) {
    return extractLegacyDoc(file);
  }

  if (file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp)$/.test(name)) {
    return extractImageText(file, onProgress);
  }

  throw new Error(
    `Unsupported file type: "${file.name}". Supported: PDF, DOC, DOCX, JPG, PNG.`,
  );
}

/** .docx → HTML (mammoth) → structure-aware lines. */
async function extractDocx(
  file: File,
  onProgress?: (p: ExtractProgress) => void,
): Promise<ExtractResult> {
  onProgress?.({ kind: "reading", detail: "Reading Word document…" });
  const buffer = await file.arrayBuffer();
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: buffer });

  const doc = new DOMParser().parseFromString(html, "text/html");
  const pages: { pageNumber: number; lines: string[] }[] = [];
  let lines: string[] = [];

  const pushLine = (text: string) => {
    const t = text.replace(/\s+/g, " ").trim();
    if (t) lines.push(t);
  };

  for (const el of doc.body.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li")) {
    if (lines.length >= 120) {
      pages.push({ pageNumber: pages.length + 1, lines });
      lines = [];
    }
    pushLine(el.textContent ?? "");
  }
  if (lines.length) pages.push({ pageNumber: pages.length + 1, lines });

  if (pages.length === 0) {
    throw new Error("That Word document appears to be empty.");
  }
  return { pages, sourceKind: "docx" };
}

/**
 * Legacy binary .doc: crude but effective — pull printable ASCII/UTF-16 runs
 * out of the OLE compound file. Good enough for headings/bullets heuristics.
 */
async function extractLegacyDoc(file: File): Promise<ExtractResult> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // Try UTF-16LE runs first (Word stores text as UTF-16 in the WordDocument stream).
  const utf16Chunks: string[] = [];
  let run = "";
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const code = bytes[i] | (bytes[i + 1] << 8);
    if (code >= 0x20 && code < 0xfffd && !(code >= 0xd800 && code < 0xe000)) {
      run += String.fromCharCode(code);
    } else {
      if (run.length >= 4) utf16Chunks.push(run);
      run = "";
    }
  }
  if (run.length >= 4) utf16Chunks.push(run);

  // Fallback: ASCII runs (older Word versions).
  if (utf16Chunks.join("").length < 200) {
    let ascii = "";
    run = "";
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if ((b >= 0x20 && b < 0x7f) || b === 0x0a || b === 0x0d) {
        run += String.fromCharCode(b);
      } else {
        if (run.length >= 4) ascii += run + "\n";
        run = "";
      }
    }
    if (run.length >= 4) ascii += run;
    utf16Chunks.push(ascii);
  }

  const text = utf16Chunks
    .join("\n")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n");

  const lines = text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 1 && !/^[^\w\s]{3,}$/.test(l));

  if (lines.length < 3) {
    throw new Error(
      "Couldn't read text from that .doc file. Re-save it as .docx for best results.",
    );
  }

  // Chunk into pseudo-pages so downstream progress/structure logic is uniform.
  const pages: { pageNumber: number; lines: string[] }[] = [];
  for (let i = 0; i < lines.length; i += 120) {
    pages.push({ pageNumber: pages.length + 1, lines: lines.slice(i, i + 120) });
  }
  return { pages, sourceKind: "doc" };
}

/** Image → tesseract.js OCR, entirely in-browser (WASM, no server). */
async function extractImageText(
  file: File,
  onProgress?: (p: ExtractProgress) => void,
): Promise<ExtractResult> {
  onProgress?.({ kind: "reading", detail: "Loading OCR engine…" });
  const { default: Tesseract } = await import("tesseract.js");
  const {
    data: { text },
  } = await Tesseract.recognize(file, "eng", {
    logger: (m) => {
      if (m.status === "recognizing text" && typeof m.progress === "number") {
        onProgress?.({
          kind: "ocr",
          page: Math.round(m.progress * 100),
          total: 100,
        });
      }
    },
  });

  const lines = text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 1);

  if (lines.length < 2) {
    throw new Error(
      "Couldn't detect readable text in that image. Photos of low-quality scans often fail OCR — try a sharper image.",
    );
  }

  const pages: { pageNumber: number; lines: string[] }[] = [];
  for (let i = 0; i < lines.length; i += 80) {
    pages.push({ pageNumber: pages.length + 1, lines: lines.slice(i, i + 80) });
  }
  return { pages, sourceKind: "image" };
}
