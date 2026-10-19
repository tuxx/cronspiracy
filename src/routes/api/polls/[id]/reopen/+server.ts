import { json, type RequestHandler } from '@sveltejs/kit';
import { api } from '$lib/server/errors';
import { setClosed } from '$lib/server/polls';

export const POST: RequestHandler = api(({ params, request }) => {
	setClosed(params.id!, request.headers.get('x-admin-token'), false);
	return json({ ok: true });
});
