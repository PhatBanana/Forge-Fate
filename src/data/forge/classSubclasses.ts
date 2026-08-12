import type { ClassId, Subclass } from '../../types';
import type { ClassFeature } from '../classFeatures';
import { groupForgeRows } from './rows';
import type { ForgeSubclassRow } from './rows';

/**
 * Subclasses for the app's own four classes.
 *
 * Nine each under 2014 and five under 2024, which are §56's floors exactly.
 * A new class shipping with four options while the Cleric has fifteen would
 * recreate, one file later, the imbalance §56 measured and fixed - and it
 * would do it to the classes least able to afford it, since a class nobody
 * has heard of has to earn its place on the table twice over.
 *
 * The subclass level is 3 for all four, matching 2024's rule and every 2014
 * martial. There is no reason for a new class to inherit the Cleric's 1st and
 * the Wizard's 2nd, which are historical rather than considered.
 *
 * Each class's nine vary along one axis, so the list reads as a decision
 * rather than as nine unrelated ideas:
 *
 * - **Reckoner** — what you bargained *with*.
 * - **Harrier** — how you hunt.
 * - **Marshal** — how you make war.
 * - **Adept** — the shape your mind takes.
 */

const f = (level: number, name: string, summary: string): ClassFeature => ({ level, name, summary });
const BOTH: ('2014' | '2024')[] = ['2014', '2024'];

