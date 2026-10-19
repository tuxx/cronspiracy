import { json, type RequestHandler } from '@sveltejs/kit';
import { api, readJson } from '$lib/server/errors';
import { createPoll } from '$lib/server/polls';
import { limits } from '$lib/server/ratelimit';
import { log } from '$lib/server/log';

export const POST: RequestHandler = api(async ({ request, locals }) => {
	limits.create.take(locals.ipHash);
	const { id, adminToken, discarded } = createPoll(await readJson(request), locals.ipHash);
	if (discarded) log('warn', 'honeypot: poll discarded', { ipHash: locals.ipHash });
	else log('info', 'poll created', { id });
	return json({ id, adminToken }, { status: 201 });
});
