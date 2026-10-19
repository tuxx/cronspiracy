import { config } from '$lib/server/config';

// Locale for date formatting, fixed per request so server and client render the same text.
function pickLocale(header: string | null) {
	for (const part of (header ?? '').split(',')) {
		const tag = part.split(';')[0].trim();
		try {
			if (tag && Intl.DateTimeFormat.supportedLocalesOf(tag).length) return tag;
		} catch {
			/* invalid tag */
		}
	}
	return 'en-GB';
}

export const load = ({ request }) => ({
	locale: pickLocale(request.headers.get('accept-language')),
	brand: config.BRAND_NAME,
	publicUrl: config.PUBLIC_URL,
	maxOptions: config.MAX_OPTIONS,
	createPasswordRequired: !!config.CREATE_PASSWORD,
	defaultExpiryDays: config.DEFAULT_EXPIRY_DAYS
});
