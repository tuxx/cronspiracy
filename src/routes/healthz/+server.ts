import { json } from '@sveltejs/kit';
import { dbHealthy } from '$lib/server/db';

export const GET = () => {
	const ok = dbHealthy();
	return json({ ok, db: ok ? 'ok' : 'error' }, { status: ok ? 200 : 503 });
};
