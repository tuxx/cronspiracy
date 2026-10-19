import { BlockList, isIP } from 'node:net';
import { createHash, randomBytes } from 'node:crypto';
import { config } from './config';

// https://www.cloudflare.com/ips/
const CLOUDFLARE = [
	'173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18',
	'108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17',
	'162.158.0.0/15', '104.16.0.0/13', '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
	'2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32',
	'2a06:98c0::/29', '2c0f:f248::/32'
];
const PRIVATE = ['127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '::1/128', 'fc00::/7'];

function buildTrusted(spec: string) {
	const list = new BlockList();
	let cloudflare = false;
	for (const raw of spec.split(',').map((s) => s.trim()).filter(Boolean)) {
		const entries = raw === 'cloudflare' ? CLOUDFLARE : raw === 'private' ? PRIVATE : [raw];
		if (raw === 'cloudflare') cloudflare = true;
		for (const cidr of entries) {
			const [net, bits] = cidr.split('/');
			const type = isIP(net) === 6 ? 'ipv6' : 'ipv4';
			if (!isIP(net)) {
				console.error(`[cronspiracy] TRUSTED_PROXIES: "${cidr}" is not an IP or CIDR`);
				process.exit(1);
			}
			list.addSubnet(net, Number(bits ?? (type === 'ipv6' ? 128 : 32)), type);
		}
	}
	return { list, cloudflare, any: spec.trim() !== '' };
}

const trusted = buildTrusted(config.TRUSTED_PROXIES);

const normalize = (ip: string) => ip.trim().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, '');

function isTrusted(ip: string) {
	const v = isIP(ip);
	return v !== 0 && trusted.list.check(ip, v === 6 ? 'ipv6' : 'ipv4');
}

/** Resolve the real client IP, only believing forwarded headers from trusted proxies. */
export function clientIp(socketIp: string, headers: Headers): string {
	let ip = normalize(socketIp);
	if (!trusted.any || !isTrusted(ip)) return ip;

	const cf = headers.get('cf-connecting-ip');
	if (trusted.cloudflare && cf && isIP(normalize(cf))) return normalize(cf);

	// Walk X-Forwarded-For right-to-left, skipping our own trusted hops.
	const xff = (headers.get('x-forwarded-for') ?? '').split(',').map(normalize).filter(Boolean);
	for (let i = xff.length - 1; i >= 0; i--) {
		if (!isIP(xff[i])) break;
		ip = xff[i];
		if (!isTrusted(ip)) return ip;
	}
	// Everything was a trusted hop (e.g. tunnel -> proxy): fall back to CF header if present.
	if (cf && isIP(normalize(cf))) return normalize(cf);
	return ip;
}

let salt = { day: '', value: '' };
/** sha256(ip + daily salt). The salt lives only in memory and rotates daily. */
export function hashIp(ip: string): string {
	const day = new Date().toISOString().slice(0, 10);
	if (salt.day !== day) salt = { day, value: randomBytes(16).toString('hex') };
	return createHash('sha256').update(ip + salt.value).digest('hex').slice(0, 24);
}
