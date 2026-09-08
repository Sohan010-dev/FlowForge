/**
 * Heuristic document → key-point flowchart converter.
 *
 * Pure client-side heuristics — no AI APIs, no network calls.
 * Pipeline: raw lines → reconstructed sentences → importance scoring →
 * distillation into short key points → topic grouping → Mermaid
 * `flowchart TD` with a root → topics → key points hierarchy.
 *
 * The goal: someone who has never read the document can glance at the
 * chart and walk away with its most important points — not a wall of
 * transcribed sentences.
 */

export interface FlowchartResult {
  mermaid: string;
  /** Distilled key points in chart order (most important kept). */
  keyPoints: string[];
  /** Topic (section) titles in document order. */
  topics: string[];
  stats: {
    pages: number;
    sentences: number;
    keyPoints: number;
    topics: number;
  };
}

export interface PageLines {
  pageNumber: number;
  lines: string[];
}

const BULLET_RE =
  /^\s*(?:[•▪●‣◦·]\s*|[-–—]\s+|\d{1,2}[.)]\s+|[a-zA-Z][.)]\s+|(?:i{1,3}|iv|v|vi{1,3}|ix|x)[.)]\s+)/i;

/** Question-shaped points render as decision diamonds. */
const DECISION_RE =
  /^(?:if|when|whether|should|is|are|does|do|can|must|has|have)\b[^?]*\?/i;

/** Words that signal a sentence carries real substance. */
const SIGNAL_RE =
  /\b(must|should|require[ds]?|need|needs|important|critical|key|ensure[ds]?|goal|objectives?|purpose|aims?|benefits?|results?|outcomes?|conclusions?|conclude|summar\w+|recommen\w+|best practices?|steps?|process|increas\w+|decreas\w+|improv\w+|reduc\w+|risks?|because|therefore|due to|impacts?|affects?|effects?|enabl\w+|provid\w+|helps?|avoid|prevents?|maximi[sz]e|minimi[sz]e|optimi[sz]e|priorit\w+|significan\w+|essential|primary|advantages?|disadvantages?|challenges?|solutions?|problems?|issues?)\b/gi;

/** Runners, footers, URLs, captions — never key points. */
const BOILERPLATE_RE =
  /copyright|©|all rights reserved|www\.|https?:\/\/|confidential|^\s*(table of contents|contents|references|bibliography|appendix|glossary)\b|^\s*(figure|fig\.|table|exhibit|chart)\s*\d|^\s*page\s+\d+\b|^\s*\d+\s*[|·]\s*\d+\s*$|^\s*\d+\s*$|^\s*(draft|rev(ision)?\s*\d)/i;

/** Limits that keep the chart glanceable. */
const MAX_TOPICS = 8;
const POINTS_PER_TOPIC = 5;
const MAX_POINTS = 24;

type Kind = "heading" | "bullet" | "sentence";

interface Candidate {
  text: string;
  page: number;
  kind: Kind;
  /** Bullet nesting or heading level (1 = top). */
  depth: number;
  /** Index into the topic list, -1 before any heading. */
  topicIndex: number;
  score: number;
}

