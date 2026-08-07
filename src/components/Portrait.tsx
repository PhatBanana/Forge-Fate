import { useRef, useState } from 'react';
import type { CharacterDetails } from '../types';
import { PORTRAIT_MAX_BYTES, dataUrlBytes, preparePortrait } from '../engine/portrait';

/**
 * The face on the sheet.
 *
 * It sits in the banner where a paper sheet puts it, and it **prints** - a
 * portrait is part of the sheet rather than a control on it. What does not
 * print is the pair of buttons underneath, which are how you fill the box in.
 *
 * The empty state is a labelled box rather than nothing, because a paper sheet
 * has the box whether or not anyone has drawn in it.
 */
export function Portrait({
  details,
  onChange,
}: {
  details: CharacterDetails;
  onChange: (partial: Partial<CharacterDetails>) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const result = await preparePortrait(file);
    setBusy(false);
    if (result.ok) onChange({ portrait: result.dataUrl });
    else setError(result.error);
    // Cleared so choosing the same file twice fires a change both times.
    if (input.current) input.current.value = '';
  };

  const stored = details.portrait ? dataUrlBytes(details.portrait) : 0;

  return (
    <div className="cs-portrait">
      <div className="cs-portrait-frame">
        {details.portrait ? (
          // Decorative on the page: the name is right beside it, so a screen
          // reader announcing "portrait of" would only repeat what follows.
          <img src={details.portrait} alt="" />
        ) : (
          <span className="cs-portrait-empty">Portrait</span>
        )}
      </div>

      <div className="cs-screen cs-portrait-actions">
        <input
          ref={input}
          type="file"
          accept="image/*"
          aria-label="Choose a portrait"
          onChange={(e) => choose(e.target.files?.[0])}
        />
        <button type="button" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? 'Resizing…' : details.portrait ? 'Replace' : 'Add a portrait'}
        </button>
        {details.portrait && (
          <button type="button" onClick={() => onChange({ portrait: undefined })}>
            Remove
          </button>
        )}
      </div>

      {error && <p className="cs-portrait-note is-down cs-screen">{error}</p>}
      {!error && stored > 0 && (
        <p className="cs-portrait-note cs-screen">
          {/* Said out loud because the roster shares one storage budget, and
              "why did my characters stop saving" is a bad way to learn it. */}
          Stored at {Math.round(stored / 1024)} kB of a {Math.round(PORTRAIT_MAX_BYTES / 1024)} kB
          cap. Not carried in share links.
        </p>
      )}
    </div>
  );
}
