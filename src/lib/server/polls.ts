import { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import { db, tx } from './db';
import { config } from './config';
import { ApiError } from './errors';
import { newPollId, newToken, sha256, tokenMatches } from './ids';
import { addDays, isDate, isTime, isTimeZone } from '$lib/dates';
import { LIMITS, type Participant, type PollOption, type PollView, type VoteValue } from '$lib/types';

// ---------- rows ----------

interface PollRow {
	id: string;
	admin_hash: string;
	type: 'date' | 'text';
	title: string;
	description: string | null;
	location: string | null;
	organiser_name: string | null;
	timezone: string;
	allow_maybe: number;
	hide_votes: number;
	hide_names: number;
	deadline: string | null;
	closed: number;
	final_option_id: number | null;
	expiry_days: number;
	expires_at: string;
	created_at: string;
	updated_at: string;
}
interface OptionRow {
	id: number;
	date: string | null;
	start_time: string | null;
	end_time: string | null;
	label: string | null;
}
interface ParticipantRow {
	id: number;
	name: string;
	edit_hash: string;
	comment: string | null;
	updated_at: string;
}

const q = {
	poll: db.prepare('SELECT * FROM poll WHERE id = ?'),
	options: db.prepare('SELECT id, date, start_time, end_time, label FROM option WHERE poll_id = ? ORDER BY position'),
	participants: db.prepare('SELECT id, name, edit_hash, comment, updated_at FROM participant WHERE poll_id = ? ORDER BY id'),
	participant: db.prepare('SELECT id, name, edit_hash, comment, updated_at FROM participant WHERE poll_id = ? AND id = ?'),
	votes: db.prepare(
		'SELECT v.participant_id, v.option_id, v.value FROM vote v JOIN participant p ON p.id = v.participant_id WHERE p.poll_id = ?'
	),
	countParticipants: db.prepare('SELECT COUNT(*) AS n FROM participant WHERE poll_id = ?'),
	countPolls: db.prepare('SELECT COUNT(*) AS n FROM poll'),
	countRecentPolls: db.prepare('SELECT COUNT(*) AS n FROM poll WHERE created_at > ?'),
	lastOptionDate: db.prepare('SELECT MAX(date) AS d FROM option WHERE poll_id = ?')
};

const now = () => new Date().toISOString();
const count = (stmt: { get: (...a: never[]) => unknown }, ...args: unknown[]) =>
	Number(((stmt.get as (...a: unknown[]) => { n: number })(...args)).n);

// ---------- validation ----------

const text = (max: number, label: string) =>
	z
		.string({ message: `${label} must be text` })
		.trim()
		.max(max, `${label} can be at most ${max} characters`);
const optText = (max: number, label: string) =>
	text(max, label)
		.nullish()
		.transform((s) => (s ? s : null));

const voteValue = z.enum(['yes', 'maybe', 'no']);

const optionSchema = z
	.object({
		date: z.string().refine(isDate, 'Invalid date').optional(),
		startTime: z.string().refine(isTime, 'Invalid time').nullish(),
		endTime: z.string().refine(isTime, 'Invalid end time').nullish(),
		label: optText(LIMITS.optionLabel, 'Option')
	})
	.refine((o) => !o.endTime || o.startTime, 'An end time needs a start time');

const settingsSchema = z.object({
	allowMaybe: z.boolean().default(true),
	hideVotes: z.boolean().default(false),
	hideNames: z.boolean().default(false),
	deadline: z.iso.datetime({ offset: true }).nullish(),
	expiryDays: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30)
});

const createSchema = z
	.object({
		type: z.enum(['date', 'text']).default('date'),
		title: text(LIMITS.title, 'Title').min(1, 'Give your poll a title'),
		description: optText(LIMITS.description, 'Description'),
		location: optText(LIMITS.location, 'Location'),
		organiserName: optText(LIMITS.name, 'Your name'),
		timezone: z.string().refine(isTimeZone, 'Unknown timezone'),
		options: z.array(optionSchema).min(1, 'Add at least one option'),
		password: z.string().optional(),
		website: z.string().optional() // honeypot
	})
	.extend(settingsSchema.shape);

