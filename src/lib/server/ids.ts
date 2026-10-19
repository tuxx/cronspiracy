import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** 10 chars of base58 (~58 bits). */
export function newPollId(): string {
	const bytes = randomBytes(10);
	let out = '';
	for (const b of bytes) out += B58[b % 58]; // slight bias is irrelevant at this size
	return out;
}

export function newToken(): string {
	return randomBytes(32).toString('base64url');
}

export function sha256(s: string): string {
	return createHash('sha256').update(s).digest('hex');
}

export function tokenMatches(token: string | null | undefined, hash: string): boolean {
	if (!token) return false;
	const a = Buffer.from(sha256(token), 'hex');
	const b = Buffer.from(hash, 'hex');
	return a.length === b.length && timingSafeEqual(a, b);
}

export const POLL_ID_RE = /^[1-9A-HJ-NP-Za-km-z]{10}$/;
