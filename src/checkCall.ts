import { SKILLS_BY_ID } from './data/skills';
import type { SkillId } from './data/skills';
import { deriveBuild, saveBonusOf } from './engine/character';
import type { BuildContext } from './engine/character';
import type { Roster } from './storage';
import { ABILITY_NAMES } from './types';
import type { Ability } from './types';

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

/**
 * What the DM asked for. Null is "nothing is being asked".
 *
 * §143 added the save. Checks and saves are the same two dice at a table -
 * a d20 and a modifier against a number - and they are different questions:
 * a check asks *who to ask*, and nothing has been rolled yet; a save is an
 * event everybody answers, and the answers change the fight. So they share
 * the call and part company at the answer.
 */
export type Call =
  /** "Who has the highest Perception." Nobody rolls; the best hand goes up. */
  | { ask: 'skill'; skillId: SkillId }
  /**
   * "Everyone make a Dexterity save." Everybody rolls, on their own phone,
   * and the totals come back - which is the half a check deliberately has
   * not got, because a check resolves nothing and a save resolves damage.
   */
  | { ask: 'save'; ability: Ability; dc?: number };

export type CheckCall = Call | null;

/** One character's answer to a call. */
export interface Called {
  ask: 'skill' | 'save';
  /** The skill asked for, when one was. */
  skillId?: SkillId;
  /** The save asked for, when one was, and the number to beat if given. */
  ability?: Ability;
  dc?: number;
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
   *
   * Only a skill has this. A save is not a competition - everybody rolls,
   * and the best modifier in the party is nobody's business.
   */
  raise: boolean;
}

/** What this character adds to whatever was asked for. */
const modifierFor = (ctx: BuildContext, call: Call): number =>
  call.ask === 'skill'
    ? (ctx.proficiencies.skills.find((line) => line.skill === call.skillId)?.modifier ?? 0)
    : saveBonusOf(ctx, call.ability);

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
  const name =
    call.ask === 'skill' ? SKILLS_BY_ID[call.skillId]?.name : ABILITY_NAMES[call.ability];
  if (!name) return null;

  const mineModifier = modifierFor(mine, call);

  /*
    A save is not a competition. Everybody rolls one, so the best modifier
    in the party is nobody's business and comparing would tell a player the
    wrong thing entirely - "Bram has this one" when the fireball is landing
    on them too.
  */
  let best: { name: string; modifier: number } | null = null;
  if (call.ask === 'skill') {
    for (const entry of party?.entries ?? []) {
      if (entry.id === myRosterId) continue;
      const modifier = modifierFor(deriveBuild(entry.build), call);
      if (!best || modifier > best.modifier) {
        best = { name: entry.build.name || 'Unnamed', modifier };
      }
    }
  }

  return {
    ask: call.ask,
    ...(call.ask === 'skill' ? { skillId: call.skillId } : { ability: call.ability, dc: call.dc }),
    name,
    mine: mineModifier,
    best,
    raise: call.ask === 'skill' && (!best || mineModifier >= best.modifier),
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
  // A save asks everybody, so there is nothing to compare and nothing to
  // decide - the line says what you add and what you are beating.
  if (answer.ask === 'save') {
    return answer.dc ? `${mine} · beat ${answer.dc}` : `${mine} · roll it`;
  }
  if (answer.raise) return `${mine} · raise your hand`;
  return `${mine} · ${answer.best!.name} has this one`;
}
