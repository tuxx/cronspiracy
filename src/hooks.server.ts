import type { Handle, HandleServerError } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { maintenance } from '$lib/server/db';
import { ApiError, errorResponse } from '$lib/server/errors';
import { clientIp, hashIp } from '$lib/server/ip';
import { log } from '$lib/server/log';
import { limits } from '$lib/server/ratelimit';

maintenance();
setInterval(maintenance, 60 * 60_000).unref();
log('info', 'cronspiracy online', { publicUrl: config.PUBLIC_URL });

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const handle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	event.locals.ipHash = hashIp(clientIp(event.getClientAddress(), event.request.headers));

	try {
		if (MUTATING.has(event.request.method)) {
			const origin = event.request.headers.get('origin');
			if (origin && origin !== config.origin && origin !== event.url.origin)
				throw new ApiError(403, 'BAD_ORIGIN', 'This request came from another site and was blocked.');
		} else if (path.startsWith('/api/') || path.startsWith('/p/')) {
			limits.read.take(event.locals.ipHash);
		}
	} catch (e) {
		if (e instanceof ApiError) return errorResponse(e);
		throw e;
	}

	const response = await resolve(event);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'no-referrer');
	response.headers.set('X-Frame-Options', 'DENY');
	if (path.startsWith('/p/')) response.headers.set('X-Robots-Tag', 'noindex, nofollow');
	return response;
};

export const handleError: HandleServerError = ({ error, status }) => {
	if (status !== 404) log('error', 'unhandled error', { error: String(error), stack: (error as Error)?.stack });
	return { message: status === 404 ? 'Nothing here. Wrong link?' : 'Something broke on our side. Try again in a moment.' };
};
