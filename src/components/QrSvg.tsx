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
    const matrix = qrMatrix(text);
    const parts: string[] = [];
    for (let r = 0; r < matrix.length; r++)
      for (let c = 0; c < matrix.length; c++)
        if (matrix[r][c]) parts.push(`M${c + 4} ${r + 4}h1v1h-1z`);
    return { d: parts.join(''), size: matrix.length + 8 };
  }, [text]);
  return (
    <svg
      className="qr"
      viewBox={`0 0 ${path.size} ${path.size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect width={path.size} height={path.size} fill="#fff" />
      <path d={path.d} fill="#000" />
    </svg>
  );
}
