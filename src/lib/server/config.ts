import { z } from 'zod';
import { building } from '$app/environment';

const int = (def: number) => z.coerce.number().int().positive().default(def);

const schema = z.object({
	PUBLIC_URL: z.url({ message: 'PUBLIC_URL must be a full URL, e.g. https://poll.example.com' }),
	DATA_DIR: z.string().default('/data'),
	TRUSTED_PROXIES: z.string().default(''),
	MAX_OPTIONS: int(60),
	MAX_PARTICIPANTS: int(200),
	MAX_POLLS: int(10000),
	DEFAULT_EXPIRY_DAYS: int(30),
	RATE_CREATE_PER_HOUR: int(5),
	RATE_VOTE_PER_10MIN: int(30),
	RATE_READ_PER_MIN: int(120),
	GLOBAL_CREATE_PER_HOUR: int(100),
	CREATE_PASSWORD: z.string().optional(),
	BRAND_NAME: z.string().default('Cronspiracy')
});

export type Config = z.infer<typeof schema> & { origin: string };

function load(): Config {
	const env = { ...process.env };
	// Treat empty strings as unset so `FOO=` in compose behaves like "not configured".
	for (const k of Object.keys(env)) if (env[k] === '') delete env[k];
	// `vite build` imports server modules to analyse routes; real config is read at runtime.
	if (!env.PUBLIC_URL && (building || process.env.NODE_ENV !== 'production')) {
		env.PUBLIC_URL = 'http://localhost:5173';
		env.DATA_DIR ??= './data';
	}
	const parsed = schema.safeParse(env);
	if (!parsed.success) {
		const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
		console.error(`[cronspiracy] Invalid configuration:\n${lines.join('\n')}`);
		process.exit(1);
	}
	return { ...parsed.data, origin: new URL(parsed.data.PUBLIC_URL).origin };
}

export const config = load();
