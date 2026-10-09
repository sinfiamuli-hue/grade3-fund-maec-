-- Grade 3 Fund – MAEC schema (Cloudflare D1 / SQLite). All money is stored as integer cents (laari).
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, name TEXT,
  role TEXT NOT NULL CHECK(role IN('admin','parent')), student_id INTEGER,
  pw_hash TEXT NOT NULL, salt TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions(
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS students(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
  expected INTEGER NOT NULL DEFAULT 0 CHECK(expected>=0), is_demo INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS payments(
  id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL REFERENCES students(id),
  amount INTEGER NOT NULL CHECK(amount>0), paid_on TEXT NOT NULL, method TEXT, reference TEXT, note TEXT,
  idem_key TEXT UNIQUE NOT NULL, is_demo INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','void')), void_reason TEXT,
  created_by INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS ix_pay ON payments(student_id, paid_on);
CREATE TABLE IF NOT EXISTS expenses(
  id INTEGER PRIMARY KEY AUTOINCREMENT, spent_on TEXT NOT NULL, description TEXT NOT NULL, category TEXT,
  amount INTEGER NOT NULL CHECK(amount>0), vendor TEXT, note TEXT, receipt_key TEXT, receipt_type TEXT,
  event_id INTEGER, idem_key TEXT UNIQUE NOT NULL, is_demo INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','void')), void_reason TEXT,
  created_by INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS ix_exp ON expenses(spent_on);
CREATE TABLE IF NOT EXISTS other_income(
  id INTEGER PRIMARY KEY AUTOINCREMENT, received_on TEXT NOT NULL, description TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount>0), idem_key TEXT UNIQUE NOT NULL, is_demo INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','void')), void_reason TEXT,
  created_by INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS events(
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, event_date TEXT, description TEXT, venue TEXT,
  budget INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'tentative'
  CHECK(status IN('confirmed','tentative','cancelled','done')), is_demo INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS opening_balances(
  year INTEGER NOT NULL, is_demo INTEGER NOT NULL DEFAULT 0, amount INTEGER NOT NULL DEFAULT 0, note TEXT,
  PRIMARY KEY(year,is_demo));
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS audit_log(
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, user_id INTEGER,
  action TEXT NOT NULL, entity TEXT, entity_id INTEGER, detail TEXT);
INSERT OR IGNORE INTO settings(key,value) VALUES('default_expected','60000'),('demo_mode','0');
