import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { building } from '$app/environment';
import { config } from './config';
import { log } from './log';

/** Append-only. Each entry is one schema version. */
const MIGRATIONS: string[] = [
	/* v1 */ `
	CREATE TABLE poll (
		id              TEXT PRIMARY KEY,
		admin_hash      TEXT NOT NULL,
		type            TEXT NOT NULL CHECK (type IN ('date','text')),
		title           TEXT NOT NULL,
		description     TEXT,
		location        TEXT,
		organiser_name  TEXT,
		timezone        TEXT NOT NULL,
		allow_maybe     INTEGER NOT NULL DEFAULT 1,
		hide_votes      INTEGER NOT NULL DEFAULT 0,
		hide_names      INTEGER NOT NULL DEFAULT 0,
		max_per_option  INTEGER,
		deadline        TEXT,
		closed          INTEGER NOT NULL DEFAULT 0,
		final_option_id INTEGER,
		expiry_days     INTEGER NOT NULL DEFAULT 30,
		expires_at      TEXT NOT NULL,
		created_at      TEXT NOT NULL,
		updated_at      TEXT NOT NULL,
		creator_ip_hash TEXT
	);
	CREATE INDEX poll_expires ON poll(expires_at);
	CREATE INDEX poll_created ON poll(created_at);

	CREATE TABLE option (
		id          INTEGER PRIMARY KEY,
		poll_id     TEXT NOT NULL REFERENCES poll(id) ON DELETE CASCADE,
		position    INTEGER NOT NULL,
		date        TEXT,
		start_time  TEXT,
		end_time    TEXT,
		label       TEXT
	);
	CREATE INDEX option_poll ON option(poll_id);

	CREATE TABLE participant (
		id          INTEGER PRIMARY KEY,
		poll_id     TEXT NOT NULL REFERENCES poll(id) ON DELETE CASCADE,
		name        TEXT NOT NULL,
		edit_hash   TEXT NOT NULL,
		comment     TEXT,
		created_at  TEXT NOT NULL,
		updated_at  TEXT NOT NULL
	);
	CREATE INDEX participant_poll ON participant(poll_id);

	CREATE TABLE vote (
		participant_id INTEGER NOT NULL REFERENCES participant(id) ON DELETE CASCADE,
		option_id      INTEGER NOT NULL REFERENCES option(id) ON DELETE CASCADE,
		value          TEXT NOT NULL CHECK (value IN ('yes','maybe','no')),
		PRIMARY KEY (participant_id, option_id)
	);
	`
];

function open(): DatabaseSync {
	let db: DatabaseSync;
	try {
		if (!building) mkdirSync(config.DATA_DIR, { recursive: true });
		db = new DatabaseSync(building ? ':memory:' : join(config.DATA_DIR, 'cronspiracy.sqlite'));
	} catch (e) {
		const uid = process.getuid?.();
		console.error(
			`[cronspiracy] Cannot open the database in DATA_DIR="${config.DATA_DIR}": ${(e as Error).message}\n` +
				`  The folder must be writable by the user running the app (uid ${uid}).\n` +
				`  For a Docker bind mount, run: sudo chown -R ${uid}:${uid} <host folder>`
		);
		process.exit(1);
	}
	db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
	const { user_version: current } = db.prepare('PRAGMA user_version').get() as { user_version: number };
	for (let v = current; v < MIGRATIONS.length; v++) {
		db.exec('BEGIN');
		try {
			db.exec(MIGRATIONS[v]);
			db.exec(`PRAGMA user_version = ${v + 1}`);
			db.exec('COMMIT');
		} catch (e) {
			db.exec('ROLLBACK');
			throw e;
		}
	}
	if (!building) log('info', `migrated to schema v${MIGRATIONS.length}`, { from: current });
	return db;
}

export const db = open();

export function tx<T>(fn: () => T): T {
	db.exec('BEGIN IMMEDIATE');
	try {
		const out = fn();
		db.exec('COMMIT');
		return out;
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
}

export function dbHealthy(): boolean {
	try {
		db.prepare('SELECT 1').get();
		return true;
	} catch {
		return false;
	}
}

/** Delete expired polls; write one backup per day (keeps 7). */
export function maintenance() {
	const now = new Date().toISOString();
	const { changes } = db.prepare('DELETE FROM poll WHERE expires_at < ?').run(now);
	if (changes) log('info', 'expired polls deleted', { count: Number(changes) });

	const dir = join(config.DATA_DIR, 'backups');
	mkdirSync(dir, { recursive: true });
	const file = join(dir, `db-${now.slice(0, 10)}.sqlite`);
	if (!existsSync(file)) {
		try {
			db.prepare('VACUUM INTO ?').run(file);
			log('info', 'backup written', { file });
		} catch (e) {
			log('error', 'backup failed', { error: String(e) });
		}
	}
	const old = readdirSync(dir)
		.filter((f) => /^db-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f))
		.sort()
		.slice(0, -7);
	for (const f of old) rmSync(join(dir, f));
}
