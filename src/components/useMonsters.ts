import { useEffect, useState } from 'react';
import type { Monster } from '../data/monsters';
import { loadMonsters } from '../data/monsters';

/**
 * The SRD bestiary, fetched once on first use.
 *
 * Shared by the Table and the workshop rather than written twice, because
 * `loadMonsters` caches its promise: the second caller gets the same half
 * megabyte without a second request, and `loading` is what tells a list apart
 * from an empty one - which is the difference between "still fetching" and
 * "that monster is gone", and 11.3 depends on it.
 */
export function useMonsters(): { monsters: Monster[]; loading: boolean } {
  const [monsters, setMonsters] = useState<Monster[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    loadMonsters().then((all) => {
      if (!live) return;
      setMonsters(all);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, []);

  return { monsters, loading };
}
