import { json, type RequestHandler } from '@sveltejs/kit';
import { api, readJson } from '$lib/server/errors';
import { addParticipant } from '$lib/server/polls';
import { limits } from '$lib/server/ratelimit';

export const POST: RequestHandler = api(async ({ params, request, locals }) => {
	limits.vote.take(locals.ipHash);
	return json(addParticipant(params.id!, await readJson(request)), { status: 201 });
});
