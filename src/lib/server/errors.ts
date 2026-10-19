import { json } from '@sveltejs/kit';

export class ApiError extends Error {
	constructor(
		public status: number,
		public code: string,
		message: string,
		public headers: Record<string, string> = {}
	) {
		super(message);
	}
}

export const errorResponse = (e: ApiError) =>
	json({ error: { code: e.code, message: e.message } }, { status: e.status, headers: e.headers });

/** Wrap an API handler so every failure becomes `{ error: { code, message } }`. */
export function api<E>(fn: (event: E) => Promise<Response> | Response) {
	return async (event: E) => {
		try {
			return await fn(event);
		} catch (e) {
			if (e instanceof ApiError) return errorResponse(e);
			throw e;
		}
	};
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
	try {
		const body = await request.json();
		if (body && typeof body === 'object' && !Array.isArray(body)) return body;
	} catch {
		/* fall through */
	}
	throw new ApiError(400, 'BAD_JSON', 'The request was not valid JSON. Reload the page and try again.');
}
