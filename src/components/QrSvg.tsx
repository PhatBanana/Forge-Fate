import { useMemo } from 'react';
import { qrMatrix } from '../engine/qr';

/**
 * §101: a QR code as inline SVG. Always dark-on-white whatever the theme,
 * because a camera is not a theme's audience - and drawn with a four-module
 * quiet zone, which is the part of the standard everyone's first QR omits
 * and every scanner needs.
 */
export function QrSvg({ text, label }: { text: string; label: string }) {
  const path = useMemo(() => {
    /*
      §118: the encoder throws past version 10 (~213 bytes), and a seat
      link can honestly get there - a long self-hosted relay URL is all
      it takes. A throw here unmounts to the root boundary and takes the
      whole battle screen with it, which is a wild price for one QR. Say
      it instead; the link beside the button still copies.
    */
    try {
      const matrix = qrMatrix(text);
      const parts: string[] = [];
      for (let r = 0; r < matrix.length; r++)
        for (let c = 0; c < matrix.length; c++)
          if (matrix[r][c]) parts.push(`M${c + 4} ${r + 4}h1v1h-1z`);
      return { d: parts.join(''), size: matrix.length + 8 };
    } catch {
      return null;
    }
  }, [text]);
  if (!path) {
    return (
      <p className="hint" role="note">
        This link is too long to fit a QR code — copy it from the box instead.
      </p>
    );
  }
  return (
    <svg
      className="qr"
      viewBox={`0 0 ${path.size} ${path.size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      /* §151: what the modules say, in the open. The link is on screen in a
         copy box anyway (§95), so this hides nothing - and it lets a test
         "scan" the code the way a phone would, by going where it points. */
      data-encodes={text}
    >
      <rect width={path.size} height={path.size} fill="#fff" />
      <path d={path.d} fill="#000" />
    </svg>
  );
}
