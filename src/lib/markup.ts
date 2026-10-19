// Markdown-lite: links, **bold**, *italic*, line breaks. Everything else is escaped text.

const esc = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const link = (href: string, text: string) =>
	`<a href="${href}" rel="nofollow ugc noopener noreferrer" target="_blank">${text}</a>`;

export function renderMarkup(src: string): string {
	let s = esc(src.replace(/\u0000/g, ""));
	const links: string[] = [];
	const stash = (html: string) => `\u0000${links.push(html) - 1}\u0000`;
	// [text](https://…)
	s = s.replace(/\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => stash(link(u, t)));
	// bare URLs
	s = s.replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)'"]/g, (u) => stash(link(u, u)));
	s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
	s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
	s = s.replace(/\r?\n/g, '<br>');
	return s.replace(/\u0000(\d+)\u0000/g, (_, i) => links[+i]);
}
