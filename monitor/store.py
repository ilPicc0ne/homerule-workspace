"""Transactional snapshots and retryable work queue. All state stays under build/."""
import contextlib
import datetime as dt
import fcntl
import hashlib
import json
import sqlite3
from pathlib import Path


def stamp():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def digest(value):
    return hashlib.sha256(value if isinstance(value, bytes) else value.encode()).hexdigest()


@contextlib.contextmanager
def locked(root):
    root = Path(root)
    root.mkdir(parents=True, exist_ok=True)
    with (root / "monitor.lock").open("a") as f:
        try:
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError("Another monitor run holds this state directory") from None
        try:
            yield
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)


class Store:
    def __init__(self, root):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(str(self.root / "monitor.sqlite3"))
        self.db.row_factory = sqlite3.Row
        self.db.executescript('''
        CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS snapshots (
            id TEXT PRIMARY KEY, document TEXT NOT NULL, source TEXT NOT NULL,
            observed_at TEXT NOT NULL, text TEXT NOT NULL, metadata TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, snapshot TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY, document TEXT NOT NULL, source TEXT NOT NULL,
            before_id TEXT, after_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
            error TEXT, created_at TEXT NOT NULL, report TEXT);
        ''')
        columns = {row[1] for row in self.db.execute("PRAGMA table_info(events)")}
        for name, definition in (("attempts", "INTEGER NOT NULL DEFAULT 0"), ("retry_after", "TEXT")):
            if name not in columns:
                self.db.execute(f"ALTER TABLE events ADD COLUMN {name} {definition}")
        self.db.commit()

    def close(self):
        self.db.close()

    def get(self, key, default=None):
        r = self.db.execute("SELECT value FROM state WHERE key=?", (key,)).fetchone()
        return json.loads(r[0]) if r else default

    def put(self, key, value):
        with self.db:
            self.db.execute("INSERT OR REPLACE INTO state VALUES (?,?)", (key, json.dumps(value)))

    def snapshot(self, sid):
        r = self.db.execute("SELECT * FROM snapshots WHERE id=?", (sid,)).fetchone()
        if not r:
            raise ValueError("Unknown snapshot")
        out = dict(r)
        out["metadata"] = json.loads(out["metadata"])
        return out

    def observe(self, source, document, text, metadata, now):
        """Only legal text/status feeds identity; acquisition timestamps do not."""
        sid = digest(document + "\0" + text)
        prior = self.db.execute("SELECT snapshot FROM documents WHERE id=?", (document,)).fetchone()
        before = prior[0] if prior else None
        if before == sid:
            return None
        # Reverting A -> B -> A remains an event; returning to the same state later also does.
        with self.db:
            self.db.execute("INSERT OR IGNORE INTO snapshots VALUES (?,?,?,?,?,?)",
                            (sid, document, source, now, text, json.dumps(metadata)))
            cursor = self.db.execute("SELECT count(*) FROM events WHERE document=?", (document,)).fetchone()[0]
            eid = digest(f"{document}:{cursor}:{before}:{sid}")
            self.db.execute("INSERT INTO events (id,document,source,before_id,after_id,created_at) VALUES (?,?,?,?,?,?)",
                            (eid, document, source, before, sid, now))
            self.db.execute("INSERT OR REPLACE INTO documents VALUES (?,?)", (document, sid))
        return eid

    def events(self, pending=False):
        where = " WHERE status IN ('pending','failed')" if pending else ""
        return [dict(r) for r in self.db.execute("SELECT * FROM events" + where + " ORDER BY rowid")]

    def finish(self, eid, status, report=None, error=None, now=None):
        now = now or stamp()
        attempts = self.db.execute("SELECT attempts FROM events WHERE id=?", (eid,)).fetchone()[0] + 1
        retry = (dt.datetime.fromisoformat(now) + dt.timedelta(seconds=min(21600, 60 * 2 ** min(attempts, 8)))).isoformat() if status == "failed" else None
        with self.db:
            self.db.execute("UPDATE events SET status=?,report=?,error=?,attempts=?,retry_after=? WHERE id=?",
                            (status, json.dumps(report) if report else None, error, attempts, retry, eid))

    def raw(self, body):
        name = digest(body)
        p = self.root / "raw" / name
        p.parent.mkdir(exist_ok=True)
        if not p.exists():
            p.write_bytes(body)
        return name
