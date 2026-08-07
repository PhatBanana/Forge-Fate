import { useEffect, useState } from 'react';
import { loadRulesText, rulesTextFor } from '../data/rulesText';
import type { RulesTextKind } from '../data/rulesText';

/**
 * The SRD's own words, under this app's verdict.
 *
 * The text arrives as markdown, and rather than take a markdown dependency for
 * three constructs this renders the three: bold, bold-italic, and the pipe
 * tables the SRD uses for things like a Bag of Tricks' creature list. Anything
 * else is a paragraph. A parser this small is only defensible because the input
 * is one known generator rather than arbitrary user text - if that ever stops
 * being true, take the dependency.
 */

/** `**bold**` and `***bold italic***`, which is all the SRD text uses inline. */
function emphasise(line: string, keyPrefix: string) {
  const pieces = line.split(/(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*)/g);
  return pieces.map((piece, i) => {
    const at = `${keyPrefix}-${i}`;
    if (piece.startsWith('***') && piece.endsWith('***')) {
      return (
        <strong key={at}>
          <em>{piece.slice(3, -3)}</em>
        </strong>
      );
    }
    if (piece.startsWith('**') && piece.endsWith('**')) {
      return <strong key={at}>{piece.slice(2, -2)}</strong>;
    }
    return piece;
  });
}

const cells = (row: string) =>
  row.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());

/** A run of `|`-delimited lines, with the `|---|` separator dropped. */
function Table({ rows, at }: { rows: string[]; at: string }) {
  const [header, ...body] = rows.filter((row) => !/^\|[\s|:-]+\|$/.test(row));
  return (
    <div className="rules-table">
      <table>
        <thead>
          <tr>
            {cells(header).map((cell, i) => (
              <th key={`${at}-h${i}`}>{emphasise(cell, `${at}-h${i}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, r) => (
            <tr key={`${at}-r${r}`}>
              {cells(row).map((cell, c) => (
                <td key={`${at}-r${r}c${c}`}>{emphasise(cell, `${at}-r${r}c${c}`)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Consecutive table lines become one table; everything else is a paragraph. */
export function RulesBody({ lines }: { lines: string[] }) {
  const blocks: { kind: 'p' | 'table'; lines: string[] }[] = [];
  for (const line of lines) {
    const kind = line.startsWith('|') ? 'table' : 'p';
    const last = blocks[blocks.length - 1];
    if (kind === 'table' && last?.kind === 'table') last.lines.push(line);
    else blocks.push({ kind, lines: [line] });
  }

  return (
    <div className="rules-text">
      {blocks.map((block, i) =>
        block.kind === 'table' ? (
          <Table key={i} rows={block.lines} at={`t${i}`} />
        ) : (
          <p key={i}>{emphasise(block.lines[0], `p${i}`)}</p>
        ),
      )}
    </div>
  );
}

/**
 * Loads the text chunk on mount, so mounting this must mean somebody opened
 * the disclosure - render it only when open, or the 544 kB is fetched for
 * every card on the page.
 */
export function RulesText({ kind, name }: { kind: RulesTextKind; name: string }) {
  const [state, setState] = useState<{ lines: string[] | null } | 'loading' | 'failed'>('loading');

  useEffect(() => {
    let live = true;
    loadRulesText()
      .then((bundle) => live && setState({ lines: rulesTextFor(bundle, kind, name) }))
      .catch(() => live && setState('failed'));
    return () => {
      live = false;
    };
  }, [kind, name]);

  if (state === 'loading') return <p className="muted rules-text">Loading…</p>;
  if (state === 'failed') {
    return <p className="muted rules-text">The rules text could not be loaded.</p>;
  }
  if (!state.lines) {
    /*
      Deliberately does not say *why*.

      For spells the reason is the licence - the source carries all 319 SRD
      spells, so an absence is genuinely a non-SRD spell. For magic items it is
      not that simple: both SRD APIs are missing entries the SRD itself has, so
      "not in the SRD" would be a false statement about some of them. The
      distinction is recorded in the data audit, where a maintainer will see it;
      the page says only what it can stand behind.
    */
    return (
      <p className="muted rules-text">
        No full description is carried for {name}. The summary above is what this app has — it
        reproduces the SRD, and anything outside it is written rather than quoted.
      </p>
    );
  }
  return <RulesBody lines={state.lines} />;
}

/**
 * The disclosure the text lives behind.
 *
 * `<details>` keeps its children mounted in React whether or not it is open, so
 * the body is rendered only once `open` is true. Without that every card on a
 * page would fetch the text chunk on first paint, which is the whole cost this
 * was designed to avoid.
 */
export function RulesDisclosure({ kind, name }: { kind: RulesTextKind; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="rules-disclosure"
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary>Full description</summary>
      {open && <RulesText kind={kind} name={name} />}
    </details>
  );
}
