/**
 * Heuristic PDF text → Mermaid flowchart converter.
 *
 * Pure client-side regex/heuristics — no AI APIs, no network calls.
 * Pipeline: text lines → structure detection → hierarchical block graph →
 * valid Mermaid `flowchart TD` syntax.
 */

export interface StructureNode {
  id: number;
  label: string;
  /** Heading level (1 = top). Null when not a heading. */
  headingLevel: number | null;
  /** Bullet depth (0-based). Null when not a list item. */
  bulletLevel: number | null;
  page: number;
}

export interface FlowchartResult {
  mermaid: string;
  nodes: StructureNode[];
  stats: {
    pages: number;
    headings: number;
    bullets: number;
    nodes: number;
  };
}

const BULLET_RE =
  /^\s*(?:[•▪●‣◦·]\s*|[-–—]\s+|\d{1,2}[.)]\s+|[a-zA-Z][.)]\s+|(?:i{1,3}|iv|v|vi{1,3}|ix|x)[.)]\s+)/i;

const DECISION_RE =
  /^(?:if|when|whether|should|do (?:we|i)|should (?:we|i)|is (?:it|there)|are (?:they|there)|has|does|can|must)\b[^?.]*\??$/i;

/** Detects document structure from extracted PDF lines. */
export function detectStructure(
  pages: { pageNumber: number; lines: string[] }[],
): StructureNode[] {
  const nodes: StructureNode[] = [];
  let id = 0;

  for (const page of pages) {
    for (const raw of page.lines) {
      const line = raw.replace(/\s+/g, " ").trim();
      if (!line || line.length < 2) continue;

      const bulletMatch = line.match(BULLET_RE);
      if (bulletMatch) {
        const indent = raw.length - raw.trimStart().length;
        const depth = Math.min(3, Math.floor(indent / 2));
        nodes.push({
          id: id++,
          label: cleanLabel(line.replace(BULLET_RE, "")),
          headingLevel: null,
          bulletLevel: depth,
          page: page.pageNumber,
        });
        continue;
      }

      const heading = detectHeading(line);
      if (heading) {
        nodes.push({
          id: id++,
          label: cleanLabel(line),
          headingLevel: heading,
          bulletLevel: null,
          page: page.pageNumber,
        });
        continue;
      }

      if (line.length <= 120) {
        nodes.push({
          id: id++,
          label: cleanLabel(line),
          headingLevel: null,
          bulletLevel: null,
          page: page.pageNumber,
        });
      }
    }
  }
  return nodes;
}

/** Numbered "1.2 Setup", ALL CAPS, "Title:" and Title Case headings. */
function detectHeading(line: string): number | null {
  if (line.length > 80 || line.length < 3) return null;

  const numbered = line.match(/^(\d+(?:\.\d+)*)[.)]?\s+\S/);
  if (numbered) {
    return Math.min(4, numbered[1].split(".").length);
  }

  const caps = line.match(/^[A-Z0-9][A-Z0-9 &,'\-/]{2,59}$/);
  if (caps && /[A-Z]{2,}/.test(line)) return 1;

  if (/:$/.test(line) && line.length <= 60) return 2;

  const words = line.split(/\s+/);
  const capitalized = words.filter((w) => /^[A-Z]/.test(w)).length;
  if (
    words.length >= 2 &&
    words.length <= 9 &&
    capitalized >= words.length * 0.6
  ) {
    return 3;
  }
  return null;
}

/** Builds a hierarchical flowchart from the detected structure. */
export function buildFlowchart(nodes: StructureNode[]): FlowchartResult {
  const kept: StructureNode[] = [];
  const seen = new Set<string>();

  for (const n of nodes) {
    if (n.label.length < 2) continue;
    const key = n.label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(n);
  }

  if (kept.length === 0) {
    return {
      mermaid: 'flowchart TD\n  A["No structured content detected"]',
      nodes: [],
      stats: { pages: 0, headings: 0, bullets: 0, nodes: 0 },
    };
  }

  const lines: string[] = ["flowchart TD"];
  const idOf = (n: StructureNode) => `N${n.id}`;
  // Most recent node id at each nesting depth (headings 0-3, bullets 10-13).
  const lastAtDepth = new Map<number, number>();
  let lastAny: number | null = null;
  let stopCounter = 0;

  for (const node of kept) {
    let depth: number;
    if (node.headingLevel !== null) depth = node.headingLevel - 1;
    else if (node.bulletLevel !== null) depth = 10 + node.bulletLevel;
    else depth = 20;

    // Find the parent: nearest previous node at a shallower depth.
    let parentId: number | null = null;
    let parentDepth = -1;
    for (const [d, id] of lastAtDepth) {
      if (d < depth && d > parentDepth) {
        parentDepth = d;
        parentId = id;
      }
    }
    if (parentId === null && lastAny !== null && lastAny !== node.id) {
      parentId = lastAny;
    }

    // Emit node with a shape matching its role.
    const label = mQuote(node.label);
    if (node.headingLevel !== null) {
      lines.push(`  ${idOf(node)}(["${label}"])`);
    } else if (node.bulletLevel !== null && DECISION_RE.test(node.label)) {
      lines.push(`  ${idOf(node)}{"${label}"}`);
    } else {
      lines.push(`  ${idOf(node)}["${label}"]`);
    }

    // Emit edge.
    if (parentId !== null) {
      if (node.bulletLevel !== null && DECISION_RE.test(node.label)) {
        lines.push(`  ${idOf(kept[parentId])} -->|Yes| ${idOf(node)}`);
        lines.push(`  ${idOf(kept[parentId])} -->|No| S${stopCounter}["Stop"]`);
        stopCounter++;
      } else {
        lines.push(`  ${idOf(kept[parentId])} --> ${idOf(node)}`);
      }
    }

    lastAtDepth.set(depth, node.id);
    // Clear deeper recorded depths so stale children don't re-attach.
    for (const d of [...lastAtDepth.keys()]) {
      if (d > depth) lastAtDepth.delete(d);
    }
    lastAny = node.id;
  }

  const headings = kept.filter((n) => n.headingLevel !== null).length;
  const bullets = kept.filter((n) => n.bulletLevel !== null).length;

  return {
    mermaid: lines.join("\n"),
    nodes: kept,
    stats: {
      pages: Math.max(...kept.map((n) => n.page)),
      headings,
      bullets,
      nodes: kept.length,
    },
  };
}

function cleanLabel(s: string): string {
  return s
    .replace(/["`]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);
}

function mQuote(s: string): string {
  return s.replace(/"/g, "'");
}
