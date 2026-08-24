/**
 * What to say about this level's hit points, given what has happened so far.
 *
 * Written in the interface rather than in `levelUpSummary` because rolling
 * happens *in* the thing that is showing: a sentence fixed at level-up would
 * go on saying "the fixed average" after somebody had already rolled, which is
 * the kind of small lie that makes a reader stop believing the rest.
 *
 * §138: in a module of its own because two things show this report now - the
 * panel on the dense page and the flow's report step - and the second one
 * copying the sentence is exactly how the two would come to disagree about
 * what a d10 averages.
 */
export function hitPointDetail(
  rolling: boolean,
  rolled: number | null,
  hitDie: number,
  hpTotal: number,
): string {
  if (rolled !== null) {
    return `Rolled a ${rolled} on the d${hitDie}. You are on ${hpTotal} hit points.`;
  }
  if (rolling) {
    return `One die per level. This one is not rolled yet, so it counts as the average of a d${hitDie}.`;
  }
  return `The fixed average of a d${hitDie}, plus your Constitution modifier. Roll instead if your table does.`;
}
