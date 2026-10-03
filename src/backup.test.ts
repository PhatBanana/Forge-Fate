import { beforeEach, describe, expect, it } from 'vitest';
import {
  BACKUP_CLOCK_KEY,
  BACKUP_DUE_AFTER,
  BACKUP_SNOOZE,
  LAST_BACKUP_KEY,
  backupAge,
  backupDueNow,
  shouldNudge,
} from './backup';
import { hydrate, memoryAdapter, read, resetForTests, write } from './persist';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 9, 1);

beforeEach(async () => {
  resetForTests();
  await hydrate(memoryAdapter());
});

describe('§161: when to remind about a backup', () => {
  const clock = (over: Partial<Parameters<typeof shouldNudge>[0]> = {}) => ({
    now: T0,
    hasWork: true,
    lastBackup: null,
    clockStart: T0 - BACKUP_DUE_AFTER,
    snoozedUntil: null,
    ...over,
  });

  it('reminds after two weeks of work with no backup', () => {
    expect(shouldNudge(clock())).toBe(true);
    expect(shouldNudge(clock({ clockStart: T0 - BACKUP_DUE_AFTER + DAY }))).toBe(false);
  });

  it('never reminds about nothing - a pristine roster is not work', () => {
    expect(shouldNudge(clock({ hasWork: false }))).toBe(false);
  });

  it('counts from the last backup once there is one', () => {
    expect(shouldNudge(clock({ lastBackup: T0 - 3 * DAY }))).toBe(false);
    expect(shouldNudge(clock({ lastBackup: T0 - BACKUP_DUE_AFTER }))).toBe(true);
  });

  it('stays quiet while snoozed', () => {
    expect(shouldNudge(clock({ snoozedUntil: T0 + DAY }))).toBe(false);
    expect(shouldNudge(clock({ snoozedUntil: T0 - 1 }))).toBe(true);
  });
});

describe('§161: the check at open', () => {
  it('starts the clock the first time there is work, and does not remind that day', () => {
    expect(backupDueNow(true, T0)).toBe(false);
    expect(read(BACKUP_CLOCK_KEY)).toBe(String(T0));
  });

  it('reminds once the fortnight is up, then snoozes itself', () => {
    backupDueNow(true, T0);
    const due = T0 + BACKUP_DUE_AFTER;
    expect(backupDueNow(true, due)).toBe(true);
    // Opened again the same evening, and the next day: quiet.
    expect(backupDueNow(true, due + 1000)).toBe(false);
    expect(backupDueNow(true, due + DAY)).toBe(false);
    // Three days on, still no backup: it says so again.
    expect(backupDueNow(true, due + BACKUP_SNOOZE)).toBe(true);
  });

  it('is reset by a backup, not by the reminder', () => {
    backupDueNow(true, T0);
    write(LAST_BACKUP_KEY, String(T0 + BACKUP_DUE_AFTER));
    expect(backupDueNow(true, T0 + BACKUP_DUE_AFTER + DAY)).toBe(false);
  });
});

describe('§161: the panel’s line', () => {
  it('says never, today, yesterday, or how many days', () => {
    expect(backupAge(T0)).toBeNull();
    write(LAST_BACKUP_KEY, String(T0));
    expect(backupAge(T0 + 1000)).toBe('today');
    expect(backupAge(T0 + DAY)).toBe('yesterday');
    expect(backupAge(T0 + 9 * DAY)).toBe('9 days ago');
  });
});
