// Grade 3 Fund – MAEC API (Cloudflare Pages Functions). All authorization happens here, server-side.
const enc = new TextEncoder();
class HE { constructor(m, s = 400) { this.m = m; this.s = s; } }
const J = (d, s = 200, h = {}) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...h } });
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const unhex = h => new Uint8Array(h.match(/../g).map(x => parseInt(x, 16)));
const rnd = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
async function pbk(pw, salt) {
  const k = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(salt), iterations: 100000 }, k, 256));
}
const cents = v => { const n = Math.round(Number(v) * 100); return Number.isFinite(n) ? n : NaN; };
const okAmt = c => Number.isInteger(c) && c > 0 && c <= 1e9;
const okDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(Date.parse(s));
const clean = (s, max = 200) => String(s ?? '').trim().slice(0, max);
const status = (paid, exp) => paid > exp ? 'overpaid' : paid === exp ? (paid > 0 ? 'paid' : 'unpaid') : paid > 0 ? 'partial' : 'unpaid';
const csv = rows => rows.map(r => r.map(v => { v = String(v ?? ''); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; }).join(',')).join('\r\n');
const money = c => (c / 100).toFixed(2);

async function getUser(req, env) {
  const m = (req.headers.get('cookie') || '').match(/(?:^|; )sid=([a-f0-9]{64})/);
  if (!m) return null;
  return env.DB.prepare("SELECT u.id,u.email,u.name,u.role,u.student_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1").bind(await sha(m[1]), Date.now()).first();
}
const aud = (env, u, action, entity, id, detail) => env.DB.prepare("INSERT INTO audit_log(user_id,action,entity,entity_id,detail) VALUES(?,?,?,?,?)").bind(u?.id ?? null, action, entity ?? null, id ?? null, JSON.stringify(detail ?? {})).run();

async function studentRows(env, dm, y, only) {
  let sql = "SELECT s.id,s.name,s.expected,COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.student_id=s.id AND p.status='active' AND p.paid_on BETWEEN ? AND ?),0) paid FROM students s WHERE s.is_demo=? AND s.active=1";
  const b = [`${y}-01-01`, `${y}-12-31`, dm];
  if (only) { sql += " AND s.id=?"; b.push(only); }
  const { results } = await env.DB.prepare(sql + " ORDER BY s.name").bind(...b).all();
  return results.map(r => ({ ...r, due: Math.max(0, r.expected - r.paid), status: status(r.paid, r.expected) }));
}
async function summary(env, dm, y) {
  const D = env.DB, a = `${y}-01-01`, b = `${y}-12-31`;
  const one = async (sql, ...v) => (await D.prepare(sql).bind(...v).first());
  const received = (await one("SELECT COALESCE(SUM(amount),0) t FROM payments WHERE status='active' AND is_demo=? AND paid_on BETWEEN ? AND ?", dm, a, b)).t;
  const other = (await one("SELECT COALESCE(SUM(amount),0) t FROM other_income WHERE status='active' AND is_demo=? AND received_on BETWEEN ? AND ?", dm, a, b)).t;
  const expenses = (await one("SELECT COALESCE(SUM(amount),0) t FROM expenses WHERE status='active' AND is_demo=? AND spent_on BETWEEN ? AND ?", dm, a, b)).t;
  const opening = (await one("SELECT amount FROM opening_balances WHERE year=? AND is_demo=?", y, dm))?.amount || 0;
  const rows = await studentRows(env, dm, y);
  const cnt = k => rows.filter(r => r.status === k).length;
  const mi = (await D.prepare("SELECT substr(paid_on,6,2) m,SUM(amount) t FROM payments WHERE status='active' AND is_demo=? AND paid_on BETWEEN ? AND ? GROUP BY m").bind(dm, a, b).all()).results;
  const mo = (await D.prepare("SELECT substr(received_on,6,2) m,SUM(amount) t FROM other_income WHERE status='active' AND is_demo=? AND received_on BETWEEN ? AND ? GROUP BY m").bind(dm, a, b).all()).results;
  const me = (await D.prepare("SELECT substr(spent_on,6,2) m,SUM(amount) t FROM expenses WHERE status='active' AND is_demo=? AND spent_on BETWEEN ? AND ? GROUP BY m").bind(dm, a, b).all()).results;
  const monthly = Array.from({ length: 12 }, (_, i) => { const k = String(i + 1).padStart(2, '0'); return { month: i + 1, income: (mi.find(r => r.m === k)?.t || 0) + (mo.find(r => r.m === k)?.t || 0), expenses: me.find(r => r.m === k)?.t || 0 }; });
  return { year: y, opening, received, other, expenses, balance: opening + received + other - expenses,
    outstanding: rows.reduce((s, r) => s + r.due, 0), expected: rows.reduce((s, r) => s + r.expected, 0),
    students: { total: rows.length, paid: cnt('paid') + cnt('overpaid'), partial: cnt('partial'), unpaid: cnt('unpaid'), overpaid: cnt('overpaid') },
    monthly, updated: new Date().toISOString() };
}