const ROWS: ForgeSubclassRow[] = [
  // ================================================================ reckoner
  // What you bargained with. Five in both rulesets, four in 2014 only.
  {
    classId: 'reckoner',
    subclass: {
      id: 'ledger-of-blood', name: 'Ledger of Blood', rulesets: BOTH, source: 'Forge', level: 3,
      note: 'You pay in your own. The most aggressive ledger: hit points buy Reckonings back mid-fight, so a Reckoner who is losing has more to spend than one who is winning.',
      tags: [],
    },
    features: [
      f(3, 'Blood Price', 'As a bonus action, take damage equal to your Reckoner level to regain one Reckoning. This damage cannot be reduced or prevented.'),
      f(3, 'Red Ink', 'Your Reckoning die deals necrotic damage instead of its usual type, and a creature it damages cannot regain hit points until the end of your next turn.'),
      f(6, 'Running a Debt', 'While you are below half your hit points, your Reckoning die gains one die.'),
      f(10, 'Blood Answers', 'When a creature you called a reckoning on hits you, it takes necrotic damage equal to your Charisma modifier.'),
      f(14, 'Paid in Full', 'When you drop a creature you called a reckoning on, you regain hit points equal to twice your Reckoner level.'),
    ],
  },
  {
    classId: 'reckoner',
    subclass: {
      id: 'ledger-of-names', name: 'Ledger of Names', rulesets: BOTH, source: 'Forge', level: 3,
      note: 'You bargained with what things are called. A social and investigative ledger that turns into hard control - knowing a creature\'s true name is a lever, and this one pulls it.',
      tags: ['controller', 'support'],
    },
    features: [
      f(3, 'True Name', 'Study a creature for one minute to learn its true name. While you know it, you have advantage on Charisma checks against it and on saves against its effects.'),
      f(3, 'Speak It', 'Spend a Reckoning as an action: a creature whose true name you know makes a Wisdom save against your spell save DC or is incapacitated until the end of its next turn.'),
      f(6, 'The List', 'You may know true names equal to your Charisma modifier at once, and you always know when one of them is within 300 feet.'),
      f(10, 'Unmade', 'A creature whose true name you know cannot become invisible to you, shapechange in your presence, or lie to you outright.'),
      f(14, 'Struck Out', 'Spend two Reckonings to erase a name for one minute: the creature loses one feature or trait of your choice that you have seen it use.'),
    ],
  },
  {
    classId: 'reckoner',
    subclass: {
      id: 'ledger-of-hours', name: 'Ledger of Hours', rulesets: BOTH, source: 'Forge', level: 3,
      note: 'You bargained with your own remaining time. Action economy is the currency here: extra turns, stolen reactions, and a very expensive way to undo a round.',
      tags: [],
    },
    features: [
      f(3, 'Borrowed Second', 'Spend a Reckoning as a reaction to take the Dash, Disengage or Hide action out of turn.'),
      f(3, 'Overdue', 'A creature you called a reckoning on has its speed reduced by 10 feet.'),
      f(6, 'Two Ticks', 'Once per fight, spend a Reckoning to take an extra action on your turn.'),
      f(10, 'Held Back', 'When a creature you called a reckoning on would take a reaction, spend a Reckoning as a reaction to refuse it.'),
      f(14, 'Rewound', 'Once per long rest, spend all your Reckonings to undo the last turn taken by any creature: it returns to where it was and its resources are unspent. It may not repeat that exact action.'),
    ],
  },
  {
    classId: 'reckoner',
    subclass: {
      id: 'ledger-of-oaths', name: 'Ledger of Oaths', rulesets: BOTH, source: 'Forge', level: 3,
      note: 'You bargained with promises. The support ledger: your reckonings can be sworn *for* an ally instead of against an enemy, which is the only way this class heals anybody.',
      tags: ['support'],
    },
    features: [
      f(3, 'Sworn To', 'Spend a Reckoning to swear an oath to an ally you can see. Until the fight ends they add your Charisma modifier to one attack roll, save or check each turn.'),
      f(3, 'Held Word', 'An ally you have sworn to may use your Reckoning die once per turn on their own attack.'),
      f(6, 'Two Promises', 'You may hold oaths to two allies at once.'),
      f(10, 'Broken On You', 'When an ally you have sworn to would drop to 0 hit points, you may take the damage instead.'),
      f(14, 'The Whole Company', 'Spend all your Reckonings as an action: every ally within 30 feet is sworn to until the fight ends.'),
    ],
  },
  {
    classId: 'reckoner',
    subclass: {
      id: 'ledger-of-doors', name: 'Ledger of Doors', rulesets: BOTH, source: 'Forge', level: 3,
      note: 'You bargained with thresholds and what waits behind them. Mobility and escape, with a late ability to put an enemy somewhere else entirely.',
      tags: ['stealth'],
    },
    features: [
      f(3, 'Step Through', 'Spend a Reckoning as a bonus action to teleport up to 30 feet to a space you can see.'),
      f(3, 'The Far Side', 'You have advantage on checks to open, force or find a door, and you always know whether a door you can see is trapped.'),
      f(6, 'Bring Them With', 'Step Through may carry one willing creature within 5 feet.'),
      f(10, 'Two Rooms At Once', 'When you teleport, you may leave a doorway behind for one minute: any creature may step through it in either direction as an action.'),
      f(14, 'Put Out', 'Spend two Reckonings as an action: a creature you called a reckoning on makes a Charisma save against your spell save DC or is banished to a harmless demiplane until the end of your next turn.'),
    ],
  },
  {
    classId: 'reckoner',
    subclass: {
      id: 'ledger-of-ash', name: 'Ledger of Ash', rulesets: ['2014'], source: 'Forge', level: 3,
      note: 'You bargained with something that burns. The straightforward damage ledger, and the only Reckoner that reliably hits more than one enemy at a time.',
      tags: ['blaster'],
    },
    features: [
      f(3, 'Kindling', 'Your Reckoning die deals fire damage, and a creature it damages takes your Charisma modifier in fire at the start of its next turn.'),
      f(3, 'Cinder Step', 'You have resistance to fire damage.'),
      f(6, 'Catch', 'When you call a reckoning, you may spend a second Reckoning to call it on every creature within 10 feet of the first.'),
      f(10, 'Ash Cloud', 'Spend a Reckoning as an action to fill a 20-foot cube with ash: heavily obscured, and creatures that start their turn in it take your Reckoning die in fire.'),
      f(14, 'Burn the Ledger', 'Once per long rest, spend all your Reckonings: each deals your full Reckoning die in fire to every creature you have called a reckoning on this fight, no save.'),
    ],
  },
  {
    classId: 'reckoner',
    subclass: {
      id: 'ledger-of-silence', name: 'Ledger of Silence', rulesets: ['2014'], source: 'Forge', level: 3,
      note: 'You bargained with what is not said. Anti-caster and infiltration: the only class feature in the app that shuts down a spell without spending a spell.',
      tags: ['stealth', 'controller'],
    },
    features: [
      f(3, 'Unheard', 'You make no sound you do not choose to. Advantage on Stealth checks, and creatures cannot hear you cast.'),
      f(3, 'Held Tongue', 'Spend a Reckoning as a reaction when a creature within 60 feet casts a spell with a verbal component: it makes a Constitution save against your spell save DC or the spell fails and the slot is spent.'),
      f(6, 'Quiet Ground', 'A 15-foot radius around you is magically silent to anyone but you and creatures you choose.'),
      f(10, 'Nothing To Say', 'A creature you called a reckoning on has disadvantage on Charisma checks and cannot communicate telepathically.'),
      f(14, 'The Last Word', 'Once per fight, Held Tongue costs no save and no Reckoning.'),
    ],
  },
  {
    classId: 'reckoner',
    subclass: {
      id: 'ledger-of-mirrors', name: 'Ledger of Mirrors', rulesets: ['2014'], source: 'Forge', level: 3,
      note: 'You bargained with your own reflection, and it kept some of you. Duplicates that draw fire and take turns - the tankiest way to play a d8 chassis.',
      tags: ['tank'],
    },
    features: [
      f(3, 'Reflection', 'Spend a Reckoning as a bonus action to place a duplicate of yourself in a space within 30 feet. It has 1 hit point, your AC, and lasts one minute or until hit.'),
      f(3, 'Which One', 'While a reflection is within 30 feet, attacks against you have disadvantage unless the attacker can see through illusions.'),
      f(6, 'Two Faces', 'You may have two reflections at once, and you may swap places with one as a bonus action.'),
      f(10, 'It Bites Back', 'When a reflection is destroyed, the creature that destroyed it takes your Reckoning die in psychic damage.'),
      f(14, 'A Room of Them', 'Spend three Reckonings as an action to place four reflections at once, each of which may make one weapon attack on your turn using your Reckoning die.'),
    ],
  },
  {
    classId: 'reckoner',
    subclass: {
      id: 'ledger-of-iron', name: 'Ledger of Iron', rulesets: ['2014'], source: 'Forge', level: 3,
      note: 'You bargained with something that wanted a soldier. The only Reckoner that fights in armour and swings twice - a genuine gish rather than a caster with a rapier.',
      tags: ['gish', 'medium-armor', 'martial-weapons'],
      armorProficiency: ['medium', 'shield'],
      weaponProficiency: { categories: ['martial'] },
      features: [{ level: 6, name: 'Extra Attack', summary: 'Attack twice with the Attack action.', tags: ['extra-attack'] }],
    },
    features: [
      f(3, 'Conscripted', 'You gain proficiency with medium armour, shields and martial weapons.'),
      f(3, 'Bound Arm', 'A weapon you bond with over a short rest counts as magical, and you may attack with it using Charisma.'),
      f(10, 'Standing Order', 'While you have at least one Reckoning left, you have resistance to bludgeoning, piercing and slashing damage from the creature you called a reckoning on.'),
      f(14, 'Requisition', 'When you drop a creature you called a reckoning on, your bonded weapon deals an extra die of damage until the end of the fight.'),
    ],
  },

  // ================================================================= harrier
  // How you hunt.
  {
    classId: 'harrier',
    subclass: {
      id: 'discipline-of-the-net', name: 'Discipline of the Net', rulesets: BOTH, source: 'Forge', level: 3,
      note: 'You take them alive, or at least off their feet. The control Harrier: restraint and forced movement stacked on the quarry mark, without a single spell slot spent.',
      tags: ['controller'],
    },
    features: [
      f(3, 'Snare Shot', 'When you hit your quarry, it makes a Strength save against your spell save DC or its speed is 0 until the end of its next turn.'),
      f(3, 'Reel', 'On a hit against your quarry, you may pull it 10 feet toward you.'),
      f(7, 'Tangled', 'Your quarry treats every square within 15 feet of you as difficult terrain.'),
      f(11, 'Pinned', 'A quarry whose speed you have reduced to 0 has disadvantage on attack rolls against anyone but you.'),
      f(15, 'Nothing Gets Out', 'Your quarry cannot teleport or leave its plane while it can see you.'),
    ],
  },
  {
    classId: 'harrier',
    subclass: {
      id: 'discipline-of-the-long-shot', name: 'Discipline of the Long Shot', rulesets: BOTH, source: 'Forge', level: 3,
      note: 'Range, and the patience to use it. The archer Harrier - fewer tricks, more distance, and an opening shot that decides fights.',
      tags: [],
    },
    features: [
      f(3, 'Range', 'The long range of your ranged weapons doubles, and you ignore the disadvantage for shooting at long range.'),
      f(3, 'First Shot', 'On the first turn of a fight, your Quarry die is doubled against a quarry that has not acted.'),
      f(7, 'Steady', 'If you do not move on your turn, your attacks against your quarry ignore half and three-quarters cover and score a critical hit on 19-20.'),
      f(11, 'Through and Through', 'When you drop your quarry with a ranged attack, make one more ranged attack against a creature within 10 feet of it.'),
      f(15, 'One Breath', 'Once per fight, take the Attack action and make every attack against your quarry with advantage.'),
    ],
  },
  {
    classId: 'harrier',
    subclass: {
      id: 'discipline-of-the-pack', name: 'Discipline of the Pack', rulesets: BOTH, source: 'Forge', level: 3,
      note: 'You do not hunt alone. A companion built to be an *asset rather than a liability*: it scales with your proficiency bonus, acts on your turn, and cannot be killed permanently by a stray fireball.',
      tags: ['summoner', 'support'],
    },
    features: [
      f(3, 'The Pack', 'A beast companion of Medium size or smaller. Its AC, attack bonus and saves use your proficiency bonus, its hit points are four times your Harrier level, and it acts on your turn - it takes the Dodge action unless you spend a bonus action to command it.'),
      f(3, 'Same Target', 'Your companion adds your Quarry die to its first hit each turn against your quarry.'),
      f(7, 'Back On Its Feet', 'If your companion drops to 0 hit points, it returns at half hit points after a short rest rather than dying.'),
      f(11, 'Flank', 'While you and your companion are both within 5 feet of your quarry, you both have advantage against it.'),
      f(15, 'Two Throats', 'Your companion makes two attacks when you command it to attack.'),
    ],
  },
  {
    classId: 'harrier',
    subclass: {
      id: 'discipline-of-the-quiet-mile', name: 'Discipline of the Quiet Mile', rulesets: BOTH, source: 'Forge', level: 3,
      note: 'Getting there unseen. Scouting and ambush, and the exploration package the Ranger was always promised and never given in usable form.',
      tags: ['stealth'],
    },
    features: [
      f(3, 'Unseen Approach', 'You and up to five companions leave no tracks and cannot be tracked by nonmagical means, and travel at a normal pace while stealthing.'),
      f(3, 'From Nowhere', 'You have advantage on attack rolls against any creature that has not yet taken a turn in the fight.'),
      f(7, 'Vanish', 'Hide as a bonus action, and lightly obscured terrain is enough to hide in.'),
      f(11, 'Nobody Saw', 'When you hit an unaware creature, it does not learn your position on a miss, and your first hit against it each fight is a critical.'),
      f(15, 'Ghost', 'While you have full hit points, you are invisible to any creature more than 30 feet away that has not seen you this turn.'),
    ],
  },
  {
    classId: 'harrier',
    subclass: {
      id: 'discipline-of-the-warden', name: 'Discipline of the Warden', rulesets: BOTH, source: 'Forge', level: 3,
      note: 'You hunt what hunts other people. The defensive Harrier - it stands between the quarry and the party, which is a job no published Ranger is built for.',
      tags: ['tank'],
    },
    features: [
      f(3, 'Interpose', 'When your quarry attacks an ally within 5 feet of you, use your reaction to impose disadvantage on the roll.'),
      f(3, 'Warded Ground', 'Allies within 10 feet of you have half cover against your quarry.'),
      f(7, 'Turn It Back', 'When you use Interpose and the attack misses, make one weapon attack against your quarry.'),
      f(11, 'Between', 'Your quarry has disadvantage on attacks against anyone but you while you are within 10 feet of its target.'),
      f(15, 'Not While I Stand', 'Once per fight, when an ally within 30 feet would drop to 0 hit points from your quarry\'s attack, they drop to 1 instead.'),
    ],
  },
  {
    classId: 'harrier',
    subclass: {
      id: 'discipline-of-the-cold-trail', name: 'Discipline of the Cold Trail', rulesets: ['2014'], source: 'Forge', level: 3,
      note: 'Tracking as a discipline rather than a skill check. Built for campaigns where the fight is finding them, and it does not fall off in the fight itself.',
      tags: [],
    },
    features: [
      f(3, 'Cold Trail', 'You can follow a trail up to a month old, through water, and across planar boundaries.'),
      f(3, 'Known Quantity', 'After one minute studying a creature or its traces, you learn its damage resistances, immunities and one feature it can use.'),
      f(7, 'Anticipate', 'You add your Wisdom modifier to saving throws against your quarry\'s abilities.'),
      f(11, 'Wear Them Down', 'Your quarry does not regain hit points from any source while it can see you.'),
      f(15, 'The End Of It', 'Your Quarry die is doubled against a quarry that is below half its hit points.'),
    ],
  },
  {
    classId: 'harrier',
    subclass: {
      id: 'discipline-of-the-poisoner', name: 'Discipline of the Poisoner', rulesets: ['2014'], source: 'Forge', level: 3,
      note: 'Attrition. Damage that keeps working after your turn ends, which is the one thing weapon users almost never get.',
      tags: [],
    },
    features: [
      f(3, 'Coat the Blade', 'On a hit against your quarry, it takes your Quarry die in poison damage at the start of each of its turns until it succeeds on a Constitution save against your spell save DC.'),
      f(3, 'Immune', 'You are immune to poison damage and the poisoned condition.'),
      f(7, 'Deepening', 'A creature suffering your poison has disadvantage on the save to end it while it is below half hit points.'),
      f(11, 'Two Doses', 'Your poison may run on two creatures at once.'),
      f(15, 'Nothing Survives It', 'A creature that fails three saves against your poison is poisoned for one hour and gains no benefit from a short rest.'),
    ],
  },
  {
    classId: 'harrier',
    subclass: {
      id: 'discipline-of-the-storm-runner', name: 'Discipline of the Storm Runner', rulesets: ['2014'], source: 'Forge', level: 3,
      note: 'Speed as a weapon. The mobile Harrier: it crosses the board, hits, and is somewhere else - the answer to backline enemies that no Ranger currently has.',
      tags: [],
    },
    features: [
      f(3, 'Storm Runner', 'Your speed increases by 10 feet, and you may Dash as a bonus action a number of times per fight equal to your proficiency bonus.'),
      f(3, 'Passing Strike', 'When you move at least 20 feet toward your quarry before hitting it, add one die to your Quarry die.'),
      f(7, 'Off the Walls', 'You have a climbing speed equal to your walking speed and may move across water and vertical surfaces on your turn.'),
      f(11, 'No Grip', 'Opportunity attacks against you have disadvantage, and you cannot be grappled or restrained while you have movement remaining.'),
      f(15, 'Everywhere', 'On each of your turns you may attack your quarry once from each of two different spaces, moving between them without provoking.'),
    ],
  },
  {
    classId: 'harrier',
    subclass: {
      id: 'discipline-of-the-siege', name: 'Discipline of the Siege', rulesets: ['2014'], source: 'Forge', level: 3,
      note: 'For hunting things much larger than you. Explicitly built against single big monsters, which is the encounter shape most parties see at high level and least of the Ranger list addresses.',
      tags: [],
    },
    features: [
      f(3, 'Bring It Down', 'Your Quarry die gains one die against a quarry of Large size or bigger.'),
      f(3, 'Hamstring', 'On a hit against a Large or bigger quarry, its speed is halved until the end of its next turn.'),
      f(7, 'Climb It', 'You may move onto a Large or bigger creature\'s space and stay there; while you do, you have advantage on attacks against it and it has disadvantage against you.'),
      f(11, 'Find the Seam', 'Your attacks against your quarry ignore its resistance to bludgeoning, piercing and slashing damage.'),
      f(15, 'Fell the Giant', 'Once per fight, when you hit a quarry of Large size or bigger, it makes a Strength save against your spell save DC or is knocked prone and takes your Quarry die again.'),
    ],
  },

  // ================================================================= marshal
  // How you make war.
  {
    classId: 'marshal',
    subclass: {
      id: 'doctrine-of-the-vanguard', name: 'Doctrine of the Vanguard', rulesets: BOTH, source: 'Forge', level: 3,
      note: 'Forward, together. Commands that move the whole line, and the only reliable way in the app to get a party out of a bad position all at once.',
      tags: ['support'],
    },
    features: [
      f(3, 'Advance Order', 'A Field Order lets the ally move their full speed instead of half, without provoking.'),
      f(3, 'Forward', 'Allies within 30 feet of you ignore difficult terrain on the first 10 feet of their movement.'),
      f(7, 'Break Through', 'When an ally moving under your Field Order enters a hostile creature\'s space, that creature makes a Strength save against your Command save DC or is shoved 5 feet.'),
      f(10, 'On My Mark', 'At the start of a fight, every ally within 30 feet may immediately move 15 feet.'),
      f(15, 'The Whole Line', 'Once per fight, a Field Order applies to every ally within 30 feet.'),
    ],
  },
  {
    classId: 'marshal',
    subclass: {
      id: 'doctrine-of-the-shieldwall', name: 'Doctrine of the Shieldwall', rulesets: BOTH, source: 'Forge', level: 3,
      note: 'Nobody gets through. The defensive doctrine: temporary hit points, damage reduction and a formation that holds ground.',
      tags: ['tank'],
    },
    features: [
      f(3, 'Shieldwall', 'While you are within 5 feet of an ally, both of you gain +1 AC. Rises to +2 at 10th level.'),
      f(3, 'Brace Order', 'A Field Order may instead give the ally resistance to all damage until the start of your next turn.'),
      f(7, 'Cover Them', 'When an ally within 5 feet is hit, spend a Command as a reaction to reduce the damage by your Marshal level plus your Charisma modifier.'),
      f(10, 'Do Not Break', 'Allies within 30 feet cannot be moved against their will by an effect that allows a save while you are conscious.'),
      f(15, 'Unbroken', 'Allies within 5 feet of you take no damage from a failed save that would deal half on a success.'),
    ],
  },
  {
    classId: 'marshal',
    subclass: {
      id: 'doctrine-of-the-hammer', name: 'Doctrine of the Hammer', rulesets: BOTH, source: 'Forge', level: 3,
      note: 'Focus fire, formalised. The damage doctrine - it makes the party\'s attacks land rather than adding to your own.',
      tags: [],
    },
    features: [
      f(3, 'Focus Fire', 'As a bonus action, name a target. The first attack each ally makes against it this round adds your Charisma modifier to the roll.'),
      f(3, 'Opening', 'Your Field Order attack adds your Charisma modifier to damage.'),
      f(7, 'All At Once', 'When two or more allies hit your Focus Fire target in the same round, the second and later hits deal an extra 1d8.'),
      f(10, 'Press', 'A creature you have named with Focus Fire has disadvantage on saves against your allies\' effects.'),
      f(15, 'Break It', 'When your Focus Fire target drops, immediately name a new one and give a free Field Order.'),
    ],
  },
  {
    classId: 'marshal',
    subclass: {
      id: 'doctrine-of-the-quartermaster', name: 'Doctrine of the Quartermaster', rulesets: BOTH, source: 'Forge', level: 3,
      note: 'Non-magical healing and logistics. The only class in the app that keeps a party standing without a spell, which is the whole reason people ask for a Warlord.',
      tags: ['support'],
    },
    features: [
      f(3, 'Field Medicine', 'A Field Order may instead let an ally spend a Hit Die and add your Charisma modifier to the roll.'),
      f(3, 'Rations and Rest', 'The party gains one extra Hit Die each on a long rest, and needs half the usual food and water.'),
      f(7, 'On Your Feet', 'Spend a Command as a bonus action to end one of blinded, deafened, frightened, paralysed or poisoned on an ally within 30 feet.'),
      f(10, 'Second Wind, Everyone', 'Once per short rest, every ally within 30 feet regains hit points equal to your Marshal level.'),
      f(15, 'The Column Endures', 'Allies who finish a short rest with you may spend Hit Dice as though they had rolled the maximum.'),
    ],
  },
  {
    classId: 'marshal',
    subclass: {
      id: 'doctrine-of-the-standard', name: 'Doctrine of the Standard', rulesets: BOTH, source: 'Forge', level: 3,
      note: 'A banner and the morale that comes with it. Aura-based, and the one doctrine that helps allies who cannot hear you - which matters more than it sounds in a loud fight.',
      tags: ['support'],
    },
    features: [
      f(3, 'The Standard', 'Plant a banner in a space within 30 feet as a bonus action. Allies within 15 feet of it add your Charisma modifier to saving throws.'),
      f(3, 'Seen, Not Heard', 'Your Commands work on any ally who can see you or the standard, whether or not they can hear you.'),
      f(7, 'Rally Point', 'An ally who starts their turn within 15 feet of the standard gains temporary hit points equal to your proficiency bonus.'),
      f(10, 'It Does Not Fall', 'The standard cannot be moved or destroyed by anything short of a wish, and you may recall and replant it as a bonus action.'),
      f(15, 'Hold This Ground', 'Enemies within 15 feet of the standard have disadvantage on attacks against allies within 15 feet of it.'),
    ],
  },
  {
    classId: 'marshal',
    subclass: {
      id: 'doctrine-of-the-scout-master', name: 'Doctrine of the Scout Master', rulesets: ['2014'], source: 'Forge', level: 3,
      note: 'Information as a weapon. Initiative, surprise and reconnaissance - it decides fights before round one rather than during it.',
      tags: ['stealth'],
    },
    features: [
      f(3, 'Read the Field', 'At the start of a fight you learn the number of hostile creatures and which of them has the highest armour class and the lowest.'),
      f(3, 'Nobody Is Surprised', 'You and allies within 30 feet cannot be surprised while you are conscious.'),
      f(7, 'First Word', 'Allies within 30 feet add half your Charisma modifier, rounded up, to initiative.'),
      f(10, 'Fall Back', 'Spend a Command as a reaction when an ally is hit: they teleport to an unoccupied space within 15 feet after the damage is taken.'),
      f(15, 'The Whole Map', 'You know the position of every hostile creature within 120 feet, whether or not you can see it.'),
    ],
  },
  {
    classId: 'marshal',
    subclass: {
      id: 'doctrine-of-the-executioner', name: 'Doctrine of the Executioner', rulesets: ['2014'], source: 'Forge', level: 3,
      note: 'The doctrine that fights rather than commands. For a Marshal who wants their own damage to be worth watching - this is the one the balance band is measured against.',
      tags: ['martial-weapons'],
    },
    features: [
      f(3, 'Lead From the Front', 'When you hit a creature, the next ally to hit it this round adds your Charisma modifier to damage.'),
      f(3, 'Make an Example', 'When you reduce a creature to 0 hit points, every hostile creature within 30 feet that saw it makes a Wisdom save against your Command save DC or is frightened of you until the end of its next turn.'),
      f(7, 'Cut the Head Off', 'Your critical hit range is 19-20 against any creature that has more hit points than you do.'),
      f(10, 'No Quarter', 'Once per turn, when you hit a frightened creature, add 2d8 damage.'),
      f(15, 'Field Execution', 'Once per fight, when you hit a creature below a quarter of its hit points, it makes a Constitution save against your Command save DC or drops to 0.'),
    ],
  },
  {
    classId: 'marshal',
    subclass: {
      id: 'doctrine-of-the-siege-master', name: 'Doctrine of the Siege Master', rulesets: ['2014'], source: 'Forge', level: 3,
      note: 'Ground, walls and engines. The doctrine for campaigns with a map on the table - it makes terrain a resource the party spends rather than scenery.',
      tags: ['controller'],
    },
    features: [
      f(3, 'Prepared Ground', 'Before a fight you may spend ten minutes to designate a 20-foot square: allies in it have half cover and ignore difficult terrain.'),
      f(3, 'Engines', 'Proficiency with siege weapons, and you may fire one as a bonus action.'),
      f(7, 'Choke Point', 'Spend a Command as an action to make a 15-foot line difficult terrain that costs hostile creatures their reaction to enter.'),
      f(10, 'Bring the Wall Down', 'Your attacks against objects and structures ignore damage thresholds and deal double damage.'),
      f(15, 'Fortify', 'Your Prepared Ground takes one minute instead of ten and grants three-quarters cover.'),
    ],
  },
  {
    classId: 'marshal',
    subclass: {
      id: 'doctrine-of-the-honour-guard', name: 'Doctrine of the Honour Guard', rulesets: ['2014'], source: 'Forge', level: 3,
      note: 'One ally, protected absolutely. Built for a party with somebody who must not die - the escort mission made into a subclass rather than a chore.',
      tags: ['tank', 'support'],
    },
    features: [
      f(3, 'Charge', 'Name one ally as your charge at the end of a rest. You may spend a Command as a reaction to swap places with them if they are within 30 feet.'),
      f(3, 'In My Care', 'Your charge adds your Charisma modifier to armour class against opportunity attacks and gains your proficiency bonus in temporary hit points at the start of each fight.'),
      f(7, 'Take the Blow', 'When your charge is hit, you may use your reaction to take the damage yourself, halved.'),
      f(10, 'Two Charges', 'You may name two allies as your charges.'),
      f(15, 'Over My Body', 'While you are conscious and within 30 feet, your charges cannot be reduced below 1 hit point by a single instance of damage.'),
    ],
  },

  // =================================================================== adept
  // The shape your mind takes.
  {
    classId: 'adept',
    subclass: {
      id: 'discipline-of-the-blade-mind', name: 'Discipline of the Blade Mind', rulesets: BOTH, source: 'Forge', level: 3,
      note: 'A weapon made of attention. The melee Adept - it gets Extra Attack and a blade that is always in hand, which is what makes a d8 psion survivable at the front.',
      tags: ['gish'],
      features: [{ level: 6, name: 'Extra Attack', summary: 'Attack twice with the Attack action.', tags: ['extra-attack'] }],
    },
    features: [
      f(3, 'Mind Blade', 'Manifest a weapon as a bonus action: 1d8 force damage, finesse, thrown 30/60, returns to your hand, and attacks with your Intelligence modifier.'),
      f(3, 'Never Disarmed', 'Your mind blade cannot be taken from you and reappears on your turn if destroyed.'),
      f(11, 'Two Blades', 'You may manifest a second mind blade and attack with it as a bonus action, adding your Intelligence modifier to its damage.'),
      f(17, 'Cut the Thought', 'Once per fight, a creature you hit with your mind blade makes an Intelligence save against your psi save DC or loses its action on its next turn.'),
    ],
  },
  {
    classId: 'adept',
    subclass: {
      id: 'discipline-of-the-open-hand-mind', name: 'Discipline of the Far Hand', rulesets: BOTH, source: 'Forge', level: 3,
      note: 'Telekinesis proper. Moving creatures and objects is most of what people imagine psionics is, and this is the discipline that actually does it.',
      tags: ['controller'],
    },
    features: [
      f(3, 'Far Hand', 'Your Telekinetic Hand shoves 20 feet instead of 10, may lift 200 pounds, and may be used at 60 feet.'),
      f(3, 'Hold', 'Spend a psi die to restrain a Large or smaller creature within 60 feet until the end of your next turn; Strength save against your psi save DC to resist and again at the end of each of its turns.'),
      f(6, 'Lift', 'Spend a psi die to raise a creature 20 feet into the air. It falls when the effect ends unless it can fly.'),
      f(11, 'Crush', 'A creature you have held takes your Psionic Strike dice in force damage at the start of each of its turns.'),
      f(17, 'Nothing Stays Where It Is', 'As an action, spend three psi dice: every creature in a 30-foot radius makes a Strength save against your psi save DC or is thrown 30 feet in a direction you choose and knocked prone.'),
    ],
  },
  {
    classId: 'adept',
    subclass: {
      id: 'discipline-of-the-quiet-mind', name: 'Discipline of the Quiet Mind', rulesets: BOTH, source: 'Forge', level: 3,
      note: 'Reading and rewriting. The social and infiltration Adept - and the only one whose best turn involves no roll at all.',
      tags: ['support', 'stealth'],
    },
    features: [
      f(3, 'Read', 'Spend a psi die to learn a creature\'s surface thoughts for one minute. Wisdom save against your psi save DC to notice; failure means it does not know.'),
      f(3, 'Suggest', 'Spend two psi dice to plant one reasonable suggestion. Wisdom save against your psi save DC. Failure means it acts on it for up to an hour.'),
      f(6, 'Unnoticed', 'Spend a psi die to become unremarkable for ten minutes: creatures do not register your presence unless you act against them.'),
      f(11, 'Rewrite', 'Spend three psi dice to modify up to five minutes of a creature\'s memory. Intelligence save against your psi save DC.'),
      f(17, 'Puppet', 'Spend five psi dice as an action to dominate a creature you can see for one minute. Wisdom save against your psi save DC, repeated when it takes damage.'),
    ],
  },
  {
    classId: 'adept',
    subclass: {
      id: 'discipline-of-the-burning-mind', name: 'Discipline of the Burning Mind', rulesets: BOTH, source: 'Forge', level: 3,
      note: 'Psychic damage as an area effect. The blaster Adept, and deliberately the only one - a psion that could nova like a Wizard as well as everything else would not be a class, it would be a problem.',
      tags: ['blaster'],
    },
    features: [
      f(3, 'Mind Burn', 'As an action, spend any number of psi dice: each creature in a 15-foot cone takes that many Psionic Strike dice in psychic damage, Intelligence save against your psi save DC for half.'),
      f(3, 'It Hurts To Think', 'A creature that fails a save against your psionics has disadvantage on its next attack roll.'),
      f(6, 'Wider', 'Mind Burn becomes a 30-foot cone or a 15-foot radius, your choice each time.'),
      f(11, 'Overload', 'A creature reduced to 0 hit points by your psychic damage explodes: every creature within 10 feet takes your Psionic Strike dice in psychic damage.'),
      f(17, 'Nothing Left', 'Your psychic damage ignores resistance, and creatures immune to psychic damage take half instead.'),
    ],
  },
  {
    classId: 'adept',
    subclass: {
      id: 'discipline-of-the-still-mind', name: 'Discipline of the Still Mind', rulesets: BOTH, source: 'Forge', level: 3,
      note: 'Defence and denial. The durable Adept: it turns psi dice into damage reduction and can refuse an effect outright, which no other class in the app can do without a spell.',
      tags: ['tank'],
    },
    features: [
      f(3, 'Still', 'Spend a psi die as a reaction to reduce damage you or an ally within 30 feet takes by the die plus your Intelligence modifier.'),
      f(3, 'Unmoved', 'You have advantage on saving throws against being moved, knocked prone or restrained.'),
      f(6, 'Nothing Reaches', 'Spend two psi dice as a reaction to succeed on a saving throw you just failed. Once per fight.'),
      f(11, 'Held Together', 'While you have psi dice remaining, you have resistance to psychic and force damage and cannot be knocked unconscious by a single blow while above 1 hit point.'),
      f(17, 'Refuse', 'Once per long rest, spend five psi dice to negate one effect that targets you entirely, spell or otherwise.'),
    ],
  },
  {
    classId: 'adept',
    subclass: {
      id: 'discipline-of-the-open-eye', name: 'Discipline of the Open Eye', rulesets: ['2014'], source: 'Forge', level: 3,
      note: 'Precognition. Small edges applied at exactly the right moment - the Divination Wizard\'s Portent, spent from a pool rather than rolled at dawn.',
      tags: ['controller', 'support'],
    },
    features: [
      f(3, 'A Moment Ahead', 'Spend a psi die as a reaction to add it to any d20 roll made within 60 feet, after the roll and before the outcome.'),
      f(3, 'Never Flat-Footed', 'You cannot be surprised, and attacks against you do not gain advantage from being unseen.'),
      f(6, 'Two Futures', 'When you use A Moment Ahead, you may spend a second psi die to subtract instead of add, on the same roll or a different one this round.'),
      f(11, 'Read the Turn', 'At the start of each of your turns, learn one action a hostile creature within 60 feet intends to take.'),
      f(17, 'It Did Not Happen', 'Once per long rest, spend four psi dice to force any creature to reroll a d20 and take the new result.'),
    ],
  },
  {
    classId: 'adept',
    subclass: {
      id: 'discipline-of-the-shared-mind', name: 'Discipline of the Shared Mind', rulesets: ['2014'], source: 'Forge', level: 3,
      note: 'Your psi dice on other people\'s rolls. The party-facing Adept - it spends its whole pool on allies and gets nothing back but a party that works.',
      tags: ['support'],
    },
    features: [
      f(3, 'Lend', 'Spend a psi die as a reaction to let an ally within 60 feet add it to an attack roll, save or check.'),
      f(3, 'Link', 'You and up to five allies may speak telepathically within 120 feet, no shared language required.'),
      f(6, 'Borrowed Hands', 'Spend two psi dice as a bonus action to let an ally within 30 feet make one weapon attack.'),
      f(11, 'Shared Load', 'When an ally within 30 feet takes damage, you may spend a psi die to take half of it instead.'),
      f(17, 'One Mind', 'Once per fight, spend four psi dice: every ally within 30 feet adds your Intelligence modifier to every roll until the start of your next turn.'),
    ],
  },
  {
    classId: 'adept',
    subclass: {
      id: 'discipline-of-the-untethered', name: 'Discipline of the Untethered', rulesets: ['2014'], source: 'Forge', level: 3,
      note: 'The mind leaves. Astral projection and teleportation as an at-will resource, which makes it the best scout in the app and a nightmare to imprison.',
      tags: ['stealth'],
    },
    features: [
      f(3, 'Step Sideways', 'Spend a psi die as a bonus action to teleport up to 30 feet to a space you can see.'),
      f(3, 'Loosened', 'You may spend ten minutes to project your senses up to one mile, leaving your body inert.'),
      f(6, 'Carry', 'Step Sideways may bring one willing creature you can touch.'),
      f(11, 'Nowhere Holds You', 'You cannot be restrained, grappled, imprisoned or planar-bound while you have a psi die remaining, and you may Step Sideways as a reaction.'),
      f(17, 'Elsewhere', 'Spend three psi dice as an action to step out of reality until the start of your next turn: nothing can reach you, and you return where you choose within 60 feet.'),
    ],
  },
  {
    classId: 'adept',
    subclass: {
      id: 'discipline-of-the-devouring-mind', name: 'Discipline of the Devouring Mind', rulesets: ['2014'], source: 'Forge', level: 3,
      note: 'You take what you use from what you kill. The sustain discipline: it refills its own pool mid-fight, which matters most in the long grinding days a per-encounter class is otherwise best at.',
      tags: [],
    },
    features: [
      f(3, 'Feed', 'When you reduce a creature to 0 hit points, regain two psi dice instead of one.'),
      f(3, 'Taste', 'When you damage a creature with psionics, you learn one of its damage vulnerabilities, resistances or immunities.'),
      f(6, 'Take It', 'Spend two psi dice on a hit: the creature makes an Intelligence save against your psi save DC or you learn and may use one of its features once before your next long rest.'),
      f(11, 'Drain', 'Your Psionic Strike heals you for half the damage it deals.'),
      f(17, 'Consume', 'Once per long rest, as an action against a creature below a quarter of its hit points: Constitution save against your psi save DC or it drops to 0 and you refill your psi dice.'),
    ],
  },
];

const grouped = groupForgeRows(ROWS);
export const FORGE_CLASS_SUBCLASSES: Partial<Record<ClassId, Subclass[]>> = grouped.byClass;
export const FORGE_CLASS_SUBCLASS_FEATURES: Record<string, ClassFeature[]> = grouped.features;
