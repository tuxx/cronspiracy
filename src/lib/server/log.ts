/** JSON-lines logger to stdout. Never pass raw IPs here. */
export function log(level: 'info' | 'warn' | 'error', msg: string, extra: Record<string, unknown> = {}) {
	const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...extra });
	(level === 'error' ? console.error : console.log)(line);
}
