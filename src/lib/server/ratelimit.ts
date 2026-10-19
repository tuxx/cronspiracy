import { config } from './config';
import { ApiError } from './errors';
import { log } from './log';

type Bucket = { tokens: number; updated: number };

class Limiter {
	private buckets = new Map<string, Bucket>();
	constructor(
		private name: string,
		private capacity: number,
		private windowMs: number
	) {}

	/** Throws RATE_LIMITED when the bucket for `key` is empty. */
	take(key: string) {
		const now = Date.now();
		const rate = this.capacity / this.windowMs; // tokens per ms
		const b = this.buckets.get(key) ?? { tokens: this.capacity, updated: now };
		b.tokens = Math.min(this.capacity, b.tokens + (now - b.updated) * rate);
		b.updated = now;
		if (b.tokens < 1) {
			this.buckets.set(key, b);
			const waitSec = Math.ceil((1 - b.tokens) / rate / 1000);
			log('warn', 'rate limited', { bucket: this.name, ipHash: key });
			throw new ApiError(429, 'RATE_LIMITED', `Too many requests. Lay low for ${humanize(waitSec)} and try again.`, {
				'Retry-After': String(waitSec)
			});
		}
		b.tokens -= 1;
		this.buckets.set(key, b);
	}

	sweep() {
		const cutoff = Date.now() - this.windowMs;
		for (const [k, b] of this.buckets) if (b.updated < cutoff) this.buckets.delete(k);
	}
}

function humanize(sec: number) {
	if (sec < 90) return `${sec} seconds`;
	return `${Math.ceil(sec / 60)} minutes`;
}

export const limits = {
	create: new Limiter('create', config.RATE_CREATE_PER_HOUR, 60 * 60_000),
	vote: new Limiter('vote', config.RATE_VOTE_PER_10MIN, 10 * 60_000),
	read: new Limiter('read', config.RATE_READ_PER_MIN, 60_000)
};

setInterval(() => Object.values(limits).forEach((l) => l.sweep()), 10 * 60_000).unref();
