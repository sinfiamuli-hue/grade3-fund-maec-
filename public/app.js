// Grade 3 Fund – MAEC front end. No financial data is stored in the browser; everything comes from /api.
const $ = (q, e = document) => e.querySelector(q);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mvr = c => 'MVR ' + (c / 100).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STAT = { paid: 'Paid', partial: 'Partially paid', unpaid: 'Unpaid', overpaid: 'Overpaid' };
const badge = s => `<span class="b ${esc(s)}">${esc(STAT[s] || s[0].toUpperCase() + s.slice(1))}</span>`;
const app = $('#app'), today = new Date().toISOString().slice(0, 10);
let me = null, year = new Date().getFullYear(), view = 'dashboard', deferred = null;

async function api(path, opt = {}) {
  let r;
  try { r = await fetch('/api/' + path, { credentials: 'same-origin', ...opt, headers: { ...(typeof opt.body === 'string' ? { 'content-type': 'application/json' } : {}), ...opt.headers } }); }
  catch { const e = new Error('You are offline. Reconnect to see current figures.'); e.net = true; throw e; }
  let d = null; try { d = await r.json(); } catch { }
  if (!r.ok) { const e = new Error(d?.error || 'Request failed'); e.status = r.status; throw e; }
  return d;
}
const post = (p, b) => api(p, { method: 'POST', body: JSON.stringify(b) });
function toast(m, bad) { const t = $('#toast'); t.textContent = m; t.classList.toggle('bad', !!bad); t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), bad ? 8000 : 4000); }
const key = () => crypto.randomUUID();
const isAdmin = () => me?.role === 'admin';
const opts = (arr, sel) => arr.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(sel) ? ' selected' : ''}>${esc(l)}</option>`).join('');
const yearSel = () => `<select id="year" aria-label="Year">${opts(Array.from({ length: 5 }, (_, i) => { const y = new Date().getFullYear() - i; return [y, y + ' (Jan–Dec)']; }), year)}</select>`;

async function boot() {
  try { me = await api('me'); } catch (e) {
    if (e.net) { app.innerHTML = `<div class="card login"><h2>Offline</h2><p>${esc(e.message)}</p></div>`; return; }
    me = null;
  }
  if (!me) { $('#nav').hidden = true; $('#who').textContent = ''; $('#demoTag').hidden = true; let s = {}; try { s = await api('setup'); } catch { } return loginView(!!s.needed); }
  $('#who').textContent = `${me.name || me.email} · ${isAdmin() ? 'Administrator' : 'Parent'}`;
  $('#demoTag').hidden = !me.demo;
  const items = [['dashboard', 'Dashboard'], ['students', isAdmin() ? 'Contributions' : 'My child'], ['expenses', 'Expenses'], ['events', 'Celebrations'], ['reports', 'Reports'], ...(isAdmin() ? [['admin', 'Admin']] : []), ['account', 'Account']];
  const nav = $('#nav'); nav.hidden = false;
  nav.innerHTML = items.map(([v, l]) => `<button data-nav="${v}">${l}</button>`).join('');
  go(location.hash.slice(1) || 'dashboard');
}
function loginView(setup) {
  app.innerHTML = `<div class="card login"><h2>${setup ? 'First-time setup' : 'Sign in'}</h2>
  <form class="one" data-f="${setup ? 'setup' : 'login'}">
  ${setup ? '<label>Setup key<input name="key" type="password" required></label><label>Your name<input name="name" required></label>' : ''}
  <label>Email<input name="email" type="email" autocomplete="username" required></label>
  <label>Password${setup ? ' (10+ characters)' : ''}<input name="password" type="password" autocomplete="${setup ? 'new-password' : 'current-password'}" minlength="${setup ? 10 : 1}" required></label>
  <button>${setup ? 'Create administrator' : 'Sign in'}</button></form>
  <p class="note">Parents: your administrator creates your account. <a href="/install.html">How to install on your phone</a></p></div>`;
}
async function go(v) {
  view = typeof V[v] === 'function' ? v : 'dashboard'; location.hash = view;
  document.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('on', b.dataset.nav === view));
  app.innerHTML = '<p class="note">Loading…</p>';
  try { app.innerHTML = await V[view](); if (me.demo) app.insertAdjacentHTML('afterbegin', '<div class="banner">DEMO DATA – fictional records, not real money.</div>'); }
  catch (e) { if (e.status === 401) return boot(); app.innerHTML = `<div class="card"><h2>${e.net ? 'Offline' : 'Something went wrong'}</h2><p>${esc(e.message)}</p></div>`; }
}
const days = d => Math.ceil((new Date(d + 'T00:00:00') - Date.now()) / 864e5);
const evHtml = (list, n) => list.filter(e => e.event_date && e.status !== 'cancelled' && e.status !== 'done' && days(e.event_date) >= 0).slice(0, n).map(e => `<div class="row"><span><b>${esc(e.title)}</b><br><span class="note">${esc(e.event_date)} · ${esc(e.venue || 'Venue TBC')} · budget ${mvr(e.budget)}</span></span><span class="r"><span class="b ${esc(e.status)}">${esc(e.status)}</span><br><span class="note">${days(e.event_date) === 0 ? 'today' : 'in ' + days(e.event_date) + ' days'}</span></span></div>`).join('') || '<p class="note">No upcoming events.</p>';

const V = {};
V.dashboard = async () => {
  const [s, rc, ev] = await Promise.all([api('summary?year=' + year), api('recent?year=' + year), api('events')]);
  const mx = Math.max(1, ...s.monthly.map(m => Math.max(m.income, m.expenses))), L = 'JFMAMJJASOND';
  const chart = s.monthly.map((m, i) => { const x = 8 + i * 29, hi = m.income / mx * 110, he = m.expenses / mx * 110; return `<rect class="bi" x="${x}" y="${120 - hi}" width="11" height="${hi}" rx="2"/><rect class="be" x="${x + 12}" y="${120 - he}" width="11" height="${he}" rx="2"/><text x="${x + 11}" y="138" text-anchor="middle">${L[i]}</text>`; }).join('');
  return `<div class="bar">${yearSel()}${isAdmin() ? '<button data-nav="students">Record contribution</button><button data-nav="expenses">Record expense</button>' : ''}</div>
  <p class="note">Last updated: ${esc(new Date(s.updated).toLocaleString())}</p>
  <div class="grid"><div class="card"><div class="k">Total Fund Received</div><div class="v">${mvr(s.received)}</div></div>
  <div class="card"><div class="k">Total Expenses</div><div class="v">${mvr(s.expenses)}</div></div>
  <div class="card"><div class="k">Available Fund Balance</div><div class="v">${mvr(s.balance)}</div></div>
  <div class="card"><div class="k">Outstanding Contributions</div><div class="v">${mvr(s.outstanding)}</div></div>
  <div class="card"><div class="k">Opening balance ${s.year}</div><div class="v">${mvr(s.opening)}</div></div>
  <div class="card"><div class="k">Other income</div><div class="v">${mvr(s.other)}</div></div>
  <div class="card"><div class="k">Paid · Partial · Unpaid</div><div class="v">${s.students.paid} · ${s.students.partial} · ${s.students.unpaid}</div></div></div>
  <div class="card"><h2>Monthly income &amp; expenses</h2><svg viewBox="0 0 360 145" width="100%" role="img" aria-label="Monthly income and expenses chart">${chart}</svg><div class="note">Green: income · Orange: expenses</div></div>
  <div class="card"><h2>Upcoming celebrations</h2>${evHtml(ev, 3)}<p class="note">Tentative dates are placeholders until confirmed.</p></div>
  <div class="card"><h2>Recent transactions</h2>${rc.map(t => `<div class="row"><span>${esc(t.t)}<br><span class="note">${esc(t.d)}</span></span><span class="${t.kind === 'income' ? 'in' : 'out'}">${t.kind === 'income' ? '+' : '−'}${mvr(t.a)}</span></div>`).join('') || '<p class="note">No records yet.</p>'}</div>`;
};
V.students = async () => {
  const st = await api('students?year=' + year);
  const rows = st.map(r => `<tr><td>${esc(r.name)}</td><td class="r">${mvr(r.paid)}</td><td class="r">${mvr(r.due)}</td><td>${badge(r.status)}</td><td class="noprint">${isAdmin() ? `<button class="sm" data-act="pay" data-id="${r.id}">Pay</button> ` : ''}<button class="sm ghost" data-act="hist" data-id="${r.id}">History</button>${isAdmin() ? ` <button class="sm ghost" data-act="editst" data-id="${r.id}" data-name="${esc(r.name)}" data-exp="${r.expected / 100}">Edit</button>` : ''}</td></tr>`).join('');
  return `<div class="bar">${yearSel()}</div><div class="card"><h2>${isAdmin() ? 'Contributions' : 'Your child'}</h2><div class="sc"><table><tr><th>Student</th><th class="r">Paid</th><th class="r">Due</th><th>Status</th><th></th></tr>${rows || '<tr><td colspan="5">No records.</td></tr>'}</table></div></div>
  <div id="panel"></div>
  ${isAdmin() ? `<div class="card"><h2>Add student</h2><form data-f="student"><label>Name<input name="name" required></label><label>Expected MVR (blank = default)<input name="expected" type="number" step="0.01" min="0"></label><button>Add student</button></form></div>` : ''}`;
};
V.expenses = async () => {
  const q = new URLSearchParams({ year }); for (const k of ['q', 'from', 'to', 'category']) if (V._f?.[k]) q.set(k, V._f[k]);
  const [ex, ev] = await Promise.all([api('expenses?' + q), api('events')]);
  const cats = ['School celebrations', "Teachers' Day", "Children's Day", 'Classroom supplies', 'Gifts', 'Food', 'Printing', 'Stationery', 'Other'];
  const total = ex.filter(e => e.status === 'active').reduce((s, e) => s + e.amount, 0);
  return `<div class="bar">${yearSel()}</div>
  <div class="card noprint"><h2>Search &amp; filter</h2><form data-f="filter"><label>Search<input name="q" value="${esc(V._f?.q || '')}"></label><label>From<input name="from" type="date" value="${esc(V._f?.from || '')}"></label><label>To<input name="to" type="date" value="${esc(V._f?.to || '')}"></label><label>Category<select name="category"><option value="">All</option>${opts(cats.map(c => [c, c]), V._f?.category)}</select></label><button>Apply</button></form></div>
  <div class="card"><h2>Expenses · ${mvr(total)}</h2><div class="sc"><table><tr><th>Date</th><th>Description</th><th class="r">Amount</th><th></th></tr>${ex.map(e => `<tr class="${e.status === 'void' ? 'void' : ''}"><td>${esc(e.spent_on)}</td><td>${esc(e.description)}<br><span class="note">${esc(e.category || '')}${e.vendor ? ' · ' + esc(e.vendor) : ''}${e.status === 'void' ? ' · VOID: ' + esc(e.void_reason) : ''}</span></td><td class="r">${mvr(e.amount)}</td><td class="noprint">${e.has_receipt ? `<a href="/api/expenses/${e.id}/receipt" target="_blank" rel="noopener">Receipt</a> ` : ''}${isAdmin() && e.status === 'active' ? `<button class="sm bad" data-act="voidx" data-id="${e.id}">Void</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="4">No expenses.</td></tr>'}</table></div></div>
  ${isAdmin() ? `<div class="card"><h2>Record expense</h2><form data-f="expense"><input type="hidden" name="idem_key" value="${key()}"><label>Date<input name="spent_on" type="date" value="${today}" required></label><label>Description<input name="description" required></label><label>Category<select name="category">${opts(cats.map(c => [c, c]))}</select></label><label>Amount MVR<input name="amount" type="number" step="0.01" min="0.01" required></label><label>Vendor / recipient<input name="vendor"></label><label>Celebration<select name="event_id"><option value="">None</option>${opts(ev.map(e => [e.id, e.title]))}</select></label><label>Receipt (JPG/PNG/PDF, 5 MB)<input name="receipt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"></label><label>Notes<input name="note"></label><button>Save expense</button></form></div>` : ''}`;
};
V.events = async () => {
  const ev = await api('events');
  const form = e => `<form data-f="event"><input type="hidden" name="id" value="${e?.id || ''}"><label>Title<input name="title" value="${esc(e?.title)}" required></label><label>Date<input name="event_date" type="date" value="${esc(e?.event_date)}"></label><label>Venue<input name="venue" value="${esc(e?.venue)}"></label><label>Budget MVR<input name="budget" type="number" step="0.01" min="0" value="${e ? e.budget / 100 : ''}"></label><label>Status<select name="status">${opts(['tentative', 'confirmed', 'done', 'cancelled'].map(s => [s, s]), e?.status || 'tentative')}</select></label><label>Description<input name="description" value="${esc(e?.description)}"></label><button>${e ? 'Update' : 'Add event'}</button></form>`;
  V._ev = ev;
  return `<div class="card"><h2>Upcoming</h2>${evHtml(ev, 3)}</div><div class="card"><h2>All celebrations</h2>${ev.map(e => `<div class="row"><span><b>${esc(e.title)}</b> <span class="b ${esc(e.status)}">${esc(e.status)}</span><br><span class="note">${esc(e.event_date || 'Date TBC')} · ${esc(e.venue || '')} · ${mvr(e.budget)}</span></span>${isAdmin() ? `<button class="sm ghost" data-act="editev" data-id="${e.id}">Edit</button>` : ''}</div>`).join('') || '<p class="note">No events.</p>'}</div><div id="panel"></div>${isAdmin() ? `<div class="card"><h2>Add celebration</h2>${form()}</div>` : ''}`;
};
V.reports = async () => {
  const s = await api('summary?year=' + year);
  const ex = ['contributions', 'outstanding', 'payments', 'expenses', 'annual'].map(n => `<a href="/api/export/${n}.csv?year=${year}"><button class="ghost sm" type="button">${n[0].toUpperCase() + n.slice(1)} CSV</button></a>`).join(' ');
  return `<div class="bar noprint">${yearSel()}<button data-act="print">Print / save as PDF</button></div>
  <div class="card"><h2>Annual statement ${s.year}</h2><table><tr><td>Opening balance</td><td class="r">${mvr(s.opening)}</td></tr><tr><td>Contributions received</td><td class="r">${mvr(s.received)}</td></tr><tr><td>Other income</td><td class="r">${mvr(s.other)}</td></tr><tr><td>Total expenses</td><td class="r">−${mvr(s.expenses)}</td></tr><tr><td><b>Available balance</b></td><td class="r"><b>${mvr(s.balance)}</b></td></tr><tr><td>Outstanding contributions (not cash)</td><td class="r">${mvr(s.outstanding)}</td></tr></table><p class="note">Generated ${esc(new Date().toLocaleString())}</p></div>
  <div class="card noprint"><h2>Exports</h2><div class="bar">${ex}</div><p class="note">${isAdmin() ? '' : 'Contributions and payments exports contain only your child\u2019s records.'}</p></div>`;
};
V.admin = async () => {
  const [us, set, st, au] = await Promise.all([api('users'), api('settings'), api('students?year=' + year), api('audit')]);
  return `<div class="card"><h2>Parent accounts</h2><div class="sc"><table><tr><th>Email</th><th>Role</th><th>Child</th><th></th></tr>${us.map(u => `<tr class="${u.active ? '' : 'void'}"><td>${esc(u.email)}</td><td>${esc(u.role)}</td><td>${esc(u.student || '')}</td><td>${u.active ? `<button class="sm bad" data-act="deact" data-id="${u.id}">Deactivate</button>` : 'inactive'}</td></tr>`).join('')}</table></div>
  <h2>Create account</h2><form data-f="user"><label>Name<input name="name"></label><label>Email<input name="email" type="email" required></label><label>Temporary password (10+)<input name="password" minlength="10" required></label><label>Role<select name="role"><option value="parent">Parent</option><option value="admin">Administrator</option></select></label><label>Child (parents)<select name="student_id">${opts(st.map(s => [s.id, s.name]))}</select></label><button>Create</button></form></div>
  <div class="card"><h2>Settings</h2><form data-f="settings"><label>Default expected contribution (MVR)<input name="default_expected" type="number" step="0.01" min="0" value="${set.default_expected / 100}"></label><button>Save</button></form></div>
  <div class="card"><h2>Other income</h2><form data-f="income"><input type="hidden" name="idem_key" value="${key()}"><label>Date<input name="received_on" type="date" value="${today}" required></label><label>Description<input name="description" required></label><label>Amount MVR<input name="amount" type="number" step="0.01" min="0.01" required></label><button>Record</button></form></div>
  <div class="card"><h2>Year-end</h2><p class="note">Sets next year's opening balance to ${year}'s closing balance. Can be re-run if records change.</p><button data-act="close">Close ${year} → open ${year + 1}</button></div>
  ${me.demo ? `<div class="card"><h2>Demo data</h2><p class="note">Sample records are kept separate and never counted as real money. Remove them before entering real records.</p><button class="bad" data-act="cleardemo">Remove demo data</button></div>` : ''}
  <div class="card"><h2>Audit log (latest 100)</h2><div class="sc"><table>${au.map(a => `<tr><td>${esc(a.at)}</td><td>${esc(a.email || '')}</td><td>${esc(a.action)} ${esc(a.entity || '')} ${a.entity_id ?? ''}</td></tr>`).join('')}</table></div></div>`;
};
V.account = async () => `<div class="card"><h2>${esc(me.name || me.email)}</h2><p class="note">${esc(me.email)}</p><form class="one" data-f="pw"><label>Current password<input name="current" type="password" autocomplete="current-password" required></label><label>New password (10+)<input name="next" type="password" minlength="10" autocomplete="new-password" required></label><button>Change password</button></form><br><button class="ghost" data-act="logout">Sign out</button> <a href="/install.html">Install help</a></div>`;

const H = {
  async login(f) { await post('login', f); toast('Welcome'); await boot(); },
  async setup(f) { await post('setup', f); await post('login', { email: f.email, password: f.password }); await boot(); },
  async payment(f) { await post('payments', { ...f, student_id: +f.student_id }); toast('Payment recorded'); go('students'); },
  async student(f) { await post('students', f); toast('Student added'); go('students'); },
  async studentEdit(f) { await post('students/' + f.id, { name: f.name, expected: f.expected }); toast('Saved'); go('students'); },
  async expense(f, form) {
    const file = form.receipt?.files?.[0]; delete f.receipt;
    const r = await post('expenses', f);
    if (file && r.id) await api(`expenses/${r.id}/receipt`, { method: 'PUT', body: file, headers: { 'content-type': file.type } });
    toast(r.duplicate ? 'Already saved' : 'Expense saved'); go('expenses');
  },
  async event(f) { await post('events' + (f.id ? '/' + f.id : ''), f); toast('Saved'); go('events'); },
  async filter(f) { V._f = f; go('expenses'); },
  async user(f) { await post('users', f); toast('Account created'); go('admin'); },
  async settings(f) { await post('settings', f); toast('Saved'); },
  async income(f) { await post('income', f); toast('Recorded'); go('admin'); },
  async pw(f) { await post('me/password', f); toast('Password changed'); },
};
document.addEventListener('submit', async e => {
  const n = e.target.dataset.f; if (!n) return; e.preventDefault();
  const f = Object.fromEntries([...new FormData(e.target)].filter(([, v]) => typeof v === 'string'));
  const b = e.target.querySelector('button'); b && (b.disabled = true);
  try { await H[n](f, e.target); } catch (x) { toast(x.message, true); } finally { b && (b.disabled = false); }
});
document.addEventListener('change', e => { if (e.target.id === 'year') { year = +e.target.value; go(view); } });
document.addEventListener('click', async e => {
  const n = e.target.closest('[data-nav]'); if (n) return go(n.dataset.nav);
  const a = e.target.closest('[data-act]'); if (!a) return;
  const act = a.dataset.act, id = a.dataset.id, panel = $('#panel');
  try {
    if (act === 'logout') { await post('logout', {}); me = null; return boot(); }
    if (act === 'print') return print();
    if (act === 'pay') { const st = await api('students?year=' + year); panel.innerHTML = `<div class="card"><h2>Record payment</h2><form data-f="payment"><input type="hidden" name="idem_key" value="${key()}"><label>Student<select name="student_id">${opts(st.map(s => [s.id, s.name]), id)}</select></label><label>Amount MVR<input name="amount" type="number" step="0.01" min="0.01" required></label><label>Date<input name="paid_on" type="date" value="${today}" required></label><label>Method<select name="method"><option>Cash</option><option>Bank transfer</option><option>Other</option></select></label><label>Reference<input name="reference"></label><label>Note<input name="note"></label><button>Save payment</button></form></div>`; panel.scrollIntoView({ behavior: 'smooth' }); }
    if (act === 'hist') { const p = await api(`payments?student_id=${id}&year=${year}`); panel.innerHTML = `<div class="card"><h2>Payment history ${year}</h2>${p.map(x => `<div class="row ${x.status === 'void' ? 'void' : ''}"><span>${esc(x.paid_on)} · ${esc(x.method || '')} ${esc(x.reference || '')}<br><span class="note">${esc(x.note || '')}${x.status === 'void' ? ' VOID: ' + esc(x.void_reason) : ''}</span></span><span>${mvr(x.amount)} ${isAdmin() && x.status === 'active' ? `<button class="sm bad" data-act="voidp" data-id="${x.id}">Void</button>` : ''}</span></div>`).join('') || '<p class="note">No payments.</p>'}</div>`; panel.scrollIntoView({ behavior: 'smooth' }); }
    if (act === 'editst') { panel.innerHTML = `<div class="card"><h2>Edit student</h2><form data-f="studentEdit"><input type="hidden" name="id" value="${id}"><label>Name<input name="name" value="${esc(a.dataset.name)}" required></label><label>Expected MVR<input name="expected" type="number" step="0.01" min="0" value="${esc(a.dataset.exp)}"></label><button>Save</button></form></div>`; }
    if (act === 'editev') { const x = V._ev.find(v => v.id == id); panel.innerHTML = `<div class="card"><h2>Edit celebration</h2><form data-f="event"><input type="hidden" name="id" value="${x.id}"><label>Title<input name="title" value="${esc(x.title)}" required></label><label>Date<input name="event_date" type="date" value="${esc(x.event_date)}"></label><label>Venue<input name="venue" value="${esc(x.venue)}"></label><label>Budget MVR<input name="budget" type="number" step="0.01" min="0" value="${x.budget / 100}"></label><label>Status<select name="status">${opts(['tentative', 'confirmed', 'done', 'cancelled'].map(s => [s, s]), x.status)}</select></label><label>Description<input name="description" value="${esc(x.description)}"></label><button>Update</button></form></div>`; }
    if (act === 'voidp' || act === 'voidx') { const r = prompt('Reason for voiding (kept in the audit trail):'); if (!r) return; await post((act === 'voidp' ? 'payments/' : 'expenses/') + id + '/void', { reason: r }); toast('Voided'); go(view === 'expenses' ? 'expenses' : 'students'); }
    if (act === 'deact') { if (confirm('Deactivate this account?')) { await post(`users/${id}/deactivate`, {}); go('admin'); } }
    if (act === 'close') { if (confirm(`Close ${year} and set ${year + 1} opening balance?`)) { const r = await post('years/close', { year }); toast('Closing balance ' + mvr(r.closing)); } }
    if (act === 'cleardemo') { if (prompt('Type REMOVE DEMO to delete all sample records') === 'REMOVE DEMO') { await post('demo/clear', { confirm: 'REMOVE DEMO' }); toast('Demo data removed'); await boot(); } }
  } catch (x) { toast(x.message, true); }
});
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('#install').hidden = false; });
$('#install').onclick = async () => { if (deferred) { deferred.prompt(); await deferred.userChoice; deferred = null; $('#install').hidden = true; } };
addEventListener('online', () => boot());
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => { });
boot();
