import { SKILLS_BY_ID } from './data/skills';
import type { SkillId } from './data/skills';
import { deriveBuild } from './engine/character';
import type { BuildContext } from './engine/character';
import type { Roster } from './storage';

/**
 * §141: the DM asks the table a question.
 *
 * "Who has the highest Perception" is the commonest thing said at a table
 * that the app had no answer for. Six people leaf through six sheets, read
 * out six numbers, and the DM does the comparing.
 *
 * The call travels one way. The DM's screen names a skill; every seated
 * phone lights that row on its own sheet and says whether to raise a hand.
 * **Nothing comes back over the wire** - the answer is a hand going up in
 * the room, which is where the answer belongs. That is not a shortcut; it
 * is §92's authority rule read properly. The DM's screen calls, the seat
 * answers, and a seat that could send its roll back would be a seat
 * dictating a fact about the fight.
 *
 * It also means this needs no new data. The comparison wants the party's
 * modifiers, and a seat already holds them: §96's table roster is the
 * host's broadcast truth, and every character on it derives the same
 * skill line this one does.
 */

/** What the DM asked for, on the wire. Null is "nothing is being asked". */
export type CheckCall = { skillId: SkillId } | null;

/** One character's answer to a call. */
export interface Called {
  skillId: SkillId;
  /** "Perception", for the row and the mark. */
  name: string;
  /** What this character adds. */
  mine: number;
  /**
   * The best anyone else at the table adds, and who they are - null when
   * this is the only character on the roster, which is the solo case and
   * the same-browser case before anybody else has sat down.
   */
  best: { name: string; modifier: number } | null;
  /**
   * Whether to speak up. Ties raise: two characters on +5 should both put a
   * hand up, because the DM asked who is best and they equally are - and a
   * tie broken silently by roster order would be a lie told by a sort.
   */
  raise: boolean;
}

/** A character's modifier for one skill, from the lines every sheet draws. */
const modifierFor = (ctx: BuildContext, skillId: SkillId): number =>
  ctx.proficiencies.skills.find((line) => line.skill === skillId)?.modifier ?? 0;

/**
 * The answer this character gives to the call, compared against the party.
 *
 * `mine` is the character reading the sheet; `party` is everyone the table
 * knows about, which on a seat is the §96 table roster and on the same
 * browser is the device's own. Whoever `mine` is gets filtered out of the
 * comparison by roster id rather than by name, because two players may
 * both have called their fighter Bram.
 *
 * Returns null for no call, which is the state the sheet is in nearly all
 * the time and the one a caller should not have to special-case twice.
 */
export function called(
  call: CheckCall,
  mine: BuildContext,
  myRosterId: string | null,
  party: Roster | null,
): Called | null {
  if (!call) return null;
  const skill = SKILLS_BY_ID[call.skillId];
  if (!skill) return null;

  const mineModifier = modifierFor(mine, call.skillId);

  let best: { name: string; modifier: number } | null = null;
  for (const entry of party?.entries ?? []) {
    if (entry.id === myRosterId) continue;
    const modifier = modifierFor(deriveBuild(entry.build), call.skillId);
    if (!best || modifier > best.modifier) {
      best = { name: entry.build.name || 'Unnamed', modifier };
    }
  }

  return {
    skillId: call.skillId,
    name: skill.name,
    mine: mineModifier,
    best,
    raise: !best || mineModifier >= best.modifier,
  };
}

/**
 * The line the Skills heading carries: "+12 · RAISE YOUR HAND", or the name
 * of whoever has it instead.
 *
 * The verdict rather than the number, because the number is already on the
 * row two lines below and a heading that repeats it says nothing. What a
 * player needs in the second after the DM asks is whether this is their
 * moment, and the name of the person whose moment it is otherwise - so the
 * table stops waiting on six people to check.
 */
export function verdict(answer: Called): string {
  const mine = answer.mine >= 0 ? `+${answer.mine}` : `${answer.mine}`;
  if (answer.raise) return `${mine} · raise your hand`;
  return `${mine} · ${answer.best!.name} has this one`;
}
