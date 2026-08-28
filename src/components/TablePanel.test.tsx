// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TablePanel } from './TablePanel';
import { seatFromLocation, tableFromLocation } from '../share';

const relay = { url: 'ws://localhost:4390', room: 'KWXR7N' };
const entries = [
  { id: 'c0', name: 'Thistle' },
  { id: 'c1', name: 'Borin' },
];

describe('the table panel', () => {
  it('opens a table with a fresh room code from a relay URL', async () => {
    const user = userEvent.setup();
    const onRelayChange = vi.fn();
    render(
      <TablePanel relay={null} onRelayChange={onRelayChange} seats={[]} entries={entries} />,
    );
    await user.type(screen.getByLabelText('Relay URL'), 'wss://relay.example');
    await user.click(screen.getByRole('button', { name: 'Open the table' }));
    const opened = onRelayChange.mock.calls[0][0];
    expect(opened.url).toBe('wss://relay.example');
    expect(opened.room).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
  });

  it('§151: shows the room code with its QR at its side - one door, read two ways', () => {
    render(
      <TablePanel relay={relay} onRelayChange={vi.fn()} seats={[]} entries={entries} />,
    );
    expect(screen.getByLabelText('Room code')).toHaveTextContent('KWXR7N');
    const qr = screen.getByRole('img', { name: 'QR code to join the table' });
    expect(qr.closest('.room-join')).not.toBeNull();
  });

  it('§151: the QR carries the whole room, with no chair picked for anyone', () => {
    // The drawing is proven in QrSvg.test.tsx and the encoding in
    // qr.test.ts; here we scan it the way a phone would - go where it
    // points and see what the boot parsers make of it.
    render(
      <TablePanel relay={relay} onRelayChange={vi.fn()} seats={[]} entries={entries} />,
    );
    const link = screen
      .getByRole('img', { name: 'QR code to join the table' })
      .getAttribute('data-encodes')!;
    const hash = link.slice(link.indexOf('#'));
    expect(seatFromLocation(hash)).toBe('');
    expect(tableFromLocation(hash)).toEqual(relay);
  });

  it('hands out a named seat link per character', () => {
    render(
      <TablePanel relay={relay} onRelayChange={vi.fn()} seats={[]} entries={entries} />,
    );
    const field = screen.getByLabelText('Seat link for Borin') as HTMLInputElement;
    expect(seatFromLocation(field.value.slice(field.value.indexOf('#')))).toBe('c1');
  });
});