export async function onRequest({ request, env }) {
  try {
    const url = new URL(request.url), M = request.method;
    const p = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean), R = p[0], q = url.searchParams, D = env.DB;
    if (M !== 'GET' && M !== 'HEAD') { const o = request.headers.get('origin'); if (!o || new URL(o).host !== url.host) throw new HE('Bad origin', 403); }
    const body = async () => { try { return await request.json(); } catch { throw new HE('Invalid JSON'); } };

    // ---- public: first-run setup + login
    if (R === 'setup') {
      const n = (await D.prepare("SELECT COUNT(*) c FROM users").first()).c;
      if (M === 'GET') return J({ needed: n === 0 });
      if (M === 'POST') {
        if (n > 0 || !env.SETUP_KEY) throw new HE('Setup is closed', 403);
        const b = await body();
        if (clean(b.key, 200) !== env.SETUP_KEY) throw new HE('Wrong setup key', 403);
        const email = clean(b.email, 120).toLowerCase(), pw = String(b.password || '');
        if (!/^\S+@\S+\.\S+$/.test(email) || pw.length < 10) throw new HE('Valid email and a password of 10+ characters required');
        const salt = rnd(16);
        await D.prepare("INSERT INTO users(email,name,role,pw_hash,salt) VALUES(?,?,?,?,?)").bind(email, clean(b.name, 80), 'admin', await pbk(pw, salt), salt).run();
        await aud(env, null, 'setup_admin', 'user', null, { email });
        return J({ ok: true }, 201);
      }
    }
    if (R === 'login' && M === 'POST') {
      const b = await body(), email = clean(b.email, 120).toLowerCase();
      const fails = (await D.prepare("SELECT COUNT(*) c FROM audit_log WHERE action='login_fail' AND entity=? AND at>datetime('now','-15 minutes')").bind(email).first()).c;
      if (fails >= 8) throw new HE('Too many attempts. Try again in 15 minutes.', 429);
      const u = await D.prepare("SELECT * FROM users WHERE email=? AND active=1").bind(email).first();
      const h = await pbk(String(b.password || ''), u?.salt || '00'.repeat(16));
      if (!u || h !== u.pw_hash) { await aud(env, null, 'login_fail', email, null, {}); throw new HE('Invalid email or password', 401); }
      const tok = rnd(32), days = 14;
      await D.prepare("DELETE FROM sessions WHERE expires_at<?").bind(Date.now()).run();
      await D.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await sha(tok), u.id, Date.now() + days * 864e5).run();
      await aud(env, u, 'login', 'user', u.id, {});
      return J({ ok: true }, 200, { 'set-cookie': `sid=${tok}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${days * 86400}` });
    }
    if (R === 'logout' && M === 'POST') {
      const m = (request.headers.get('cookie') || '').match(/(?:^|; )sid=([a-f0-9]{64})/);
      if (m) await D.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha(m[1])).run();
      return J({ ok: true }, 200, { 'set-cookie': 'sid=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0' });
    }

    // ---- everything below needs a session
    const u = await getUser(request, env);
    if (!u) throw new HE('Not signed in', 401);
    const A = () => { if (u.role !== 'admin') throw new HE('Administrator only', 403); };
    const dm = +((await D.prepare("SELECT value FROM settings WHERE key='demo_mode'").first())?.value || 0);
    const year = +q.get('year') || new Date().getFullYear();

    if (R === 'me' && M === 'GET') return J({ ...u, demo: dm === 1, demoLabel: dm === 1 });
    if (R === 'me' && p[1] === 'password' && M === 'POST') {
      const b = await body(), row = await D.prepare("SELECT * FROM users WHERE id=?").bind(u.id).first();
      if (await pbk(String(b.current || ''), row.salt) !== row.pw_hash) throw new HE('Current password is wrong', 403);
      if (String(b.next || '').length < 10) throw new HE('New password must be 10+ characters');
      const salt = rnd(16);
      await D.prepare("UPDATE users SET pw_hash=?,salt=? WHERE id=?").bind(await pbk(b.next, salt), salt, u.id).run();
      await aud(env, u, 'password_change', 'user', u.id, {});
      return J({ ok: true });
    }
    if (R === 'summary' && M === 'GET') return J(await summary(env, dm, year));
    if (R === 'recent' && M === 'GET') {
      const a = `${year}-01-01`, b = `${year}-12-31`;
      const ex = (await D.prepare("SELECT spent_on d,description t,amount a FROM expenses WHERE status='active' AND is_demo=? AND spent_on BETWEEN ? AND ? ORDER BY spent_on DESC,id DESC LIMIT 8").bind(dm, a, b).all()).results.map(r => ({ ...r, kind: 'expense' }));
      let sql = "SELECT p.paid_on d,'Contribution – '||s.name t,p.amount a FROM payments p JOIN students s ON s.id=p.student_id WHERE p.status='active' AND p.is_demo=? AND p.paid_on BETWEEN ? AND ?";
      const bind = [dm, a, b];
      if (u.role !== 'admin') { sql += " AND p.student_id=?"; bind.push(u.student_id || 0); }
      const pa = (await D.prepare(sql + " ORDER BY p.paid_on DESC,p.id DESC LIMIT 8").bind(...bind).all()).results.map(r => ({ ...r, kind: 'income' }));
      return J([...ex, ...pa].sort((x, y) => y.d.localeCompare(x.d)).slice(0, 8));
    }

    if (R === 'students') {
      if (M === 'GET') return J(await studentRows(env, dm, year, u.role === 'admin' ? 0 : (u.student_id || -1)));
      A();
      if (M === 'POST' && !p[1]) {
        const b = await body(), name = clean(b.name, 80);
        if (!name) throw new HE('Name required');
        const def = +(await D.prepare("SELECT value FROM settings WHERE key='default_expected'").first()).value;
        const ex = b.expected === '' || b.expected == null ? def : cents(b.expected);
        if (!Number.isInteger(ex) || ex < 0) throw new HE('Invalid expected amount');
        const r = await D.prepare("INSERT INTO students(name,expected,is_demo) VALUES(?,?,?)").bind(name, ex, dm).run();
        await aud(env, u, 'student_add', 'student', r.meta.last_row_id, { name, ex });
        return J({ ok: true, id: r.meta.last_row_id }, 201);
      }
      if (M === 'POST' && p[1]) {
        const b = await body(), id = +p[1], s = await D.prepare("SELECT * FROM students WHERE id=? AND is_demo=?").bind(id, dm).first();
        if (!s) throw new HE('Not found', 404);
        const name = clean(b.name ?? s.name, 80), ex = b.expected == null ? s.expected : cents(b.expected), act = b.active == null ? s.active : (b.active ? 1 : 0);
        if (!name || !Number.isInteger(ex) || ex < 0) throw new HE('Invalid values');
        await D.prepare("UPDATE students SET name=?,expected=?,active=? WHERE id=?").bind(name, ex, act, id).run();
        await aud(env, u, 'student_edit', 'student', id, { before: s, after: { name, ex, act } });
        return J({ ok: true });
      }
    }

    if (R === 'payments') {
      if (M === 'GET') {
        let sid = +q.get('student_id') || 0;
        if (u.role !== 'admin') sid = u.student_id || -1;
        let sql = "SELECT p.id,p.student_id,s.name student,p.amount,p.paid_on,p.method,p.reference,p.note,p.status,p.void_reason FROM payments p JOIN students s ON s.id=p.student_id WHERE p.is_demo=? AND p.paid_on BETWEEN ? AND ?";
        const bind = [dm, `${year}-01-01`, `${year}-12-31`];
        if (sid) { sql += " AND p.student_id=?"; bind.push(sid); }
        if (u.role !== 'admin') sql += " AND p.status='active'";
        return J((await D.prepare(sql + " ORDER BY p.paid_on DESC,p.id DESC LIMIT 500").bind(...bind).all()).results);
      }
      A();
      if (M === 'POST' && !p[1]) {
        const b = await body(), sid = +b.student_id, c = cents(b.amount), k = clean(b.idem_key, 64);
        if (!k) throw new HE('Missing idempotency key');
        if (!okAmt(c)) throw new HE('Invalid amount');
        if (!okDate(b.paid_on)) throw new HE('Invalid date');
        if (!(await D.prepare("SELECT id FROM students WHERE id=? AND is_demo=?").bind(sid, dm).first())) throw new HE('Student not found', 404);
        try {
          const r = await D.prepare("INSERT INTO payments(student_id,amount,paid_on,method,reference,note,idem_key,is_demo,created_by) VALUES(?,?,?,?,?,?,?,?,?)").bind(sid, c, b.paid_on, clean(b.method, 40), clean(b.reference, 80), clean(b.note, 300), k, dm, u.id).run();
          await aud(env, u, 'payment_add', 'payment', r.meta.last_row_id, { sid, c, date: b.paid_on });
          return J({ ok: true, id: r.meta.last_row_id }, 201);
        } catch (e) { if (/UNIQUE/i.test(String(e.message))) return J({ ok: true, duplicate: true }); throw e; }
      }
      if (M === 'POST' && p[2] === 'void') {
        const b = await body(), reason = clean(b.reason, 200);
        if (reason.length < 3) throw new HE('A reason is required');
        const r = await D.prepare("UPDATE payments SET status='void',void_reason=? WHERE id=? AND status='active' AND is_demo=?").bind(reason, +p[1], dm).run();
        if (!r.meta.changes) throw new HE('Not found', 404);
        await aud(env, u, 'payment_void', 'payment', +p[1], { reason });
        return J({ ok: true });
      }
    }

    if (R === 'income') {
      A();
      if (M === 'POST' && !p[1]) {
        const b = await body(), c = cents(b.amount), k = clean(b.idem_key, 64), d = clean(b.description, 200);
        if (!k || !d || !okAmt(c) || !okDate(b.received_on)) throw new HE('Description, valid amount and date required');
        try {
          const r = await D.prepare("INSERT INTO other_income(received_on,description,amount,idem_key,is_demo,created_by) VALUES(?,?,?,?,?,?)").bind(b.received_on, d, c, k, dm, u.id).run();
          await aud(env, u, 'income_add', 'income', r.meta.last_row_id, { c });
          return J({ ok: true }, 201);
        } catch (e) { if (/UNIQUE/i.test(String(e.message))) return J({ ok: true, duplicate: true }); throw e; }
      }
    }

    if (R === 'expenses') {
      if (M === 'GET' && !p[1]) {
        let sql = "SELECT id,spent_on,description,category,amount,vendor,note,event_id,status,void_reason,(receipt_key IS NOT NULL) has_receipt FROM expenses WHERE is_demo=? AND spent_on BETWEEN ? AND ?";
        const bind = [dm, q.get('from') && okDate(q.get('from')) ? q.get('from') : `${year}-01-01`, q.get('to') && okDate(q.get('to')) ? q.get('to') : `${year}-12-31`];
        if (u.role !== 'admin') sql += " AND status='active'";
        if (q.get('category')) { sql += " AND category=?"; bind.push(q.get('category')); }
        if (q.get('q')) { sql += " AND (description LIKE ? OR vendor LIKE ?)"; const l = `%${clean(q.get('q'), 60)}%`; bind.push(l, l); }
        return J((await D.prepare(sql + " ORDER BY spent_on DESC,id DESC LIMIT 500").bind(...bind).all()).results.map(r => u.role === 'admin' ? r : { ...r, has_receipt: 0, note: '' }));
      }
      A();
      if (M === 'POST' && !p[1]) {
        const b = await body(), c = cents(b.amount), k = clean(b.idem_key, 64), d = clean(b.description, 200);
        if (!k || !d || !okAmt(c) || !okDate(b.spent_on)) throw new HE('Description, valid amount and date required');
        const ev = b.event_id ? +b.event_id : null;
        try {
          const r = await D.prepare("INSERT INTO expenses(spent_on,description,category,amount,vendor,note,event_id,idem_key,is_demo,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(b.spent_on, d, clean(b.category, 60), c, clean(b.vendor, 100), clean(b.note, 300), ev, k, dm, u.id).run();
          await aud(env, u, 'expense_add', 'expense', r.meta.last_row_id, { c, d });
          return J({ ok: true, id: r.meta.last_row_id }, 201);
        } catch (e) { if (/UNIQUE/i.test(String(e.message))) { const x = await D.prepare("SELECT id FROM expenses WHERE idem_key=?").bind(k).first(); return J({ ok: true, duplicate: true, id: x?.id }); } throw e; }
      }
      if (M === 'POST' && p[2] === 'void') {
        const b = await body(), reason = clean(b.reason, 200);
        if (reason.length < 3) throw new HE('A reason is required');
        const r = await D.prepare("UPDATE expenses SET status='void',void_reason=? WHERE id=? AND status='active' AND is_demo=?").bind(reason, +p[1], dm).run();
        if (!r.meta.changes) throw new HE('Not found', 404);
        await aud(env, u, 'expense_void', 'expense', +p[1], { reason });
        return J({ ok: true });
      }
      if (M === 'PUT' && p[2] === 'receipt') {
        const ct = (request.headers.get('content-type') || '').split(';')[0];
        if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(ct)) throw new HE('Receipt must be JPG, PNG, WebP or PDF');
        const buf = await request.arrayBuffer();
        if (buf.byteLength > 5 * 1024 * 1024 || !buf.byteLength) throw new HE('Receipt must be under 5 MB');
        const ex = await D.prepare("SELECT id FROM expenses WHERE id=? AND is_demo=?").bind(+p[1], dm).first();
        if (!ex) throw new HE('Not found', 404);
        const key = `receipts/${+p[1]}-${rnd(8)}`;
        await env.RECEIPTS.put(key, buf, { httpMetadata: { contentType: ct } });
        await D.prepare("UPDATE expenses SET receipt_key=?,receipt_type=? WHERE id=?").bind(key, ct, +p[1]).run();
        await aud(env, u, 'receipt_upload', 'expense', +p[1], { key });
        return J({ ok: true });
      }
      if (M === 'GET' && p[2] === 'receipt') {
        const ex = await D.prepare("SELECT receipt_key,receipt_type FROM expenses WHERE id=?").bind(+p[1]).first();
        if (!ex?.receipt_key) throw new HE('No receipt', 404);
        const o = await env.RECEIPTS.get(ex.receipt_key);
        if (!o) throw new HE('No receipt', 404);
        return new Response(o.body, { headers: { 'content-type': ex.receipt_type, 'cache-control': 'private, no-store', 'content-disposition': 'inline', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox" } });
      }
    }

    if (R === 'events') {
      if (M === 'GET') return J((await D.prepare("SELECT * FROM events WHERE is_demo=? ORDER BY event_date").bind(dm).all()).results);
      A();
      if (M === 'POST') {
        const b = await body(), t = clean(b.title, 100), bud = b.budget === '' || b.budget == null ? 0 : cents(b.budget);
        if (!t || !Number.isInteger(bud) || bud < 0) throw new HE('Title and a valid budget required');
        if (b.event_date && !okDate(b.event_date)) throw new HE('Invalid date');
        if (!['confirmed', 'tentative', 'cancelled', 'done'].includes(b.status)) throw new HE('Invalid status');
        if (p[1]) {
          const r = await D.prepare("UPDATE events SET title=?,event_date=?,description=?,venue=?,budget=?,status=? WHERE id=? AND is_demo=?").bind(t, b.event_date || null, clean(b.description, 300), clean(b.venue, 100), bud, b.status, +p[1], dm).run();
          if (!r.meta.changes) throw new HE('Not found', 404);
          await aud(env, u, 'event_edit', 'event', +p[1], { t });
          return J({ ok: true });
        }
        const r = await D.prepare("INSERT INTO events(title,event_date,description,venue,budget,status,is_demo) VALUES(?,?,?,?,?,?,?)").bind(t, b.event_date || null, clean(b.description, 300), clean(b.venue, 100), bud, b.status, dm).run();
        await aud(env, u, 'event_add', 'event', r.meta.last_row_id, { t });
        return J({ ok: true }, 201);
      }
    }

    if (R === 'export') {
      const name = (p[1] || '').replace(/\.csv$/, ''), st = await studentRows(env, dm, year, u.role === 'admin' ? 0 : (u.student_id || -1));
      let rows;
      if (name === 'contributions') rows = [['Student', 'Expected (MVR)', 'Paid (MVR)', 'Due (MVR)', 'Status'], ...st.map(r => [r.name, money(r.expected), money(r.paid), money(r.due), r.status])];
      else if (name === 'outstanding') rows = [['Student', 'Due (MVR)'], ...st.filter(r => r.due > 0).map(r => [r.name, money(r.due)])];
      else if (name === 'payments') {
        let sql = "SELECT s.name,p.paid_on,p.amount,p.method,p.reference,p.status FROM payments p JOIN students s ON s.id=p.student_id WHERE p.is_demo=? AND p.paid_on BETWEEN ? AND ?";
        const bind = [dm, `${year}-01-01`, `${year}-12-31`];
        if (u.role !== 'admin') { sql += " AND p.student_id=? AND p.status='active'"; bind.push(u.student_id || -1); }
        rows = [['Student', 'Date', 'Amount (MVR)', 'Method', 'Reference', 'Status'], ...(await D.prepare(sql + " ORDER BY p.paid_on").bind(...bind).all()).results.map(r => [r.name, r.paid_on, money(r.amount), r.method, r.reference, r.status])];
      } else if (name === 'expenses') {
        rows = [['Date', 'Description', 'Category', 'Vendor', 'Amount (MVR)', 'Status'], ...(await D.prepare("SELECT * FROM expenses WHERE is_demo=? AND spent_on BETWEEN ? AND ?" + (u.role === 'admin' ? "" : " AND status='active'") + " ORDER BY spent_on").bind(dm, `${year}-01-01`, `${year}-12-31`).all()).results.map(r => [r.spent_on, r.description, r.category, r.vendor, money(r.amount), r.status])];
      } else if (name === 'annual') {
        const s = await summary(env, dm, year);
        rows = [['Item', 'MVR'], ['Opening balance', money(s.opening)], ['Contributions received', money(s.received)], ['Other income', money(s.other)], ['Total expenses', money(s.expenses)], ['Available balance', money(s.balance)], ['Outstanding contributions', money(s.outstanding)]];
      } else throw new HE('Unknown export', 404);
      if (u.role !== 'admin' && !['contributions', 'outstanding', 'payments', 'expenses', 'annual'].includes(name)) throw new HE('Forbidden', 403);
      return new Response(csv(rows), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="grade3-${name}-${year}${dm ? '-DEMO' : ''}.csv"`, 'cache-control': 'private, no-store' } });
    }

    // ---- admin only below
    A();
    if (R === 'users') {
      if (M === 'GET') return J((await D.prepare("SELECT u.id,u.email,u.name,u.role,u.active,s.name student FROM users u LEFT JOIN students s ON s.id=u.student_id ORDER BY u.id").all()).results);
      if (M === 'POST' && !p[1]) {
        const b = await body(), email = clean(b.email, 120).toLowerCase(), pw = String(b.password || ''), role = b.role === 'admin' ? 'admin' : 'parent';
        if (!/^\S+@\S+\.\S+$/.test(email) || pw.length < 10) throw new HE('Valid email and a password of 10+ characters required');
        let sid = null;
        if (role === 'parent') { sid = +b.student_id; if (!(await D.prepare("SELECT id FROM students WHERE id=?").bind(sid).first())) throw new HE('Choose the child this parent belongs to'); }
        const salt = rnd(16);
        try { await D.prepare("INSERT INTO users(email,name,role,student_id,pw_hash,salt) VALUES(?,?,?,?,?,?)").bind(email, clean(b.name, 80), role, sid, await pbk(pw, salt), salt).run(); }
        catch (e) { if (/UNIQUE/i.test(String(e.message))) throw new HE('That email already exists'); throw e; }
        await aud(env, u, 'user_add', 'user', null, { email, role });
        return J({ ok: true }, 201);
      }
      if (M === 'POST' && p[2] === 'deactivate') {
        if (+p[1] === u.id) throw new HE('You cannot deactivate yourself');
        await D.prepare("UPDATE users SET active=0 WHERE id=?").bind(+p[1]).run();
        await D.prepare("DELETE FROM sessions WHERE user_id=?").bind(+p[1]).run();
        await aud(env, u, 'user_deactivate', 'user', +p[1], {});
        return J({ ok: true });
      }
    }
    if (R === 'settings') {
      if (M === 'GET') return J({ default_expected: +(await D.prepare("SELECT value FROM settings WHERE key='default_expected'").first()).value, demo: dm === 1 });
      if (M === 'POST') {
        const c = cents((await body()).default_expected);
        if (!Number.isInteger(c) || c < 0) throw new HE('Invalid amount');
        await D.prepare("UPDATE settings SET value=? WHERE key='default_expected'").bind(String(c)).run();
        await aud(env, u, 'settings', 'settings', null, { default_expected: c });
        return J({ ok: true });
      }
    }
    if (R === 'years' && p[1] === 'close' && M === 'POST') {
      const y = +(await body()).year, s = await summary(env, dm, y);
      await D.prepare("INSERT INTO opening_balances(year,is_demo,amount,note) VALUES(?,?,?,?) ON CONFLICT(year,is_demo) DO UPDATE SET amount=excluded.amount,note=excluded.note").bind(y + 1, dm, s.balance, `Closing of ${y}`).run();
      await aud(env, u, 'year_close', 'year', y, { closing: s.balance });
      return J({ ok: true, closing: s.balance, next_opening_year: y + 1 });
    }
    if (R === 'demo' && p[1] === 'clear' && M === 'POST') {
      if ((await body()).confirm !== 'REMOVE DEMO') throw new HE('Type REMOVE DEMO to confirm');
      await D.batch(['payments', 'expenses', 'other_income', 'events', 'opening_balances', 'students'].map(t => D.prepare(`DELETE FROM ${t} WHERE is_demo=1`)).concat(D.prepare("UPDATE settings SET value='0' WHERE key='demo_mode'")));
      await aud(env, u, 'demo_clear', 'demo', null, {});
      return J({ ok: true });
    }
    if (R === 'audit' && M === 'GET') return J((await D.prepare("SELECT a.at,a.action,a.entity,a.entity_id,a.detail,u.email FROM audit_log a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 100").all()).results);
    throw new HE('Not found', 404);
  } catch (e) {
    if (e instanceof HE) return J({ error: e.m }, e.s);
    console.error(e);
    return J({ error: 'Server error' }, 500);
  }
}
