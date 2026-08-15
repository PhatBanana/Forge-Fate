import { useEffect, useRef } from 'react';

/**
 * §79: the keys, findable.
 *
 * Every shortcut the battle screen answers to was documented in exactly one
 * place - a floating legend marked aria-hidden with pointer-events: none,
 * invisible to assistive tech and untouchable by a finger. The one group of
 * users guaranteed to need the keyboard was the one group guaranteed not to
 * find it. This is a visible "Keys" button and the `?` key, opening a real
 * dialog: labelled, focus moved in on open and handed back on close, Esc to
 * dismiss without waking the map's own Escape chain.
 *
 * The list arrives as data because the battle and any future screen have
 * different keys, and a help surface that hardcodes one screen's bindings
 * quietly rots when the bindings move.
 */
export function ShortcutsHelp({
  shortcuts,
  open,
  onOpen,
  onClose,
}: {
  shortcuts: { keys: string; does: string }[];
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const opener = useRef<HTMLButtonElement>(null);
  const closer = useRef<HTMLButtonElement>(null);
  /* Focus follows the dialog - in on open, back on close - but only for
     real transitions, or mounting would steal focus from whatever the user
     was doing. */
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) closer.current?.focus();
    if (!open && wasOpen.current) opener.current?.focus();
    wasOpen.current = open;
  }, [open]);

  return (
    <>
      <button
        ref={opener}
        type="button"
        title="Every keyboard shortcut this screen answers to (?)"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? onClose() : onOpen())}
      >
        Keys
      </button>
      {open && (
        <div
          className="keys-help"
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard shortcuts"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              // Ours alone: without this, the map's Escape chain would also
              // fire and put down whatever the DM had armed.
              e.stopPropagation();
              onClose();
            }
          }}
        >
          <div className="keys-help-head">
            <h2>The keys</h2>
            <button ref={closer} type="button" className="btn btn-sm" onClick={onClose}>
              Close
            </button>
          </div>
          <dl>
            {shortcuts.map((s) => (
              <div key={s.keys}>
                <dt>{s.keys}</dt>
                <dd>{s.does}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </>
  );
}
