import { error } from '@sveltejs/kit';
import { ApiError } from '$lib/server/errors';
import { pollView } from '$lib/server/polls';

export const load = ({ params }) => {
	try {
		return { poll: pollView(params.id) };
	} catch (e) {
		if (e instanceof ApiError) error(e.status, e.message);
		throw e;
	}
};
