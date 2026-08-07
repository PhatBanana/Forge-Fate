export type ArmorCategory = 'none' | 'light' | 'medium' | 'heavy';

export interface Armor {
  id: string;
  name: string;
  category: ArmorCategory;
  /** AC before any Dexterity contribution. */
  baseAc: number;
  /** Max Dexterity modifier that applies. null means uncapped. */
  dexCap: number | null;
  /** Strength score needed to avoid the 10 ft. speed penalty. */
  strengthRequirement?: number;
  /** Disadvantage on Stealth checks while worn. */
  stealthDisadvantage?: boolean;
  weight: number;
  /** In copper pieces. Zero for "no armor", which costs nothing to not wear. */
  cost: number;
}

/** The PHB armor table. */
export const ARMOR: Armor[] = [
  { id: 'none', name: 'No armor', category: 'none', baseAc: 10, dexCap: null, weight: 0, cost: 0 },

  { id: 'padded', name: 'Padded', category: 'light', baseAc: 11, dexCap: null, stealthDisadvantage: true, weight: 8, cost: 500 },
  { id: 'leather', name: 'Leather', category: 'light', baseAc: 11, dexCap: null, weight: 10, cost: 1000 },
  { id: 'studded-leather', name: 'Studded leather', category: 'light', baseAc: 12, dexCap: null, weight: 13, cost: 4500 },

  { id: 'hide', name: 'Hide', category: 'medium', baseAc: 12, dexCap: 2, weight: 12, cost: 1000 },
  { id: 'chain-shirt', name: 'Chain shirt', category: 'medium', baseAc: 13, dexCap: 2, weight: 20, cost: 5000 },
  { id: 'scale-mail', name: 'Scale mail', category: 'medium', baseAc: 14, dexCap: 2, stealthDisadvantage: true, weight: 45, cost: 5000 },
  { id: 'breastplate', name: 'Breastplate', category: 'medium', baseAc: 14, dexCap: 2, weight: 20, cost: 40000 },
  { id: 'half-plate', name: 'Half plate', category: 'medium', baseAc: 15, dexCap: 2, stealthDisadvantage: true, weight: 40, cost: 75000 },

  { id: 'ring-mail', name: 'Ring mail', category: 'heavy', baseAc: 14, dexCap: 0, stealthDisadvantage: true, weight: 40, cost: 3000 },
  { id: 'chain-mail', name: 'Chain mail', category: 'heavy', baseAc: 16, dexCap: 0, strengthRequirement: 13, stealthDisadvantage: true, weight: 55, cost: 7500 },
  { id: 'splint', name: 'Splint', category: 'heavy', baseAc: 17, dexCap: 0, strengthRequirement: 15, stealthDisadvantage: true, weight: 60, cost: 20000 },
  { id: 'plate', name: 'Plate', category: 'heavy', baseAc: 18, dexCap: 0, strengthRequirement: 15, stealthDisadvantage: true, weight: 65, cost: 150000 },
];

export const ARMOR_BY_ID: Record<string, Armor> = Object.fromEntries(
  ARMOR.map((a) => [a.id, a]),
);

export const SHIELD_AC = 2;

export const ARMOR_CATEGORY_LABEL: Record<ArmorCategory, string> = {
  none: 'Unarmored',
  light: 'Light armor',
  medium: 'Medium armor',
  heavy: 'Heavy armor',
};
