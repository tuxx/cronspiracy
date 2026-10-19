import { json, type RequestHandler } from '@sveltejs/kit';
import { api, readJson } from '$lib/server/errors';
import { setFinal } from '$lib/server/polls';

export const POST: RequestHandler = api(async ({ params, request }) => {
	const { optionId } = await readJson(request);
	setFinal(params.id!, request.headers.get('x-admin-token'), optionId ?? null);
	return json({ ok: true });
});
