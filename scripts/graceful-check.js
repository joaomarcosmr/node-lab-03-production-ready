// Starts your server as a child process, fires slow in-flight requests, sends SIGTERM and checks:
//  1. in-flight requests complete with 200
//  2. new connections after SIGTERM are refused (or answered 503)
//  3. the process exits with code 0 within 10s
// Configure with START_CMD (default: "npm start") and PORT (default 3100).
import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT ?? 3100);
const START_CMD = process.env.START_CMD ?? 'npm start';
const BASE = `http://localhost:${PORT}`;
const TOKEN = process.env.API_TOKEN ?? 'secret-token-123';
const IN_FLIGHT = 20;

const [cmd, ...args] = START_CMD.split(' ');
const child = spawn(cmd, args, {
  env: { ...process.env, PORT: String(PORT), API_TOKEN: TOKEN, REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379' },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true, // own process group, so we can signal only it
});
let output = '';
child.stdout.on('data', (d) => (output += d));
child.stderr.on('data', (d) => (output += d));
const exited = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })));

async function waitReady() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

const results = [];
try {
  if (!(await waitReady())) throw new Error('server did not become healthy on ' + BASE);
  console.log(`server ready on ${BASE} (pid ${child.pid}); firing ${IN_FLIGHT} slow requests...`);

  const inFlight = Array.from({ length: IN_FLIGHT }, () =>
    fetch(`${BASE}/todos/export/slow`, { headers: { authorization: `Bearer ${TOKEN}` } })
      .then(async (r) => ({ status: r.status, ok: r.status === 200 && typeof (await r.json()).count === 'number' }))
      .catch((e) => ({ status: 0, ok: false, error: e.message })),
  );

  await new Promise((r) => setTimeout(r, 500)); // make sure they are in flight
  console.log('sending SIGTERM...');
  const sigTime = Date.now();
  process.kill(-child.pid, 'SIGTERM'); // whole group (covers `npm start` -> node)

  await new Promise((r) => setTimeout(r, 300));
  let late;
  try {
    const r = await fetch(`${BASE}/health`);
    late = { status: r.status };
  } catch (e) {
    late = { refused: true };
  }

  const inFlightResults = await Promise.all(inFlight);
  const exit = await Promise.race([exited, new Promise((r) => setTimeout(() => r({ timeout: true }), 10_000))]);
  const exitMs = Date.now() - sigTime;

  const completed = inFlightResults.filter((r) => r.ok).length;
  results.push([`all ${IN_FLIGHT} in-flight requests completed with 200 (got ${completed})`, completed === IN_FLIGHT]);
  results.push([`new request after SIGTERM was refused or got 503 (got ${JSON.stringify(late)})`, late.refused || late.status === 503]);
  results.push([`process exited with code 0 within 10s (got ${JSON.stringify(exit)} after ${exitMs}ms)`, exit.code === 0 && !exit.timeout]);
  results.push([`stdout is JSON lines (structured logging)`, output.trim().split('\n').filter(Boolean).every((l) => { try { JSON.parse(l); return true; } catch { return false; } })]);
} catch (e) {
  console.error('ERROR:', e.message);
  results.push(['check ran', false]);
} finally {
  try { process.kill(-child.pid, 'SIGKILL'); } catch {}
}

console.log('');
let failed = 0;
for (const [name, ok] of results) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++; }
if (failed) { console.log('\n--- server output ---\n' + output.slice(-3000)); }
process.exit(failed ? 1 : 0);
