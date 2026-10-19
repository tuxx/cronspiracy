import { describe, expect, it } from 'vitest';
import { renderMarkup } from './markup';

describe('renderMarkup', () => {
	it('escapes HTML', () => {
		expect(renderMarkup('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
	});
	it('renders bold, italic, breaks and links', () => {
		const out = renderMarkup('**hi** *there*\nsee https://example.com/a?b=1&c=2.');
		expect(out).toContain('<strong>hi</strong>');
		expect(out).toContain('<em>there</em>');
		expect(out).toContain('<br>');
		expect(out).toContain('href="https://example.com/a?b=1&amp;c=2"');
		expect(out).toContain('rel="nofollow ugc noopener noreferrer"');
		expect(out.endsWith('</a>.')).toBe(true);
	});
	it('only links http(s)', () => {
		expect(renderMarkup('[x](javascript:alert(1))')).not.toContain('<a');
	});
	it('does not let attribute injection escape the href', () => {
		const out = renderMarkup('[x](https://e.com/"onmouseover=alert(1))');
		expect(out).not.toMatch(/"\s*onmouseover/);
	});
});
