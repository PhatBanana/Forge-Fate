import { exportAll, read, write } from './persist';

/**
 * §161: the reminder a backup needs to be any use.
 *
 * §160 made a full backup possible, and a backup nobody downloads protects
 * nothing. So the app keeps three timestamps - when the last backup was
 * made, when it first saw work worth keeping, and when a reminder was last
 * shown - and at open, if there is work and no backup in a fortnight, it
 * says so with the button to do it right there.
 *
 * Deliberately gentle: two weeks before the first reminder (so a character
 * made on Tuesday is not met with a lecture on Wednesday), and showing one
 * snoozes the next for three days, so it can never become a toast every
 * visit. Only a backup resets the clock.
 */

export const LAST_BACKUP_KEY = 'dnd-forge:last-backup:v1';
/** When this device first held work worth keeping - the clock's start. */
export const BACKUP_CLOCK_KEY = 'dnd-forge:backup-clock:v1';
export const BACKUP_SNOOZE_KEY = 'dnd-forge:backup-snooze:v1';

const DAY = 24 * 60 * 60 * 1000;
/** How long work may go unbacked before the first reminder. */
export const BACKUP_DUE_AFTER = 14 * DAY;
/** How long one reminder quiets the next. */
export const BACKUP_SNOOZE = 3 * DAY;

export interface BackupClock {
  now: number;
  /** Whether there is anything worth keeping - a pristine roster is not. */
  hasWork: boolean;
  lastBackup: number | null;
  clockStart: number | null;
  snoozedUntil: number | null;
}

/** Whether to remind, as a pure rule over the three timestamps. */
export function shouldNudge(clock: BackupClock): boolean {
  if (!clock.hasWork) return false;
  if (clock.snoozedUntil !== null && clock.now < clock.snoozedUntil) return false;
  const since = Math.max(clock.lastBackup ?? 0, clock.clockStart ?? clock.now);
  return clock.now - since >= BACKUP_DUE_AFTER;
}

const stamp = (key: string): number | null => {
  const value = Number(read(key));
  return Number.isFinite(value) && value > 0 ? value : null;
};

/** When the last backup was made on this device, or null for never. */
export const lastBackupAt = (): number | null => stamp(LAST_BACKUP_KEY);

/**
 * The check the app makes at open. Starts the clock the first time there is
 * work, and snoozes as it says yes - so the caller only has to show it.
 */
export function backupDueNow(hasWork: boolean, now: number = Date.now()): boolean {
  let clockStart = stamp(BACKUP_CLOCK_KEY);
  if (hasWork && clockStart === null) {
    clockStart = now;
    write(BACKUP_CLOCK_KEY, String(now));
  }
  const due = shouldNudge({
    now,
    hasWork,
    lastBackup: lastBackupAt(),
    clockStart,
    snoozedUntil: stamp(BACKUP_SNOOZE_KEY),
  });
  if (due) write(BACKUP_SNOOZE_KEY, String(now + BACKUP_SNOOZE));
  return due;
}

/** "today", "3 days ago", or null for never - for the panel's line. */
export function backupAge(now: number = Date.now()): string | null {
  const last = lastBackupAt();
  if (last === null) return null;
  const days = Math.floor((now - last) / DAY);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}

/**
 * Download a full backup, stamping it first so the file records its own
 * moment. Shared by the panel's button and the reminder's.
 */
export async function downloadBackup(now: number = Date.now()): Promise<void> {
  write(LAST_BACKUP_KEY, String(now));
  const backup = await exportAll();
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `forge-fate-backup-${backup.savedAt.slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}
