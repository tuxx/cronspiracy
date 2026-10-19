import { json, type RequestHandler } from '@sveltejs/kit';
import { api, readJson } from '$lib/server/errors';
import { deletePoll, pollView, updatePoll } from '$lib/server/polls';

const auth = (r: Request) => ({ adminToken: r.headers.get('x-admin-token'), editToken: r.headers.get('x-edit-token') });

export const GET: RequestHandler = api(({ params, request }) => json(pollView(params.id!, auth(request))));

export const PATCH: RequestHandler = api(async ({ params, request }) => {
	updatePoll(params.id!, request.headers.get('x-admin-token'), await readJson(request));
	return json(pollView(params.id!, auth(request)));
});

export const DELETE: RequestHandler = api(({ params, request }) => {
	deletePoll(params.id!, request.headers.get('x-admin-token'));
	return json({ ok: true });
});
