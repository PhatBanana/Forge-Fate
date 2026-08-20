// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QrSvg } from './QrSvg';

/**
 * §101. The encoding is proven by qr.test.ts's independent decoder; this
 * checks the drawing: an image with a name, white under the dark modules
 * whatever the theme, and the quiet zone counted into the frame.
 */
describe('the QR drawing', () => {
  it('draws dark-on-white with the quiet zone in frame', () => {
    render(<QrSvg text="wss://relay.example/#room=KWXR7N" label="the invitation" />);
    const svg = screen.getByRole('img', { name: 'the invitation' });
    const size = Number(svg.getAttribute('viewBox')!.split(' ')[3]);
    // 4v+17 modules plus four quiet modules each side: 4v+25.
    expect((size - 25) % 4).toBe(0);
    expect(svg.querySelector('rect')?.getAttribute('fill')).toBe('#fff');
    expect(svg.querySelector('path')?.getAttribute('fill')).toBe('#000');
  });
});
