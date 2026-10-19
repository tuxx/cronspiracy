import { json, type RequestHandler } from '@sveltejs/kit';
import { api, readJson } from '$lib/server/errors';
import { deleteParticipant, updateParticipant } from '$lib/server/polls';
import { limits } from '$lib/server/ratelimit';

const auth = (r: Request) => ({ adminToken: r.headers.get('x-admin-token'), editToken: r.headers.get('x-edit-token') });

export const PUT: RequestHandler = api(async ({ params, request, locals }) => {
	limits.vote.take(locals.ipHash);
	updateParticipant(params.id!, Number(params.pid), await readJson(request), auth(request));
	return json({ ok: true });
});

export const DELETE: RequestHandler = api(({ params, request }) => {
	deleteParticipant(params.id!, Number(params.pid), auth(request));
	return json({ ok: true });
});
