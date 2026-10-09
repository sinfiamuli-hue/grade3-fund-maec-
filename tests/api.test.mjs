// Run: node --experimental-sqlite tests/api.test.mjs   (Node 22+). Tests the API against an in-memory SQLite shim of D1.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const { onRequest } = await import('../functions/api/[[path]].js');
const db = new DatabaseSync(':memory:');
db.exec(readFileSync('db/schema.sql', 'utf8')); db.exec(readFileSync('db/seed_demo.sql', 'utf8'));
const stmt = sql => { let b = []; const s = { bind: (...a) => (b = a, s),
  first: async () => db.prepare(sql).get(...b) ?? null, all: async () => ({ results: db.prepare(sql).all(...b) }),
  run: async () => { const r = db.prepare(sql).run(...b); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; } }; return s; };
const env = { DB: { prepare: stmt, batch: async l => { for (const s of l) await s.run(); } }, RECEIPTS: { put: async () => {}, get: async () => null }, SETUP_KEY: 'k' };
let cookie = '';
const call = async (m, p, body, ck = cookie) => { const r = await onRequest({ env, request: new Request('https://x.test/api/' + p, { method: m, headers: { origin: 'https://x.test', cookie: ck, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }) });
  const sc = r.headers.get('set-cookie'); if (sc && p === 'login') cookie = sc.split(';')[0]; return { s: r.status, d: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text() }; };
// unauthenticated blocked
assert.equal((await call('GET', 'summary')).s, 401);
// setup + login
assert.equal((await call('GET', 'setup')).d.needed, true);
assert.equal((await call('POST', 'setup', { key: 'bad', email: 'a@b.mv', password: 'longpassword1' })).s, 403);
assert.equal((await call('POST', 'setup', { key: 'k', email: 'a@b.mv', password: 'longpassword1' })).s, 201);
assert.equal((await call('POST', 'setup', { key: 'k', email: 'c@b.mv', password: 'longpassword1' })).s, 403);
assert.equal((await call('POST', 'login', { email: 'a@b.mv', password: 'wrong' })).s, 401);
assert.equal((await call('POST', 'login', { email: 'a@b.mv', password: 'longpassword1' })).s, 200);
const adminCk = cookie;
// demo summary: calculations from records (demo plan: 12 paid fully, etc.)
let s = (await call('GET', 'summary?year=2026')).d;
const paidTotal = db.prepare("SELECT SUM(amount) t FROM payments WHERE paid_on LIKE '2026%'").get().t;
assert.equal(s.received, paidTotal); assert.equal(s.expenses, 42000+135050+18000+64000);
assert.equal(s.balance, s.opening + s.received + s.other - s.expenses);
assert.ok(s.students.partial > 0 && s.students.unpaid > 0 && s.students.overpaid > 0);
// expected 60000/student: outstanding ignores overpayment
const rows = (await call('GET', 'students?year=2026')).d;
assert.equal(s.outstanding, rows.reduce((a, r) => a + Math.max(0, 60000 - r.paid), 0));
// duplicate prevention
const pay = { student_id: 4, amount: '100.00', paid_on: '2026-10-01', idem_key: 'abc' };
assert.equal((await call('POST', 'payments', pay)).s, 201);
assert.equal((await call('POST', 'payments', pay)).d.duplicate, true);
assert.equal((await call('GET', 'summary?year=2026')).d.received, paidTotal + 10000);
assert.equal((await call('POST', 'payments', { ...pay, idem_key: 'z', amount: '-5' })).s, 400);
// void keeps record + audit
const pid = db.prepare("SELECT id FROM payments WHERE idem_key='abc'").get().id;
assert.equal((await call('POST', `payments/${pid}/void`, { reason: 'x' })).s, 400);
assert.equal((await call('POST', `payments/${pid}/void`, { reason: 'entered twice' })).s, 200);
assert.equal(db.prepare("SELECT COUNT(*) c FROM payments WHERE id=?").get(pid).c, 1);
assert.equal((await call('GET', 'summary?year=2026')).d.received, paidTotal);
assert.ok(db.prepare("SELECT COUNT(*) c FROM audit_log WHERE action='payment_void'").get().c === 1);
// parent privacy
assert.equal((await call('POST', 'users', { email: 'p@b.mv', password: 'parentpass12', role: 'parent', student_id: 1 })).s, 201);
cookie = ''; await call('POST', 'login', { email: 'p@b.mv', password: 'parentpass12' });
const ps = (await call('GET', 'students?year=2026')).d; assert.equal(ps.length, 1); assert.equal(ps[0].id, 1);
assert.equal((await call('GET', 'payments?student_id=2&year=2026')).d.every(p => p.student_id === 1), true);
assert.equal((await call('POST', 'payments', { ...pay, idem_key: 'q' })).s, 403);
assert.equal((await call('POST', 'expenses', {})).s, 403);
assert.equal((await call('GET', 'users')).s, 403);
assert.equal((await call('GET', 'audit')).s, 403);
assert.ok(!(await call('GET', 'export/payments.csv?year=2026')).d.includes('Ibrahim Hassan'));
assert.equal((await call('GET', 'summary?year=2026')).s, 200); // class totals allowed
// CSRF origin check
const bad = await onRequest({ env, request: new Request('https://x.test/api/logout', { method: 'POST', headers: { origin: 'https://evil.test', cookie } }) });
assert.equal(bad.status, 403);
// logout invalidates session
await call('POST', 'logout', {}); assert.equal((await call('GET', 'me')).s, 401);
// year close + carry-forward, then demo clear
cookie = adminCk; const cl = (await call('POST', 'years/close', { year: 2026 })).d;
assert.equal((await call('GET', 'summary?year=2027')).d.opening, cl.closing);
assert.equal((await call('POST', 'demo/clear', { confirm: 'no' })).s, 400);
assert.equal((await call('POST', 'demo/clear', { confirm: 'REMOVE DEMO' })).s, 200);
assert.equal((await call('GET', 'summary?year=2026')).d.received, 0);
console.log('ALL API TESTS PASSED');
