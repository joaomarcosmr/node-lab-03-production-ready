// Expects TWO instances of your server already running (PORT=3001 and PORT=3002) sharing Postgres + Redis.
import 'dotenv/config';
const A = process.env.BASE_A ?? 'http://localhost:3001';
const B = process.env.BASE_B ?? 'http://localhost:3002';
const TOKEN = process.env.API_TOKEN ?? 'secret-token-123';
const H = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };
const results = [];
try {
  for (const base of [A, B]) { const r = await fetch(`${base}/health`); if (!r.ok) throw new Error(`${base}/health not ok`); }
  const title = `task-${Date.now()}`;
  const created = await (await fetch(`${A}/tasks`, { method: 'POST', headers: H, body: JSON.stringify({ title }) })).json();
  const fromB = await (await fetch(`${B}/tasks/${created.id}`, { headers: H })).json();
  results.push(['task created on A is readable on B', fromB?.title === title]);
  await fetch(`${B}/tasks/${created.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ done: true }) });
  const fromA = await (await fetch(`${A}/tasks/${created.id}`, { headers: H })).json();
  results.push(['update on B is visible on A', fromA?.done === true]);
  const ids = await Promise.all(Array.from({ length: 40 }, (_, i) => fetch(`${i % 2 ? A : B}/tasks`, { method: 'POST', headers: H, body: JSON.stringify({ title: `bulk-${i}` }) }).then((r) => r.json()).then((t) => t.id)));
  results.push(['40 concurrent creates across both instances → unique ids', new Set(ids).size === ids.length && ids.every((i) => Number.isInteger(i))]);
  const del = await fetch(`${B}/tasks/${created.id}`, { method: 'DELETE', headers: H });
  const gone = await fetch(`${A}/tasks/${created.id}`, { headers: H });
  results.push(['delete on B → 404 on A', del.status < 300 && gone.status === 404]);
  const isErrorShape = async (r) => { try { const b = await r.json(); return typeof b?.error?.code === 'string' && typeof b?.error?.message === 'string'; } catch { return false; } };
  const noAuth = await fetch(`${A}/tasks`);
  const notFound = await fetch(`${A}/tasks/999999999`, { headers: H });
  const bad = await fetch(`${A}/tasks`, { method: 'POST', headers: H, body: JSON.stringify({}) });
  results.push(['401 / 404 / 400 all return { error: { code, message } }', noAuth.status === 401 && notFound.status === 404 && bad.status === 400 && (await isErrorShape(noAuth)) && (await isErrorShape(notFound)) && (await isErrorShape(bad))]);
  let limitedOnA = false;
  for (let i = 0; i < 130 && !limitedOnA; i++) { const r = await fetch(`${A}/tasks`, { headers: H }); if (r.status === 429) limitedOnA = true; }
  const onB = await fetch(`${B}/tasks`, { headers: H });
  results.push(['rate limit reached on A is enforced on B too (shared counter in Redis)', limitedOnA && onB.status === 429]);
} catch (e) {
  console.error('ERROR:', e.message);
  results.push(['check ran', false]);
}
console.log('');
let failed = 0;
for (const [name, ok] of results) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++; }
process.exit(failed ? 1 : 0);