const participantSchema = z.object({
	name: text(LIMITS.name, 'Name').min(1, 'Enter your name so others know who voted'),
	comment: optText(LIMITS.comment, 'Comment'),
	votes: z.record(z.string().regex(/^\d+$/), voteValue),
	website: z.string().optional()
});

const patchSchema = z
	.object({
		title: text(LIMITS.title, 'Title').min(1, 'The title cannot be empty'),
		description: optText(LIMITS.description, 'Description'),
		location: optText(LIMITS.location, 'Location'),
		organiserName: optText(LIMITS.name, 'Your name')
	})
	.extend(settingsSchema.shape)
	.partial();

function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
	const r = schema.safeParse(data);
	if (!r.success) {
		const issue = r.error.issues[0];
		throw new ApiError(400, 'INVALID_INPUT', issue.message);
	}
	return r.data;
}

// ---------- helpers ----------

function getRow(id: string): PollRow {
	const row = q.poll.get(id) as PollRow | undefined;
	if (!row) throw new ApiError(404, 'NOT_FOUND', 'This poll does not exist. It may have expired or been deleted.');
	return row;
}

export function pollExists(id: string) {
	return q.poll.get(id) !== undefined;
}

export function requireAdmin(id: string, token: string | null): PollRow {
	const row = getRow(id);
	if (!tokenMatches(token, row.admin_hash))
		throw new ApiError(403, 'NOT_ADMIN', 'That admin link is not valid for this poll. Check you copied the whole link.');
	return row;
}

export function isAdminToken(id: string, token: string | null) {
	const row = q.poll.get(id) as PollRow | undefined;
	return !!row && tokenMatches(token, row.admin_hash);
}

const votingClosed = (row: PollRow) =>
	!!row.closed || row.final_option_id !== null || (!!row.deadline && row.deadline < now());

function computeExpiry(row: Pick<PollRow, 'id' | 'deadline' | 'created_at' | 'expiry_days'>, lastDate?: string | null) {
	const last = lastDate === undefined ? (q.lastOptionDate.get(row.id) as { d: string | null }).d : lastDate;
	const anchors = [row.created_at.slice(0, 10), last, row.deadline?.slice(0, 10)].filter(Boolean) as string[];
	const anchor = anchors.sort().at(-1)!;
	return addDays(anchor, row.expiry_days + 1) + 'T00:00:00.000Z';
}

function checkOptions(type: 'date' | 'text', options: z.infer<typeof optionSchema>[]) {
	if (options.length > config.MAX_OPTIONS)
		throw new ApiError(400, 'TOO_MANY_OPTIONS', `A poll can have at most ${config.MAX_OPTIONS} options.`);
	const seen = new Set<string>();
	for (const o of options) {
		if (type === 'date' && !o.date) throw new ApiError(400, 'INVALID_INPUT', 'Every option needs a date.');
		if (type === 'text' && !o.label) throw new ApiError(400, 'INVALID_INPUT', 'Options cannot be empty.');
		const key = type === 'date' ? `${o.date} ${o.startTime ?? ''}` : o.label!.toLowerCase();
		if (seen.has(key)) throw new ApiError(400, 'DUPLICATE_OPTION', 'The same option is in the list twice.');
		seen.add(key);
	}
}

// ---------- create ----------

