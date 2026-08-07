import { ARMOR } from './armor';

/**
 * Ordinary equipment: everything on the Player's Handbook equipment tables
 * that is not a weapon or a suit of armor.
 *
 * Those two have tables of their own, because the engine reasons about them -
 * a greatsword changes your damage per round and chain mail changes your armor
 * class. Nothing here changes a number the optimizer cares about, which is
 * exactly why it was missing for so long. It is here now because a character
 * sheet with no rope, no rations and no torches is not a character sheet, and
 * because weight is the one thing on this list the rules do compute against:
 * carrying capacity is Strength × 15.
 *
 * Costs are in **copper pieces** throughout, so the whole table is integers -
 * 1 sp is 10, 1 gp is 100, 1 pp is 1000. `formatCost` turns that back into the
 * denomination a book would print.
 *
 * Weights are pounds and can be fractional, which the tables genuinely are: a
 * piton is a quarter of a pound and a steel mirror is a half.
 */

export type GearCategory =
  | 'gear'
  | 'container'
  | 'ammunition'
  | 'focus'
  | 'clothing'
  | 'consumable'
  | 'kit'
  | 'pack'
  | 'artisan'
  | 'gaming'
  | 'instrument'
  | 'mount'
  | 'tack'
  | 'vehicle'
  | 'trade';

export const GEAR_CATEGORY_LABELS: Record<GearCategory, string> = {
  gear: 'Adventuring gear',
  container: 'Containers',
  ammunition: 'Ammunition',
  focus: 'Spellcasting focuses',
  clothing: 'Clothing',
  consumable: 'Food, drink and supplies',
  kit: 'Kits and tools',
  pack: 'Equipment packs',
  artisan: "Artisan's tools",
  gaming: 'Gaming sets',
  instrument: 'Musical instruments',
  mount: 'Mounts and animals',
  tack: 'Tack and harness',
  vehicle: 'Vehicles',
  trade: 'Trade goods',
};

/** The order the picker lists them in: what you carry first, livestock last. */
export const GEAR_CATEGORY_ORDER: GearCategory[] = [
  'gear',
  'container',
  'ammunition',
  'focus',
  'kit',
  'artisan',
  'instrument',
  'gaming',
  'consumable',
  'clothing',
  'pack',
  'tack',
  'mount',
  'vehicle',
  'trade',
];

export interface Gear {
  id: string;
  name: string;
  category: GearCategory;
  /** In copper pieces. */
  cost: number;
  /** In pounds. */
  weight: number;
  /**
   * A mount, a ship or a cart is owned rather than carried, so its weight is
   * not on your back. Without this a riding horse would put you 200 pounds
   * over your capacity the moment you bought one.
   */
  notCarried?: boolean;
  /**
   * How many pieces one purchase is, for the things sold by the bundle. The
   * books put it in the name - "Arrows (20)" - and the sheet needs the number
   * rather than the parenthesis, because it counts arrows and not quivers.
   */
  bundle?: number;
  /** Only where there is something worth saying. */
  note?: string;
  /**
   * A flask you throw: an improvised ranged attack (Dexterity, no
   * proficiency), the flask spent whether it hits or not. Structured so the
   * battle screen can arm the throw through the same aim flow as a weapon -
   * the note stays for the rulings the model does not carry (alchemist's
   * fire burning on, holy water only biting fiends and undead).
   */
  thrown?: { dice: string; type: string };
}

const cp = 1;
const sp = 10;
const gp = 100;

/** Terse constructor, because the value of this file is the table not the syntax. */
function g(
  id: string,
  name: string,
  category: GearCategory,
  cost: number,
  weight: number,
  extra: Partial<Gear> = {},
): Gear {
  return { id, name, category, cost, weight, ...extra };
}

/**
 * Barding is any suit of armor sized for a mount: four times the cost and
 * twice the weight, which is a rule rather than a table. Deriving it from
 * `ARMOR` means the thirteen rows can never drift out of step with the armor
 * they are made from, and it is how the books present it.
 */
