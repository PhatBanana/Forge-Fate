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
/**
 * What Tab can land on. Deliberately the short list rather than the
 * exhaustive one: this dialog is a heading, a button and a list of key
 * bindings, and a selector that also hunts for `[contenteditable]` and
 * `<audio controls>` would be answering a question nobody here asks.
 */
const FOCUSABLE = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

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
              return;
            }
            /*
              §85: the trap `aria-modal="true"` has been promising since §79.
              A modal that lets Tab wander out onto the board behind it leaves
              a keyboard user reading a page they cannot see, with no way back
              but Escape - and they have no reason to know Escape is the way.

              This dialog has exactly one focusable (Close), so `first` and
              `last` are the same element and both branches simply hold focus
              where it is. That is the correct behaviour and it is why the
              general form is written out rather than special-cased: a second
              button added here later works without anybody remembering to
              come back.

              `PopOut` deliberately does **not** do this; its header says why.
            */
            if (e.key !== 'Tab') return;
            const focusable = [...e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)];
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const here = document.activeElement;
            if (e.shiftKey ? here === first : here === last) {
              e.preventDefault();
              (e.shiftKey ? last : first).focus();
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
