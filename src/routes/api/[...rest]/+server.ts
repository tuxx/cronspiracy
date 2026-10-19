import { json, type RequestHandler } from '@sveltejs/kit';

export const fallback: RequestHandler = () =>
	json({ error: { code: 'NOT_FOUND', message: 'Unknown API endpoint.' } }, { status: 404 });
