/* Deterministic cold-start checks; no hosting requests, credentials or real waits. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const watchdog = setTimeout(() => { console.error('Readiness check did not settle'); process.exit(1); }, 5_000);

function load(file, overrides, globals) {
  const filename = path.join(__dirname, '../src/lib', file);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, { module: mod, exports: mod.exports,
    require: name => overrides[name] ?? require(name), AbortController, DOMException, ...globals }, { filename });
  return mod.exports;
}
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function setup(fetcher) {
  let now = 1, id = 0;
  const timers = new Map(), navigator = { onLine: true }, requests = [];
  const globals = {
    navigator, Date: class extends Date { static now() { return now; } },
    setTimeout(fn, ms) { timers.set(++id, { fn, at: now + ms }); return id; },
    clearTimeout(key) { timers.delete(key); },
    fetch(url, options) { requests.push({ url, options }); return fetcher(url, options); },
  };
  const policy = load('request-policy.ts', {}, globals);
  const core = load('backend-readiness.ts', { './request-policy': policy }, globals);
  async function tick(ms) {
    const end = now + ms;
    while (true) {
      const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at; timers.delete(next[0]); next[1].fn(); await flush();
    }
    now = end; await flush();
  }
  return { core, globals, requests, timers, navigator, tick };
}
function untilAborted(_url, { signal }) {
  return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')), { once: true }));
}

(async () => {
  let h = setup(async () => ({ ok: true, status: 200 })), slow = 0;
  await h.core.waitForBackend('https://api.example.invalid/api/v1', new AbortController().signal, () => slow++);
  await h.tick(5_000);
  assert.equal(slow, 0); assert.equal(h.requests.length, 1); assert.equal(h.timers.size, 0);
  assert.equal(h.requests[0].url, 'https://api.example.invalid/health');
  assert.equal(h.requests[0].options.body, undefined);

  let call = 0;
  h = setup((...args) => ++call === 1 ? untilAborted(...args) : Promise.resolve({ ok: true, status: 200 }));
  const waking = h.core.waitForBackend('https://api.example.invalid/api/v1', new AbortController().signal, () => slow++);
  await h.tick(3_000); assert.equal(slow, 1);
  await h.tick(29_000); await waking;
  assert.equal(h.requests.length, 2); assert.equal(h.timers.size, 0);

  call = 0;
  h = setup(async () => ({ ok: ++call > 6, status: call > 6 ? 200 : 503 }));
  const gatewayWake = h.core.waitForBackend('https://api.example.invalid/api/v1', new AbortController().signal, () => {});
  await flush();
  await h.tick(76_000); await gatewayWake;
  assert.equal(h.requests.length, 7); assert.equal(h.timers.size, 0);

  h = setup(untilAborted); let terminal;
  const exhausted = h.core.waitForBackend('https://api.example.invalid/api/v1', new AbortController().signal, () => {}).catch(e => { terminal = e; });
  await h.tick(120_000); await exhausted;
  assert.equal(h.requests.length, 4); assert.equal(terminal.name, 'BackendConnectionError'); assert.equal(h.timers.size, 0);

  h = setup(untilAborted);
  const cancel = new AbortController();
  const canceled = h.core.waitForBackend('https://api.example.invalid/api/v1', cancel.signal, () => {}).catch(e => e);
  cancel.abort(); assert.equal((await canceled).name, 'AbortError'); assert.equal(h.timers.size, 0);

  h = setup(async () => ({ ok: false, status: 500 }));
  await assert.rejects(h.core.waitForBackend('https://api.example.invalid/api/v1', new AbortController().signal, () => {}), { name: 'BackendConnectionError' });
  assert.equal(h.requests.length, 1); assert.equal(h.timers.size, 0);
  h.navigator.onLine = false;
  await assert.rejects(h.core.waitForBackend('https://api.example.invalid/api/v1', new AbortController().signal, () => {}), /offline/);
  assert.equal(h.requests.length, 1);
  for (const code of ['ECONNABORTED', 'ETIMEDOUT', 'ERR_NETWORK']) assert.ok(!h.core.loginConnectionMessage({ code }).includes('15000'));
  assert.equal(h.core.loginConnectionMessage({ response: { status: 401 } }), undefined);
  assert.equal(h.core.loginConnectionMessage({ response: { status: 403 } }), undefined);
  assert.ok(h.core.loginConnectionMessage({ response: { status: 503 } }));

  h = setup(async () => ({ ok: true, status: 200 }));
  let healthCalls = 0, resolve, cleanup; const states = [];
  const hook = load('use-backend-readiness.ts', {
    react: { useState: () => ['idle', value => states.push(value)], useRef: current => ({ current }), useCallback: fn => fn, useEffect: fn => { cleanup = fn(); } },
    './api': { api: { defaults: { baseURL: 'https://api.example.invalid/api/v1' } } },
    './backend-readiness': { waitForBackend(base, signal) {
      healthCalls++;
      return new Promise((done, reject) => { resolve = done; signal.addEventListener('abort', () => reject(new DOMException('Canceled', 'AbortError')), { once: true }); });
    } },
  }, h.globals).useBackendReadiness();
  const a = hook.ensureReady(), b = hook.ensureReady();
  assert.equal(a, b); assert.equal(healthCalls, 1); resolve(); await a;
  await hook.ensureReady(); assert.equal(healthCalls, 1); assert.equal(states.at(-1), 'ready');
  await h.tick(61_000);
  const stale = hook.ensureReady().catch(e => e); assert.equal(healthCalls, 2);
  cleanup(); assert.equal((await stale).name, 'AbortError');
  console.log('PASS login readiness: warm fast path, slow notice, health-only retries, 120s deadline, cancellation, offline/500 errors, shared warmup and freshness expiry');
})().then(() => clearTimeout(watchdog)).catch(error => { clearTimeout(watchdog); console.error(error); process.exitCode = 1; });
