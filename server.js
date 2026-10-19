// Production entry: derive adapter-node's ORIGIN from PUBLIC_URL, then start the built app.
if (process.env.PUBLIC_URL && !process.env.ORIGIN) process.env.ORIGIN = new URL(process.env.PUBLIC_URL).origin;
process.env.BODY_SIZE_LIMIT ??= '64K';
await import('./build/index.js');