/** "Numbered 1.2 Setup", ALL CAPS, "Title:" and Title Case headings. */
function detectHeading(line: string): number | null {
  if (line.length > 80 || line.length < 3) return null;

  const numbered = line.match(/^(\d+(?:\.\d+)*)[.)]?\s+(\S.*)$/);
  if (numbered) {
    // Guard: "2023 saw growth" is prose, not a heading — require the first
    // number group to be section-like (1-2 digits) or Title Case, plus
    // heading-like brevity (a numbered *sentence* is a list item, not a topic).
    const firstPart = numbered[1].split(".")[0];
    const rest = numbered[2].trim();
    const words = rest.split(/\s+/).length;
    const sectionLike = firstPart.length <= 2 || /^[A-Z]/.test(rest);
    const brief = rest.length <= 60 && words <= 8;
    const sentencey = /\.$/.test(rest) && words > 4;
    if (sectionLike && brief && !sentencey) {
      return Math.min(4, numbered[1].split(".").length);
    }
    return null;
  }

  const caps = line.match(/^[A-Z0-9][A-Z0-9 &,'\-/]{2,59}$/);
  if (caps && /[A-Z]{2,}/.test(line)) return 1;

  if (/:$/.test(line) && line.length <= 60) return 2;

  const words = line.split(/\s+/);
  const capitalized = words.filter((w) => /^[A-Z]/.test(w)).length;
  if (words.length >= 2 && words.length <= 9 && capitalized >= words.length * 0.6) {
    return 3;
  }
  return null;
}

/**
 * Walks the raw lines of every page and reconstructs the units that carry
 * meaning: headings (topics), bullets, and sentences (wrapped lines joined).
 */
function extractCandidates(pages: PageLines[]): {
  candidates: Candidate[];
  topics: string[];
} {
  const flat: { page: number; text: string }[] = [];
  for (const page of pages) {
    for (const raw of page.lines) {
      const line = raw.replace(/\s+/g, " ").trim();
      if (line.length > 1) flat.push({ page: page.pageNumber, text: line });
    }
  }

  const candidates: Candidate[] = [];
  const topics: string[] = [];
  let topicIndex = -1;
  let buf: string[] = [];
  let bufPage = 1;

  const flush = () => {
    const text = buf.join(" ").replace(/\s+/g, " ").trim();
    buf = [];
    if (text.length < 20 || text.length > 420) return;
    candidates.push({ text, page: bufPage, kind: "sentence", depth: 0, topicIndex, score: 0 });
  };

  let i = 0;
  while (i < flat.length) {
    const { page, text: line } = flat[i];

    if (BOILERPLATE_RE.test(line)) {
      flush();
      i++;
      continue;
    }

    const bulletMatch = line.match(BULLET_RE);
    if (bulletMatch) {
      flush();
      // Numbered section headings ("1. Purpose") match BULLET_RE too —
      // classify them as topics instead of list items.
      const asHeading = detectHeading(line);
      if (asHeading !== null) {
        if (topics.length < MAX_TOPICS) {
          topics.push(line);
          topicIndex = topics.length - 1;
        } else {
          topicIndex = MAX_TOPICS - 1;
        }
        i++;
        continue;
      }
      let text = line.replace(BULLET_RE, "").trim();
      // Rejoin wrapped bullet continuation lines (lowercase start, no end mark).
      let j = i + 1;
      while (j < flat.length && text.length < 220 && !/[.!?]["')]?$/.test(text)) {
        const next = flat[j].text;
        if (
          BULLET_RE.test(next) ||
          BOILERPLATE_RE.test(next) ||
          detectHeading(next) !== null ||
          !/^[a-z(]/.test(next)
        ) {
          break;
        }
        text += " " + next;
        j++;
      }
      i = j;
      if (text.length >= 6) {
        candidates.push({ text, page, kind: "bullet", depth: 0, topicIndex, score: 0 });
      }
      continue;
    }

    const heading = detectHeading(line);
    if (heading !== null) {
      flush();
      if (topics.length < MAX_TOPICS) {
        topics.push(line);
        topicIndex = topics.length - 1;
      } else {
        topicIndex = MAX_TOPICS - 1; // overflow content lands in the last topic
      }
      i++;
      continue;
    }

    // Plain prose: accumulate until terminal punctuation or size cap.
    if (buf.length === 0) bufPage = page;
    buf.push(line);
    if (/[.!?]["')]?$/.test(line) || buf.join(" ").length > 320) flush();
    i++;
  }
  flush();

  return { candidates, topics };
}

/** Scores how much a candidate deserves a spot in the summary chart. */
function scoreCandidate(c: Candidate): number {
  if (c.kind === "heading") return 80 - (c.depth - 1) * 5;

  let s = c.kind === "bullet" ? 34 : 16;
  const signals = c.text.match(SIGNAL_RE)?.length ?? 0;
  s += Math.min(20, signals * 5);
  if (/\d/.test(c.text)) s += 8; // numbers, percentages, amounts carry facts
  if (DECISION_RE.test(c.text)) s += 6;
  const len = c.text.length;
  if (len >= 30 && len <= 160) s += 5;
  else if (len > 240) s -= 8;
  return s;
}

/** Near-duplicate detection on the first six words. */
function dedupKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .split(/\s+/)
    .slice(0, 6)
    .join(" ");
}

/** Condenses a sentence into a short, self-contained key point. */
function distill(s: string): string {
  let t = s.replace(/\s+/g, " ").trim();
  // Characters that would break a quoted Mermaid label.
  t = t.replace(/["`]/g, "'").replace(/[<>{}\[\]]/g, "");
  // "Note that…" phrases run on without punctuation — strip them first.
  t = t.replace(
    /^(?:it (?:is|should be) (?:important|worth) (?:to note|noted) that|note that)\s+/i,
    "",
  );
  t = t.replace(
    /^(however|moreover|furthermore|therefore|thus|additionally|in addition|in fact|as a result|for example|for instance|in conclusion|in summary|overall|finally|firstly|secondly|thirdly|next|then|also|besides|meanwhile|consequently|specifically|particularly)[,;:]\s+/i,
    "",
  );
  t = t.replace(/^(and|but|so|which|that|this|these|those)\s+/i, "");
  t = t.replace(/[.\s]+$/, "");
  if (t.length > 92) {
    const cut = t.slice(0, 92);
    let brk = Math.max(cut.lastIndexOf(","), cut.lastIndexOf(";"));
    const dash = cut.lastIndexOf(" - ");
    if (dash > brk) brk = dash;
    t = (brk > 40 ? cut.slice(0, brk) : cut.slice(0, cut.lastIndexOf(" "))).trim() + "…";
  }
  if (t) t = t[0].toUpperCase() + t.slice(1);
  return t.trim();
}

/** Keeps only characters that are safe inside a quoted Mermaid label. */
function sanitize(s: string): string {
  return s
    .replace(/["`<>{}]/g, "")
    .replace(/[\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Wraps a label into short lines (Mermaid `<br/>`) for readable node boxes. */
function wrapLabel(s: string, maxChars = 30, maxLines = 3): string {
  const words = s.split(/\s+/);
  const out: string[] = [];
  let current = "";
  for (const word of words) {
    if (current && (current + " " + word).length > maxChars) {
      out.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) out.push(current);
  if (out.length > maxLines) {
    const kept = out.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].replace(/\s?\S*$/, "…");
    return kept.join("<br/>");
  }
  return out.join("<br/>");
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

/**
 * Builds a key-point flowchart: root → topic nodes → distilled key points.
 * Falls back to a single explanatory node when nothing readable is found.
 */
export function buildKeyPointFlowchart(
  pages: PageLines[],
  title?: string,
): FlowchartResult {
  const { candidates, topics: rawTopics } = extractCandidates(pages);

  // Drop junk rows (tables, code, symbol soup) and near-duplicates.
  const seen = new Set<string>();
  const pool: Candidate[] = [];
  for (const c of candidates) {
    const alpha = (c.text.match(/[a-zA-Z]/g) ?? []).length;
    if (alpha < c.text.length * 0.5) continue;
    const key = dedupKey(c.text);
    if (seen.has(key)) continue;
    seen.add(key);
    pool.push({ ...c, score: scoreCandidate(c) });
  }

  const sentences = pool.filter((c) => c.kind !== "heading").length;

  if (pool.length === 0) {
    return {
      mermaid:
        'flowchart TD\n  A["No key points detected — the document may be empty or unreadable"]',
      keyPoints: [],
      topics: [],
      stats: { pages: pages.length, sentences: 0, keyPoints: 0, topics: 0 },
    };
  }

  // Topics in document order; each keeps only its best points.
  const byTopic = new Map<number, Candidate[]>();
  for (const c of pool) {
    const idx = c.kind === "heading" ? -1 : Math.max(0, c.topicIndex);
    if (c.kind === "heading") continue; // headings become topic nodes
    const list = byTopic.get(idx) ?? [];
    list.push(c);
    byTopic.set(idx, list);
  }

  // Cap per-topic, then cap globally by score.
  let shortlist: Candidate[] = [];
  for (const [, list] of byTopic) {
    list.sort((a, b) => b.score - a.score);
    shortlist.push(...list.slice(0, POINTS_PER_TOPIC));
  }
  shortlist.sort((a, b) => b.score - a.score);
  shortlist = shortlist.slice(0, MAX_POINTS);
  // Restore document order inside the final selection.
  const orderKey = (c: Candidate) => c.topicIndex * 10000 + (c.page * 1000);
  shortlist.sort((a, b) => orderKey(a) - orderKey(b));

  const topicTitles = rawTopics.map((t) => truncate(sanitize(t), 44));
  const hasTopics = topicTitles.length > 0;

  const rootLabel =
    truncate(sanitize(title ?? ""), 48) || topicTitles[0] || "Document key points";

  // Assemble Mermaid.
  const lines: string[] = ["flowchart TD"];
  lines.push(`  R(["${wrapLabel(rootLabel)}"])`);

  const pointNodes: { topicIdx: number; id: string; decision: boolean }[] = [];
  let k = 0;
  shortlist.forEach((c) => {
    const id = `K${k++}`;
    const label = wrapLabel(distill(c.text));
    const decision = DECISION_RE.test(c.text);
    lines.push(decision ? `  ${id}{"${label}"}` : `  ${id}["${label}"]`);
    pointNodes.push({ topicIdx: Math.max(0, c.topicIndex), id, decision });
  });

  if (hasTopics) {
    // Topic nodes only for topics that actually received points.
    const usedTopics = new Set(pointNodes.map((p) => p.topicIdx));
    for (const [idx, t] of topicTitles.entries()) {
      if (!usedTopics.has(idx)) continue;
      lines.push(`  T${idx}(["${wrapLabel(t)}"])`);
      lines.push(`  R --> T${idx}`);
    }
    for (const p of pointNodes) {
      lines.push(`  T${p.topicIdx} --> ${p.id}`);
    }
  } else {
    // No headings anywhere → key points hang directly off the root.
    for (const p of pointNodes) {
      lines.push(`  R --> ${p.id}`);
    }
  }

  // Styling hooks that match the app's indigo-on-black palette.
  lines.push(
    "  classDef root fill:#1d2a5c,stroke:#8b9cf9,stroke-width:2px,color:#f4f7ff;",
    "  classDef topic fill:#182451,stroke:#6366f1,stroke-width:2px,color:#e6ebf7;",
    "  classDef point fill:#121a33,stroke:#818cf8,stroke-width:1.5px,color:#dbe3f8;",
    "  classDef decision fill:#241b45,stroke:#a78bfa,stroke-width:1.5px,color:#efeaff;",
  );
  lines.push("  class R root");
  const topicIds = hasTopics
    ? topicTitles
        .map((_, idx) => `T${idx}`)
        .filter((id) => lines.some((l) => l.includes(`  ${id}([`)))
    : [];
  if (topicIds.length) lines.push(`  class ${topicIds.join(",")} topic`);
  const plainIds = pointNodes.filter((p) => !p.decision).map((p) => p.id);
  const decisionIds = pointNodes.filter((p) => p.decision).map((p) => p.id);
  if (plainIds.length) lines.push(`  class ${plainIds.join(",")} point`);
  if (decisionIds.length) lines.push(`  class ${decisionIds.join(",")} decision`);

  const maxPage = Math.max(1, ...shortlist.map((c) => c.page), pages.length);

  return {
    mermaid: lines.join("\n"),
    keyPoints: shortlist.map((c) => distill(c.text)),
    topics: hasTopics ? topicTitles : [],
    stats: {
      pages: maxPage,
      sentences,
      keyPoints: shortlist.length,
      topics: topicIds.length,
    },
  };
}
