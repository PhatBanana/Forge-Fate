import { CLASSES, subclassesFor } from '../src/data/classes';
const rows = CLASSES.map((c) => ({
  id: c.id,
  all: c.subclasses.length,
  y2014: subclassesFor(c, '2014').length,
  y2024: subclassesFor(c, '2024').length,
}));
console.log('class'.padEnd(12), 'all', '2014', '2024');
for (const r of rows) console.log(r.id.padEnd(12), String(r.all).padStart(3), String(r.y2014).padStart(4), String(r.y2024).padStart(4));
for (const k of ['all', 'y2014', 'y2024'] as const) {
  const v = rows.map((r) => r[k]).filter((x) => x > 0);
  console.log(k, 'total', rows.reduce((a, b) => a + b[k], 0), 'min', Math.min(...v), 'max', Math.max(...v), 'spread', Math.max(...v) - Math.min(...v));
}
