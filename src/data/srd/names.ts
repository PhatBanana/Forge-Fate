/**
 * What the SRD calls a thing, and what this app calls it.
 *
 * This lived in `srdAudit.test.ts` until the app itself needed it. Full SRD
 * rules text is keyed by the SRD's own names, and the runtime has to look an
 * entry up by the app's name, which is the same translation the audit has
 * always done. One table, two callers - a second copy would drift, and the
 * failure would be silent: a spell would simply appear to have no text.
 */

/** Matches the keying in `scripts/audit/refresh.mjs`. */
export function key(name: string): string {
  return name
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * What the app calls a thing, where that differs from what the SRD calls it.
 *
 * Two reasons these exist, and neither is a mistake. The SRD strips the wizard
 * names off seventeen spells for copyright - "Tenser's Floating Disk" is
 * "Floating Disk" there - and the app keeps the names players use. And the
 * equipment tables order words differently: "Crossbow, Hand" against "Hand
 * crossbow", "Leather Armor" against "Leather".
 */
const ALIAS_SOURCE: Record<string, string> = {
  // Equipment: word order, and quantities the app states in the name.
  'hand crossbow': 'crossbow hand',
  'heavy crossbow': 'crossbow heavy',
  'light crossbow': 'crossbow light',
  padded: 'padded armor',
  leather: 'leather armor',
  'studded leather': 'studded leather armor',
  hide: 'hide armor',
  'half plate': 'half plate armor',
  splint: 'splint armor',
  plate: 'plate armor',
  'arrows 20': 'arrow',
  'crossbow bolts 20': 'crossbow bolt',
  'sling bullets 20': 'sling bullet',
  'blowgun needles 50': 'blowgun needle',
  'spikes iron 10': 'spike iron',
  'caltrops (bag of 20)': 'caltrops',
  'feed (per day)': 'animal feed (1 day)',
  'stabling (per day)': 'stabling (1 day)',
  'donkey or mule': 'donkey',

  // Spellcasting focuses: the app says which kind of focus each one is.
  'orb (arcane focus)': 'orb',
  'rod (arcane focus)': 'rod',
  'staff (arcane focus)': 'staff',
  'wand (arcane focus)': 'wand',
  'crystal (arcane focus)': 'crystal',
  'sprig of mistletoe (druidic focus)': 'sprig of mistletoe',
  'totem (druidic focus)': 'totem',
  'wooden staff (druidic focus)': 'wooden staff',
  'yew wand (druidic focus)': 'yew wand',
  'amulet (holy symbol)': 'amulet',
  'emblem (holy symbol)': 'emblem',
  'reliquary (holy symbol)': 'reliquary',

  // Magic items: the SRD leads with the noun, the app with the plus.
  '+1 ammunition': 'ammunition, +1',
  '+2 ammunition': 'ammunition, +2',
  '+3 ammunition': 'ammunition, +3',
  '+1 armor': 'armor, +1',
  '+2 armor': 'armor, +2',
  '+3 armor': 'armor, +3',
  '+1 weapon': 'weapon, +1',
  '+2 weapon': 'weapon, +2',
  '+3 weapon': 'weapon, +3',
  'spell scroll (cantrip)': 'spell scroll (cantrip)',
  'spell scroll (1st level)': 'spell scroll (1st)',
  'spell scroll (2nd level)': 'spell scroll (2nd)',
  'spell scroll (3rd level)': 'spell scroll (3rd)',
  'spell scroll (4th level)': 'spell scroll (4th)',
  'spell scroll (5th level)': 'spell scroll (5th)',
  'spell scroll (6th level)': 'spell scroll (6th)',
  'spell scroll (7th level)': 'spell scroll (7th)',
  'spell scroll (8th level)': 'spell scroll (8th)',
  'spell scroll (9th level)': 'spell scroll (9th)',

  // Magic items the SRD renames.
  'iron bands of bilarro': 'iron bands of binding',
  'glamoured studded leather': 'glamoured studded leather armor',

  // Spells: the SRD drops the wizards' names.
  "bigby's hand": 'arcane hand',
  "drawmij's instant summons": 'instant summons',
  "evard's black tentacles": 'black tentacles',
  "leomund's secret chest": 'secret chest',
  "leomund's tiny hut": 'tiny hut',
  "melf's acid arrow": 'acid arrow',
  "mordenkainen's faithful hound": 'faithful hound',
  "mordenkainen's magnificent mansion": 'magnificent mansion',
  "mordenkainen's private sanctum": 'private sanctum',
  "mordenkainen's sword": 'arcane sword',
  "nystul's magic aura": "arcanist's magic aura",
  "otiluke's freezing sphere": 'freezing sphere',
  "otiluke's resilient sphere": 'resilient sphere',
  "otto's irresistible dance": 'irresistible dance',
  "rary's telepathic bond": 'telepathic bond',
  "tasha's hideous laughter": 'hideous laughter',
  "tenser's floating disk": 'floating disk',
};

/**
 * Both sides run through `key`, so the tables above can be written the way a
 * reader would say them. Doing it by hand is a trap: `key` turns an apostrophe
 * into a space, so "Burglar's Pack" is "burglar s pack", and an entry typed
 * with the apostrophe silently matches nothing.
 */
const ALIAS: Record<string, string> = Object.fromEntries(
  Object.entries(ALIAS_SOURCE).map(([from, to]) => [key(from), key(to)]),
);

export const srdKey = (name: string): string => {
  const k = key(name);
  return ALIAS[k] ?? k;
};