const BARDING: Gear[] = ARMOR.filter((armor) => armor.id !== 'none').map((armor) => ({
  id: `barding-${armor.id}`,
  name: `Barding, ${armor.name.toLowerCase()}`,
  category: 'tack' as const,
  cost: armor.cost * 4,
  weight: armor.weight * 2,
  // Worn by the horse, not by you.
  notCarried: true,
}));

export const GEAR: Gear[] = [
  // --------------------------------------------------------- adventuring gear
  g('abacus', 'Abacus', 'gear', 2 * gp, 2),
  g('acid', 'Acid (vial)', 'gear', 25 * gp, 1, {
    note: 'A thrown improvised weapon: 2d6 acid on a hit.',
    thrown: { dice: '2d6', type: 'acid' },
  }),
  g('alchemists-fire', "Alchemist's fire (flask)", 'gear', 50 * gp, 1, {
    note: 'Thrown: 1d4 fire, and it keeps burning until someone spends an action to douse it.',
    thrown: { dice: '1d4', type: 'fire' },
  }),
  g('antitoxin', 'Antitoxin (vial)', 'gear', 50 * gp, 0),
  g('ball-bearings', 'Ball bearings (bag of 1,000)', 'gear', 1 * gp, 2),
  g('bell', 'Bell', 'gear', 1 * gp, 0),
  g('blanket', 'Blanket', 'gear', 5 * sp, 3),
  g('block-and-tackle', 'Block and tackle', 'gear', 1 * gp, 5),
  g('book', 'Book', 'gear', 25 * gp, 5),
  g('caltrops', 'Caltrops (bag of 20)', 'gear', 1 * gp, 2),
  g('candle', 'Candle', 'gear', 1 * cp, 0, { note: 'Bright light 5 ft., dim for another 5, one hour.' }),
  g('chain', 'Chain (10 feet)', 'gear', 5 * gp, 10),
  g('chalk', 'Chalk (1 piece)', 'gear', 1 * cp, 0),
  g('climbers-kit', "Climber's kit", 'gear', 25 * gp, 12),
  g('crowbar', 'Crowbar', 'gear', 2 * gp, 5, {
    note: 'Advantage on Strength checks where leverage applies.',
  }),
  g('fishing-tackle', 'Fishing tackle', 'gear', 1 * gp, 4),
  g('grappling-hook', 'Grappling hook', 'gear', 2 * gp, 4),
  g('hammer', 'Hammer', 'gear', 1 * gp, 3),
  g('sledgehammer', 'Hammer, sledge', 'gear', 2 * gp, 10),
  g('healers-kit', "Healer's kit", 'gear', 5 * gp, 3, {
    note: 'Ten uses. One stabilises a dying creature with no Medicine check at all.',
  }),
  g('holy-water', 'Holy water (flask)', 'gear', 25 * gp, 1, {
    note: 'Thrown: 2d6 radiant to a fiend or undead.',
    thrown: { dice: '2d6', type: 'radiant' },
  }),
  g('hourglass', 'Hourglass', 'gear', 25 * gp, 1),
  g('hunting-trap', 'Hunting trap', 'gear', 5 * gp, 25),
  g('ink', 'Ink (1 ounce bottle)', 'gear', 10 * gp, 0),
  g('ink-pen', 'Ink pen', 'gear', 2 * cp, 0),
  g('ladder', 'Ladder (10-foot)', 'gear', 1 * sp, 25),
  g('lamp', 'Lamp', 'gear', 5 * sp, 1),
  g('lantern-bullseye', 'Lantern, bullseye', 'gear', 10 * gp, 2, {
    note: 'A 60-foot cone of bright light, which is the reason to prefer it.',
  }),
  g('lantern-hooded', 'Lantern, hooded', 'gear', 5 * gp, 2, {
    note: 'Bright light 30 ft.; hooding it drops to 5 ft. of dim without putting it out.',
  }),
  g('lock', 'Lock', 'gear', 10 * gp, 1),
  g('magnifying-glass', 'Magnifying glass', 'gear', 100 * gp, 0),
  g('manacles', 'Manacles', 'gear', 2 * gp, 6),
  g('mess-kit', 'Mess kit', 'gear', 2 * sp, 1),
  g('mirror-steel', 'Mirror, steel', 'gear', 5 * gp, 0.5),
  g('oil', 'Oil (flask)', 'gear', 1 * sp, 1),
  g('paper', 'Paper (one sheet)', 'gear', 2 * sp, 0),
  g('parchment', 'Parchment (one sheet)', 'gear', 1 * sp, 0),
  g('perfume', 'Perfume (vial)', 'gear', 5 * gp, 0),
  g('pick-miners', "Pick, miner's", 'gear', 2 * gp, 10),
  g('piton', 'Piton', 'gear', 5 * cp, 0.25),
  g('poison-basic', 'Poison, basic (vial)', 'gear', 100 * gp, 0),
  g('pole', 'Pole (10-foot)', 'gear', 5 * cp, 7),
  g('pot-iron', 'Pot, iron', 'gear', 2 * gp, 10),
  g('portable-ram', 'Ram, portable', 'gear', 4 * gp, 35),
  g('robes', 'Robes', 'gear', 1 * gp, 4),
  g('rope-hempen', 'Rope, hempen (50 feet)', 'gear', 1 * gp, 10),
  g('rope-silk', 'Rope, silk (50 feet)', 'gear', 10 * gp, 5),
  g('scale-merchants', "Scale, merchant's", 'gear', 5 * gp, 3),
  g('sealing-wax', 'Sealing wax', 'gear', 5 * sp, 0),
  g('shovel', 'Shovel', 'gear', 2 * gp, 5),
  g('signal-whistle', 'Signal whistle', 'gear', 5 * cp, 0),
  g('signet-ring', 'Signet ring', 'gear', 5 * gp, 0),
  g('soap', 'Soap', 'gear', 2 * cp, 0),
  g('spellbook', 'Spellbook', 'gear', 50 * gp, 3, {
    note: 'A Wizard prepares from this; replacing a lost one is 50 gp a page.',
  }),
  g('spikes-iron', 'Spikes, iron (10)', 'gear', 1 * gp, 5),
  g('spyglass', 'Spyglass', 'gear', 1000 * gp, 1),
  g('tent', 'Tent, two-person', 'gear', 2 * gp, 20),
  g('tinderbox', 'Tinderbox', 'gear', 5 * sp, 1),
  g('torch', 'Torch', 'gear', 1 * cp, 1, {
    note: 'Bright light 20 ft. for an hour, and 1 fire damage as an improvised weapon.',
  }),
  g('whetstone', 'Whetstone', 'gear', 1 * cp, 1),

  /*
    The oddments that only ever appear inside a starting pack. The books print
    no price and no weight for them, because you are never sold one on its own -
    but a priest who unpacks their pack owns a censer and some vestments, and a
    sheet that cannot name them is a sheet that quietly loses them.
  */
  g('alms-box', 'Alms box', 'gear', 0, 0),
  g('incense-block', 'Block of incense', 'gear', 0, 0),
  g('censer', 'Censer', 'gear', 0, 0),
  g('sand-bag-little', 'Little bag of sand', 'gear', 0, 0),
  g('knife-small', 'Small knife', 'gear', 0, 0),
  g('string-10', 'String (10 feet)', 'gear', 0, 0),
  g('vestments', 'Vestments', 'gear', 0, 0),

  // ------------------------------------------------------------- containers
  g('backpack', 'Backpack', 'container', 2 * gp, 5, { note: 'Holds 1 cubic foot or 30 pounds.' }),
  g('barrel', 'Barrel', 'container', 2 * gp, 70),
  g('basket', 'Basket', 'container', 4 * sp, 2),
  g('bottle-glass', 'Bottle, glass', 'container', 2 * gp, 2),
  g('bucket', 'Bucket', 'container', 5 * cp, 2),
  g('case-crossbow-bolt', 'Case, crossbow bolt', 'container', 1 * gp, 1),
  g('case-map-scroll', 'Case, map or scroll', 'container', 1 * gp, 1),
  g('chest', 'Chest', 'container', 5 * gp, 25),
  g('flask', 'Flask or tankard', 'container', 2 * cp, 1),
  g('jug', 'Jug or pitcher', 'container', 2 * cp, 4),
  g('pouch', 'Pouch', 'container', 5 * sp, 1, { note: 'Holds 6 pounds, or 20 sling bullets.' }),
  g('quiver', 'Quiver', 'container', 1 * gp, 1, { note: 'Holds 20 arrows.' }),
  g('sack', 'Sack', 'container', 1 * cp, 0.5),
  g('vial', 'Vial', 'container', 1 * gp, 0),
  g('waterskin', 'Waterskin', 'container', 2 * sp, 5, { note: 'Five pounds full, one empty.' }),

  // ------------------------------------------------------------- ammunition
  g('arrows', 'Arrows (20)', 'ammunition', 1 * gp, 1, { bundle: 20 }),
  g('blowgun-needles', 'Blowgun needles (50)', 'ammunition', 1 * gp, 1, { bundle: 50 }),
  g('crossbow-bolts', 'Crossbow bolts (20)', 'ammunition', 1 * gp, 1.5, { bundle: 20 }),
  g('sling-bullets', 'Sling bullets (20)', 'ammunition', 4 * cp, 1.5, { bundle: 20 }),
  // The 2024 firearms had nothing to load. Priced and weighed from SRD 5.2,
  // which is also the only place the pistol and musket appear.
  g('firearm-bullets', 'Bullets, firearm (10)', 'ammunition', 3 * gp, 2, {
    bundle: 10,
    note: 'For the 2024 pistol and musket; the 2014 rules have no firearms.',
  }),

  // --------------------------------------------------------------- focuses
  g('crystal', 'Crystal (arcane focus)', 'focus', 10 * gp, 1),
  g('orb', 'Orb (arcane focus)', 'focus', 20 * gp, 3),
  g('rod-focus', 'Rod (arcane focus)', 'focus', 10 * gp, 2),
  g('staff-focus', 'Staff (arcane focus)', 'focus', 5 * gp, 4),
  g('wand-focus', 'Wand (arcane focus)', 'focus', 10 * gp, 1),
  g('sprig-of-mistletoe', 'Sprig of mistletoe (druidic focus)', 'focus', 1 * gp, 0),
  g('totem', 'Totem (druidic focus)', 'focus', 1 * gp, 0),
  g('wooden-staff', 'Wooden staff (druidic focus)', 'focus', 5 * gp, 4),
  g('yew-wand', 'Yew wand (druidic focus)', 'focus', 10 * gp, 1),
  g('amulet', 'Amulet (holy symbol)', 'focus', 5 * gp, 1),
  g('emblem', 'Emblem (holy symbol)', 'focus', 5 * gp, 0, { note: 'Borne on a shield, so it costs no hand.' }),
  g('reliquary', 'Reliquary (holy symbol)', 'focus', 5 * gp, 2),
  g('component-pouch', 'Component pouch', 'focus', 25 * gp, 2, {
    note: 'Covers every material component without a listed cost; a focus does the same job.',
  }),

  // -------------------------------------------------------------- clothing
  g('clothes-common', 'Clothes, common', 'clothing', 5 * sp, 3),
  g('clothes-costume', 'Clothes, costume', 'clothing', 5 * gp, 4),
  g('clothes-fine', 'Clothes, fine', 'clothing', 15 * gp, 6),
  g('clothes-travelers', "Clothes, traveler's", 'clothing', 2 * gp, 4),

  // ------------------------------------------------------ food and supplies
  g('rations', 'Rations (1 day)', 'consumable', 5 * sp, 2),
  g('feed', 'Feed (per day)', 'consumable', 5 * cp, 10),
  g('potion-of-healing-mundane', 'Potion of healing', 'consumable', 50 * gp, 0.5, {
    note: 'Restores 2d4+2 hit points. Common enough to be bought rather than found.',
  }),

  // ------------------------------------------------------------------ kits
  g('disguise-kit', 'Disguise kit', 'kit', 25 * gp, 3),
  g('forgery-kit', 'Forgery kit', 'kit', 15 * gp, 5),
  g('herbalism-kit', 'Herbalism kit', 'kit', 5 * gp, 3),
  g('navigators-tools', "Navigator's tools", 'kit', 25 * gp, 2),
  g('poisoners-kit', "Poisoner's kit", 'kit', 50 * gp, 2),
  g('thieves-tools', "Thieves' tools", 'kit', 25 * gp, 1, {
    note: 'Locks and traps. The most-used tool proficiency in the game by some distance.',
  }),

  // ------------------------------------------------------- artisan's tools
  g('alchemists-supplies', "Alchemist's supplies", 'artisan', 50 * gp, 8),
  g('brewers-supplies', "Brewer's supplies", 'artisan', 20 * gp, 9),
  g('calligraphers-supplies', "Calligrapher's supplies", 'artisan', 10 * gp, 5),
  g('carpenters-tools', "Carpenter's tools", 'artisan', 8 * gp, 6),
  g('cartographers-tools', "Cartographer's tools", 'artisan', 15 * gp, 6),
  g('cobblers-tools', "Cobbler's tools", 'artisan', 5 * gp, 5),
  g('cooks-utensils', "Cook's utensils", 'artisan', 1 * gp, 8),
  g('glassblowers-tools', "Glassblower's tools", 'artisan', 30 * gp, 5),
  g('jewelers-tools', "Jeweler's tools", 'artisan', 25 * gp, 2),
  g('leatherworkers-tools', "Leatherworker's tools", 'artisan', 5 * gp, 5),
  g('masons-tools', "Mason's tools", 'artisan', 10 * gp, 8),
  g('painters-supplies', "Painter's supplies", 'artisan', 10 * gp, 5),
  g('potters-tools', "Potter's tools", 'artisan', 10 * gp, 3),
  g('smiths-tools', "Smith's tools", 'artisan', 20 * gp, 8),
  g('tinkers-tools', "Tinker's tools", 'artisan', 50 * gp, 10),
  g('weavers-tools', "Weaver's tools", 'artisan', 1 * gp, 5),
  g('woodcarvers-tools', "Woodcarver's tools", 'artisan', 1 * gp, 5),

  // ----------------------------------------------------------- gaming sets
  g('dice-set', 'Dice set', 'gaming', 1 * sp, 0),
  g('dragonchess-set', 'Dragonchess set', 'gaming', 1 * gp, 0.5),
  g('playing-card-set', 'Playing card set', 'gaming', 5 * sp, 0),
  g('three-dragon-ante-set', 'Three-Dragon Ante set', 'gaming', 1 * gp, 0),

  // ---------------------------------------------------- musical instruments
  g('bagpipes', 'Bagpipes', 'instrument', 30 * gp, 6),
  g('drum', 'Drum', 'instrument', 6 * gp, 3),
  g('dulcimer', 'Dulcimer', 'instrument', 25 * gp, 10),
  g('flute', 'Flute', 'instrument', 2 * gp, 1),
  g('lute', 'Lute', 'instrument', 35 * gp, 2),
  g('lyre', 'Lyre', 'instrument', 30 * gp, 2),
  g('horn', 'Horn', 'instrument', 3 * gp, 2),
  g('pan-flute', 'Pan flute', 'instrument', 12 * gp, 2),
  g('shawm', 'Shawm', 'instrument', 2 * gp, 1),
  g('viol', 'Viol', 'instrument', 30 * gp, 1),

  // ------------------------------------------------------- equipment packs
  g('pack-burglars', "Burglar's pack", 'pack', 16 * gp, 44.5, {
    note: 'Backpack, ball bearings, 10 ft. of string, bell, 5 candles, crowbar, hammer, 10 pitons, hooded lantern, 2 flasks of oil, 5 days rations, tinderbox, waterskin, 50 ft. of hempen rope.',
  }),
  g('pack-diplomats', "Diplomat's pack", 'pack', 39 * gp, 39, {
    note: 'Chest, 2 map cases, fine clothes, ink, pen, lamp, 2 flasks of oil, 5 sheets of paper, perfume, sealing wax, soap.',
  }),
  g('pack-dungeoneers', "Dungeoneer's pack", 'pack', 12 * gp, 61.5, {
    note: 'Backpack, crowbar, hammer, 10 pitons, 10 torches, tinderbox, 10 days rations, waterskin, 50 ft. of hempen rope.',
  }),
  g('pack-entertainers', "Entertainer's pack", 'pack', 40 * gp, 38, {
    note: 'Backpack, bedroll, 2 costumes, 5 candles, 5 days rations, waterskin, disguise kit.',
  }),
  g('pack-explorers', "Explorer's pack", 'pack', 10 * gp, 59, {
    note: 'Backpack, bedroll, mess kit, tinderbox, 10 torches, 10 days rations, waterskin, 50 ft. of hempen rope.',
  }),
  g('pack-priests', "Priest's pack", 'pack', 19 * gp, 24, {
    note: 'Backpack, blanket, 10 candles, tinderbox, alms box, 2 blocks of incense, censer, vestments, 2 days rations, waterskin.',
  }),
  g('pack-scholars', "Scholar's pack", 'pack', 40 * gp, 10, {
    note: 'Backpack, book of lore, ink, pen, 10 sheets of parchment, little bag of sand, small knife.',
  }),
  g('bedroll', 'Bedroll', 'gear', 1 * gp, 7),

  // -------------------------------------------------------- tack and harness
  g('bit-and-bridle', 'Bit and bridle', 'tack', 2 * gp, 1),
  g('saddle-exotic', 'Saddle, exotic', 'tack', 60 * gp, 40),
  g('saddle-military', 'Saddle, military', 'tack', 20 * gp, 30),
  g('saddle-pack', 'Saddle, pack', 'tack', 5 * gp, 15),
  g('saddle-riding', 'Saddle, riding', 'tack', 10 * gp, 25),
  g('saddlebags', 'Saddlebags', 'tack', 4 * gp, 8),
  g('stabling', 'Stabling (per day)', 'tack', 5 * sp, 0),
  ...BARDING,

  // ---------------------------------------------------------------- mounts
  g('camel', 'Camel', 'mount', 50 * gp, 0, { notCarried: true }),
  g('donkey', 'Donkey or mule', 'mount', 8 * gp, 0, { notCarried: true }),
  g('elephant', 'Elephant', 'mount', 200 * gp, 0, { notCarried: true }),
  g('horse-draft', 'Horse, draft', 'mount', 50 * gp, 0, { notCarried: true }),
  g('horse-riding', 'Horse, riding', 'mount', 75 * gp, 0, { notCarried: true }),
  g('mastiff', 'Mastiff', 'mount', 25 * gp, 0, { notCarried: true }),
  g('pony', 'Pony', 'mount', 30 * gp, 0, { notCarried: true }),
  g('warhorse', 'Warhorse', 'mount', 400 * gp, 0, { notCarried: true }),

  // -------------------------------------------------------------- vehicles
  g('carriage', 'Carriage', 'vehicle', 100 * gp, 600, { notCarried: true }),
  g('cart', 'Cart', 'vehicle', 15 * gp, 200, { notCarried: true }),
  g('chariot', 'Chariot', 'vehicle', 250 * gp, 100, { notCarried: true }),
  g('sled', 'Sled', 'vehicle', 20 * gp, 300, { notCarried: true }),
  g('wagon', 'Wagon', 'vehicle', 35 * gp, 400, { notCarried: true }),
  g('galley', 'Galley', 'vehicle', 30000 * gp, 0, { notCarried: true }),
  g('keelboat', 'Keelboat', 'vehicle', 3000 * gp, 0, { notCarried: true }),
  g('longship', 'Longship', 'vehicle', 10000 * gp, 0, { notCarried: true }),
  g('rowboat', 'Rowboat', 'vehicle', 50 * gp, 100, { notCarried: true }),
  g('sailing-ship', 'Sailing ship', 'vehicle', 10000 * gp, 0, { notCarried: true }),
  g('warship', 'Warship', 'vehicle', 25000 * gp, 0, { notCarried: true }),

  // ----------------------------------------------------------- trade goods
  g('wheat', 'Wheat (1 lb.)', 'trade', 1 * cp, 1),
  g('flour', 'Flour (1 lb.)', 'trade', 2 * cp, 1),
  g('chicken', 'Chicken', 'trade', 2 * cp, 0, { notCarried: true }),
  g('salt', 'Salt (1 lb.)', 'trade', 5 * cp, 1),
  g('iron', 'Iron (1 lb.)', 'trade', 1 * sp, 1),
  g('canvas', 'Canvas (1 sq. yd.)', 'trade', 1 * sp, 1),
  g('copper-bar', 'Copper (1 lb.)', 'trade', 5 * sp, 1),
  g('cotton-cloth', 'Cotton cloth (1 sq. yd.)', 'trade', 5 * sp, 1),
  g('ginger', 'Ginger (1 lb.)', 'trade', 1 * gp, 1),
  g('goat', 'Goat', 'trade', 1 * gp, 0, { notCarried: true }),
  g('cinnamon', 'Cinnamon (1 lb.)', 'trade', 2 * gp, 1),
  g('pepper', 'Pepper (1 lb.)', 'trade', 2 * gp, 1),
  g('sheep', 'Sheep', 'trade', 2 * gp, 0, { notCarried: true }),
  g('silver-bar', 'Silver (1 lb.)', 'trade', 5 * gp, 1),
  g('linen', 'Linen (1 sq. yd.)', 'trade', 5 * gp, 1),
  g('cow', 'Cow', 'trade', 10 * gp, 0, { notCarried: true }),
  g('saffron', 'Saffron (1 lb.)', 'trade', 15 * gp, 1),
  g('cloves', 'Cloves (1 lb.)', 'trade', 30 * gp, 1),
  g('silk', 'Silk (1 lb.)', 'trade', 10 * gp, 1),
  g('ox', 'Ox', 'trade', 15 * gp, 0, { notCarried: true }),
  g('gold-bar', 'Gold (1 lb.)', 'trade', 50 * gp, 1),
  g('platinum-bar', 'Platinum (1 lb.)', 'trade', 500 * gp, 1),
];

export const GEAR_BY_ID: Record<string, Gear> = Object.fromEntries(
  GEAR.map((item) => [item.id, item]),
);

export function gearById(id: string): Gear | undefined {
  return GEAR_BY_ID[id];
}

/** "2 gp", "5 sp", "1 cp" - the largest denomination that stays whole. */
export function formatCost(copper: number): string {
  if (copper === 0) return '—';
  if (copper % 100 === 0) return `${copper / 100} gp`;
  if (copper % 10 === 0) return `${copper / 10} sp`;
  return `${copper} cp`;
}

/** "1/4 lb.", "5 lb.", "—" for something with no listed weight. */
export function formatWeight(pounds: number): string {
  if (pounds === 0) return '—';
  if (pounds === 0.25) return '¼ lb.';
  if (pounds === 0.5) return '½ lb.';
  return `${pounds} lb.`;
}
