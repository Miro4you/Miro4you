#!/usr/bin/env node
/**
 * Draftpad server for a home network (e.g. a Raspberry Pi): serves the built
 * app from ../dist and keeps drawings as JSON files in a data folder.
 *
 *   node server/server.mjs            → http://0.0.0.0:8080
 *
 * Environment:
 *   PORT      port (default 8080)
 *   HOST      interface (default 0.0.0.0)
 *   DATA_DIR  where drawings are stored (default ./data)
 *   TOKEN     optional password; clients then send "Authorization: Bearer <TOKEN>"
 *
 * No dependencies besides Node.js 18+.
 */
import { createServer } from 'node:http';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = resolve(process.env.DATA_DIR || join(here, '..', 'data'));
const DIST = resolve(join(here, '..', 'dist'));
const TOKEN = process.env.TOKEN || '';
const MAX_BODY = 25 * 1024 * 1024;
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  });
  res.end(data);
}

function authorized(req) {
  if (!TOKEN) return true;
  const given = Buffer.from((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  const want = Buffer.from(TOKEN);
  return given.length === want.length && timingSafeEqual(given, want);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw Object.assign(new Error('Zeichnung zu groß'), { status: 413 });
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const docPath = (id) => join(DATA_DIR, `${id}.json`);
const metaPath = (id) => join(DATA_DIR, `${id}.meta.json`);

/** Write via a temp file so a crash never leaves half a drawing behind. */
async function writeAtomic(path, text) {
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, text);
  await rename(tmp, path);
}

async function api(req, res, path) {
  if (path === '/api/health') return send(res, 200, { ok: true, app: 'skizzen-cad', auth: !!TOKEN });
  if (!authorized(req)) return send(res, 401, { error: 'Passwort fehlt oder ist falsch' });
  if (path === '/api/drawings' && req.method === 'GET') {
    const files = (await readdir(DATA_DIR)).filter((f) => f.endsWith('.meta.json'));
    const list = [];
    for (const f of files) {
      try {
        list.push({ id: f.slice(0, -'.meta.json'.length), ...JSON.parse(await readFile(join(DATA_DIR, f), 'utf8')) });
      } catch {
        /* skip broken entries */
      }
    }
    list.sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
    return send(res, 200, list);
  }
  const m = /^\/api\/drawings\/([^/]+)$/.exec(path);
  if (!m || !ID.test(m[1])) return send(res, 404, { error: 'Nicht gefunden' });
  const id = m[1];
  if (req.method === 'GET') {
    try {
      return send(res, 200, await readFile(docPath(id), 'utf8'));
    } catch {
      return send(res, 404, { error: 'Zeichnung nicht gefunden' });
    }
  }
  if (req.method === 'PUT') {
    const body = await readBody(req);
    if (!body || typeof body !== 'object' || !body.doc || body.doc.format !== 'skizzen-cad') {
      return send(res, 400, { error: 'Keine Draftpad-Zeichnung' });
    }
    const name = String(body.name || 'Skizze').slice(0, 120);
    const thumb = typeof body.thumb === 'string' && body.thumb.startsWith('data:image/') && body.thumb.length < 200_000 ? body.thumb : undefined;
    const updated = new Date().toISOString();
    const text = JSON.stringify(body.doc);
    await writeAtomic(docPath(id), text);
    await writeAtomic(metaPath(id), JSON.stringify({ name, updated, size: Buffer.byteLength(text), thumb }));
    return send(res, 200, { id, name, updated });
  }
  if (req.method === 'DELETE') {
    await rm(docPath(id), { force: true });
    await rm(metaPath(id), { force: true });
    return send(res, 200, { ok: true });
  }
  return send(res, 405, { error: 'Methode nicht erlaubt' });
}

async function serveStatic(res, path) {
  let file = normalize(join(DIST, decodeURIComponent(path)));
  if (file !== DIST && !file.startsWith(DIST + sep)) return send(res, 403, 'Verboten', 'text/plain');
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    // Unknown paths fall back to the app.
    file = join(DIST, 'index.html');
  }
  try {
    const data = await readFile(file);
    const type = MIME[extname(file)] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      // Hashed assets can be cached for good, the rest must stay fresh.
      'Cache-Control': file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(data);
  } catch {
    send(res, 404, 'Nicht gefunden – erst „npm run build“ ausführen.', 'text/plain; charset=utf-8');
  }
}

await mkdir(DATA_DIR, { recursive: true });

createServer(async (req, res) => {
  try {
    const path = new URL(req.url || '/', 'http://x').pathname;
    if (req.method === 'OPTIONS') return send(res, 204, '');
    if (path.startsWith('/api/')) return await api(req, res, path);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Methode nicht erlaubt' });
    return await serveStatic(res, path);
  } catch (err) {
    send(res, err.status || 500, { error: err.status ? err.message : 'Serverfehler' });
    if (!err.status) console.error(err);
  }
}).listen(PORT, HOST, () => {
  console.log(`Draftpad läuft auf http://${HOST}:${PORT} (Zeichnungen in ${DATA_DIR})${TOKEN ? ' – mit Passwort' : ''}`);
});