export function createPoll(body: unknown, ipHash: string) {
	const input = parse(createSchema, body);

	if (config.CREATE_PASSWORD && !safeEqual(input.password ?? '', config.CREATE_PASSWORD))
		throw new ApiError(403, 'PASSWORD_REQUIRED', 'This instance needs the creation password to start a new poll.');
	if (count(q.countPolls) >= config.MAX_POLLS)
		throw new ApiError(503, 'INSTANCE_FULL', 'This instance is full. Try again later or ask the operator to raise MAX_POLLS.');
	const hourAgo = new Date(Date.now() - 3600_000).toISOString();
	if (!config.CREATE_PASSWORD && count(q.countRecentPolls, hourAgo) >= config.GLOBAL_CREATE_PER_HOUR)
		throw new ApiError(503, 'CREATION_PAUSED', 'Poll creation is paused for a bit because of unusual traffic. Try again within the hour.');

	if (input.type === 'date') {
		input.options.sort((a, b) => `${a.date} ${a.startTime ?? ''}`.localeCompare(`${b.date} ${b.startTime ?? ''}`));
	}
	checkOptions(input.type, input.options);

	const id = newPollId();
	const adminToken = newToken();
	const ts = now();

	// Honeypot filled → pretend success, store nothing.
	if (input.website) return { id, adminToken, discarded: true };

	const lastDate = input.type === 'date' ? input.options.at(-1)!.date! : null;
	const expiresAt = computeExpiry(
		{ id, deadline: input.deadline ?? null, created_at: ts, expiry_days: input.expiryDays },
		lastDate
	);

	tx(() => {
		db.prepare(
			`INSERT INTO poll (id, admin_hash, type, title, description, location, organiser_name, timezone,
				allow_maybe, hide_votes, hide_names, deadline, expiry_days, expires_at, created_at, updated_at, creator_ip_hash)
			 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
		).run(
			id,
			sha256(adminToken),
			input.type,
			input.title,
			input.description,
			input.location,
			input.organiserName,
			input.timezone,
			+input.allowMaybe,
			+input.hideVotes,
			+input.hideNames,
			input.deadline ?? null,
			input.expiryDays,
			expiresAt,
			ts,
			ts,
			ipHash
		);
		const ins = db.prepare(
			'INSERT INTO option (poll_id, position, date, start_time, end_time, label) VALUES (?,?,?,?,?,?)'
		);
		input.options.forEach((o, i) =>
			ins.run(id, i, o.date ?? null, o.startTime ?? null, o.endTime ?? null, o.label ?? null)
		);
	});
	return { id, adminToken, discarded: false };
}

function safeEqual(a: string, b: string) {
	const x = Buffer.from(sha256(a), 'hex');
	const y = Buffer.from(sha256(b), 'hex');
	return timingSafeEqual(x, y);
}

// ---------- read ----------

export function pollView(id: string, auth: { adminToken?: string | null; editToken?: string | null } = {}): PollView {
	const row = getRow(id);
	const isAdmin = tokenMatches(auth.adminToken, row.admin_hash);
	const prows = q.participants.all(id) as unknown as ParticipantRow[];
	const you = auth.editToken ? prows.find((p) => tokenMatches(auth.editToken, p.edit_hash)) : undefined;

	const options: PollOption[] = (q.options.all(id) as unknown as OptionRow[]).map((o) => ({
		id: o.id,
		date: o.date,
		startTime: o.start_time,
		endTime: o.end_time,
		label: o.label
	}));

	const votesHidden = !!row.hide_votes && !isAdmin && !you;
	let participants: Participant[] = [];
	if (!votesHidden) {
		const byId = new Map<number, Participant>();
		let n = 0;
		for (const p of prows) {
			n++;
			const anonymous = row.hide_names && !isAdmin && p.id !== you?.id;
			byId.set(p.id, {
				id: p.id,
				name: anonymous ? `Agent ${String(n).padStart(2, '0')}` : p.name,
				comment: anonymous ? null : p.comment,
				votes: {},
				updatedAt: p.updated_at
			});
		}
		for (const v of q.votes.all(id) as unknown as { participant_id: number; option_id: number; value: VoteValue }[]) {
			const p = byId.get(v.participant_id);
			if (p) p.votes[v.option_id] = v.value;
		}
		participants = [...byId.values()];
	}

	return {
		id: row.id,
		type: row.type,
		title: row.title,
		description: row.description,
		location: row.location,
		organiserName: row.organiser_name,
		timezone: row.timezone,
		allowMaybe: !!row.allow_maybe,
		hideVotes: !!row.hide_votes,
		hideNames: !!row.hide_names,
		deadline: row.deadline,
		closed: !!row.closed,
		votingClosed: votingClosed(row),
		finalOptionId: row.final_option_id,
		expiryDays: row.expiry_days,
		expiresAt: row.expires_at,
		createdAt: row.created_at,
		options,
		participants,
		participantCount: prows.length,
		votesHidden,
		youId: you?.id ?? null,
		isAdmin
	};
}

// ---------- participants ----------

function validateVotes(row: PollRow, votes: Record<string, VoteValue>) {
	const ids = new Set((q.options.all(row.id) as unknown as OptionRow[]).map((o) => o.id));
	const out: [number, VoteValue][] = [];
	for (const [k, v] of Object.entries(votes)) {
		const oid = Number(k);
		if (!ids.has(oid)) throw new ApiError(400, 'UNKNOWN_OPTION', 'One of the options no longer exists. Reload the page to see the current list.');
		if (v === 'maybe' && !row.allow_maybe)
			throw new ApiError(400, 'MAYBE_DISABLED', 'The organiser turned off "if need be" answers. Pick yes or no.');
		out.push([oid, v]);
	}
	return out;
}

function assertOpen(row: PollRow) {
	if (votingClosed(row))
		throw new ApiError(409, 'POLL_CLOSED', 'Voting on this poll is closed. Ask the organiser to reopen it if you still need to vote.');
}

function writeVotes(pid: number, votes: [number, VoteValue][]) {
	db.prepare('DELETE FROM vote WHERE participant_id = ?').run(pid);
	const ins = db.prepare('INSERT INTO vote (participant_id, option_id, value) VALUES (?,?,?)');
	for (const [oid, v] of votes) ins.run(pid, oid, v);
}

export function addParticipant(pollId: string, body: unknown) {
	const row = getRow(pollId);
	const input = parse(participantSchema, body);
	assertOpen(row);
	const votes = validateVotes(row, input.votes);
	if (count(q.countParticipants, pollId) >= config.MAX_PARTICIPANTS)
		throw new ApiError(409, 'POLL_FULL', `This poll already has the maximum of ${config.MAX_PARTICIPANTS} participants.`);

	const editToken = newToken();
	if (input.website) return { participantId: 0, editToken };

	const ts = now();
	const participantId = tx(() => {
		const r = db
			.prepare('INSERT INTO participant (poll_id, name, edit_hash, comment, created_at, updated_at) VALUES (?,?,?,?,?,?)')
			.run(pollId, input.name, sha256(editToken), input.comment, ts, ts);
		const pid = Number(r.lastInsertRowid);
		writeVotes(pid, votes);
		db.prepare('UPDATE poll SET updated_at = ? WHERE id = ?').run(ts, pollId);
		return pid;
	});
	return { participantId, editToken };
}

function authParticipant(row: PollRow, pid: number, auth: { adminToken?: string | null; editToken?: string | null }) {
	const p = q.participant.get(row.id, pid) as ParticipantRow | undefined;
	if (!p) throw new ApiError(404, 'NOT_FOUND', 'That vote no longer exists. It may have been removed by the organiser.');
	const admin = tokenMatches(auth.adminToken, row.admin_hash);
	if (!admin && !tokenMatches(auth.editToken, p.edit_hash))
		throw new ApiError(403, 'NOT_YOURS', 'You can only change your own vote. Use your personal edit link to change it on this device.');
	return { p, admin };
}

export function updateParticipant(
	pollId: string,
	pid: number,
	body: unknown,
	auth: { adminToken?: string | null; editToken?: string | null }
) {
	const row = getRow(pollId);
	const { admin } = authParticipant(row, pid, auth);
	const input = parse(participantSchema, body);
	if (!admin) assertOpen(row);
	const votes = validateVotes(row, input.votes);
	const ts = now();
	tx(() => {
		db.prepare('UPDATE participant SET name = ?, comment = ?, updated_at = ? WHERE id = ?').run(
			input.name,
			input.comment,
			ts,
			pid
		);
		writeVotes(pid, votes);
		db.prepare('UPDATE poll SET updated_at = ? WHERE id = ?').run(ts, pollId);
	});
}

export function deleteParticipant(
	pollId: string,
	pid: number,
	auth: { adminToken?: string | null; editToken?: string | null }
) {
	const row = getRow(pollId);
	authParticipant(row, pid, auth);
	db.prepare('DELETE FROM participant WHERE id = ?').run(pid);
}

// ---------- admin ----------

export function updatePoll(pollId: string, token: string | null, body: unknown) {
	const row = requireAdmin(pollId, token);
	const p = parse(patchSchema, body);
	const next = {
		...row,
		title: p.title ?? row.title,
		description: p.description !== undefined ? p.description : row.description,
		location: p.location !== undefined ? p.location : row.location,
		organiser_name: p.organiserName !== undefined ? p.organiserName : row.organiser_name,
		allow_maybe: p.allowMaybe !== undefined ? +p.allowMaybe : row.allow_maybe,
		hide_votes: p.hideVotes !== undefined ? +p.hideVotes : row.hide_votes,
		hide_names: p.hideNames !== undefined ? +p.hideNames : row.hide_names,
		deadline: p.deadline !== undefined ? (p.deadline ?? null) : row.deadline,
		expiry_days: p.expiryDays ?? row.expiry_days
	};
	next.expires_at = computeExpiry(next);
	db.prepare(
		`UPDATE poll SET title=?, description=?, location=?, organiser_name=?, allow_maybe=?, hide_votes=?, hide_names=?,
			deadline=?, expiry_days=?, expires_at=?, updated_at=? WHERE id=?`
	).run(
		next.title,
		next.description,
		next.location,
		next.organiser_name,
		next.allow_maybe,
		next.hide_votes,
		next.hide_names,
		next.deadline,
		next.expiry_days,
		next.expires_at,
		now(),
		pollId
	);
}

export function setClosed(pollId: string, token: string | null, closed: boolean) {
	requireAdmin(pollId, token);
	// Reopening also clears a picked final date.
	db.prepare(
		`UPDATE poll SET closed = ?, final_option_id = CASE WHEN ? THEN final_option_id ELSE NULL END, updated_at = ? WHERE id = ?`
	).run(+closed, +closed, now(), pollId);
}

export function setFinal(pollId: string, token: string | null, optionId: unknown) {
	requireAdmin(pollId, token);
	if (optionId === null) {
		db.prepare('UPDATE poll SET final_option_id = NULL, updated_at = ? WHERE id = ?').run(now(), pollId);
		return;
	}
	const ok = (q.options.all(pollId) as unknown as OptionRow[]).some((o) => o.id === optionId);
	if (!ok || typeof optionId !== 'number') throw new ApiError(400, 'UNKNOWN_OPTION', 'That option is not part of this poll.');
	db.prepare('UPDATE poll SET final_option_id = ?, closed = 1, updated_at = ? WHERE id = ?').run(optionId, now(), pollId);
}

export function deletePoll(pollId: string, token: string | null) {
	requireAdmin(pollId, token);
	db.prepare('DELETE FROM poll WHERE id = ?').run(pollId);
}

export function exportCsv(pollId: string, token: string | null): string {
	requireAdmin(pollId, token);
	const v = pollView(pollId, { adminToken: token });
	const cell = (raw: string) => {
		const s = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw; // defuse spreadsheet formulas
		return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
	};
	const label = (o: PollOption) =>
		[o.date, o.startTime && (o.endTime ? `${o.startTime}-${o.endTime}` : o.startTime), o.label].filter(Boolean).join(' ');
	const lines = [['Name', ...v.options.map(label), 'Comment'].map(cell).join(',')];
	for (const p of v.participants)
		lines.push([p.name, ...v.options.map((o) => p.votes[o.id] ?? ''), p.comment ?? ''].map(cell).join(','));
	return lines.join('\r\n') + '\r\n';
}
