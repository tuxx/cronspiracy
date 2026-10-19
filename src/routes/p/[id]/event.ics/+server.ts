import { error, type RequestHandler } from '@sveltejs/kit';
import { toIcs } from '$lib/calendar';
import { config } from '$lib/server/config';
import { ApiError } from '$lib/server/errors';
import { pollView } from '$lib/server/polls';

export const GET: RequestHandler = ({ params }) => {
	let poll;
	try {
		poll = pollView(params.id!);
	} catch (e) {
		if (e instanceof ApiError) error(e.status, e.message);
		throw e;
	}
	const option = poll.options.find((o) => o.id === poll.finalOptionId);
	if (!option?.date) error(404, 'The organiser has not picked a date yet.');
	const ics = toIcs({
		uid: `${poll.id}@${new URL(config.PUBLIC_URL).host}`,
		title: poll.title,
		description: poll.description,
		location: poll.location,
		url: `${config.PUBLIC_URL}/p/${poll.id}`,
		option,
		timezone: poll.timezone
	});
	return new Response(ics, {
		headers: {
			'Content-Type': 'text/calendar; charset=utf-8',
			'Content-Disposition': `attachment; filename="${poll.id}.ics"`
		}
	});
};
