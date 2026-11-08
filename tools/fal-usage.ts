// Read fal's exact charge for one endpoint over a time window, from fal's usage API.
//
//   node tools/fal-usage.ts <endpoint> <start ISO> <end ISO>
//
// Needs FAL_BILLING_KEY (a read-only BILLING-preset key in ~/.config/env/global.env);
// the model key FAL_KEY cannot read usage. Widen the window by a minute or two on each
// side of the call's `started` time in fal-log.json, since usage is bucketed.

const [endpoint, start, end] = process.argv.slice(2);
if (!endpoint || !start || !end) throw new Error('usage: node tools/fal-usage.ts <endpoint> <start ISO> <end ISO>');
const key = process.env.FAL_BILLING_KEY;
if (!key) throw new Error('FAL_BILLING_KEY is not set (it lives in ~/.config/env/global.env)');

type Row = { endpoint_id: string; unit: string; quantity: number; unit_price: number; cost: number };
type Page = { time_series?: { bucket: string; results: Row[] }[]; next_cursor: string | null };

const rows: (Row & { bucket: string })[] = [];
let cursor: string | null = null;
do {
  const q = new URLSearchParams({ endpoint_id: endpoint, start, end, expand: 'time_series', timeframe: 'minute' });
  if (cursor) q.set('cursor', cursor);
  const res = await fetch(`https://api.fal.ai/v1/models/usage?${q}`, { headers: { Authorization: `Key ${key}` } });
  if (!res.ok) throw new Error(`usage ${res.status}: ${await res.text()}`);
  const page = (await res.json()) as Page;
  for (const b of page.time_series ?? []) for (const r of b.results) rows.push({ ...r, bucket: b.bucket });
  cursor = page.next_cursor;
} while (cursor);

for (const r of rows) console.log(`${r.bucket}  ${r.endpoint_id}  ${r.quantity} ${r.unit} x ${r.unit_price} = ${r.cost}`);
const total = rows.reduce((s, r) => s + r.cost, 0);
console.log(`total ${Math.round(total * 10000) / 10000} USD`);
