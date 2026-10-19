import { error } from '@sveltejs/kit';
import { ApiError } from '$lib/server/errors';
import { pollView } from '$lib/server/polls';

export const load = ({ params }) => {
	try {
		const poll = pollView(params.id, { adminToken: params.token });
		if (!poll.isAdmin) error(403, 'That admin link is not valid for this poll. Check you copied the whole link.');
		return { poll, adminToken: params.token };
	} catch (e) {
		if (e instanceof ApiError) error(e.status, e.message);
		throw e;
	}
};
