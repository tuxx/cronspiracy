import type { RequestHandler } from '@sveltejs/kit';
import { api } from '$lib/server/errors';
import { exportCsv } from '$lib/server/polls';

// Token may come from the header (fetch) or ?token= (plain download link).
export const GET: RequestHandler = api(({ params, request, url }) => {
	const csv = exportCsv(params.id!, request.headers.get('x-admin-token') ?? url.searchParams.get('token'));
	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="cronspiracy-${params.id}.csv"`,
			'Cache-Control': 'no-store'
		}
	});
});
