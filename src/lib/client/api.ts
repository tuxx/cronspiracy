export class ClientError extends Error {
	constructor(
		public code: string,
		message: string
	) {
		super(message);
	}
}

/** fetch() JSON with our error shape. Always throws a human-readable message. */
export async function call<T = unknown>(
	method: string,
	path: string,
	opts: { body?: unknown; adminToken?: string | null; editToken?: string | null } = {}
): Promise<T> {
	const headers: Record<string, string> = {};
	if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
	if (opts.adminToken) headers['X-Admin-Token'] = opts.adminToken;
	if (opts.editToken) headers['X-Edit-Token'] = opts.editToken;
	let res: Response;
	try {
		res = await fetch(path, {
			method,
			headers,
			body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
		});
	} catch {
		throw new ClientError('NETWORK', 'Connection lost. Check your internet and try again.');
	}
	let data: unknown = null;
	try {
		data = await res.json();
	} catch {
		/* non-JSON */
	}
	if (!res.ok) {
		const err = (data as { error?: { code?: string; message?: string } })?.error;
		throw new ClientError(
			err?.code ?? `HTTP_${res.status}`,
			err?.message ?? `The server answered with an unexpected error (${res.status}). Try again in a moment.`
		);
	}
	return data as T;
}

export async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}
