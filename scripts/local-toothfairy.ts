import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import {
  validToothFairyId,
  type ToothFairyCatalog,
} from '../lib/toothfairy-cases';
const exec = promisify(execFile);
/** Only local development has filesystem access. Public builds contain prepared examples. */
export function localToothFairy(): Plugin {
  return {
    name: 'oralpilot-local-toothfairy',
    apply: 'serve',
    enforce: 'pre',
    configureServer(server) {
      const root = server.config.root;
      const cache = path.resolve(
        root,
        '../datasets/ToothFairy/oralpilot-cases',
      );
      const python =
        process.env.ORALPILOT_DATA_PYTHON ||
        path.resolve(root, '../.toothfairy-venv/bin/python');
      const script = path.join(root, 'scripts/toothfairy-cases.py');
      const jobs = new Map<string, Promise<unknown>>();
      let queue = Promise.resolve<unknown>(undefined);
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost');
        if (!url.pathname.startsWith('/__oralpilot/toothfairy/')) return next();
        res.setHeader('Cache-Control', 'no-store');
        const error = (code: number, message: string) => {
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: message }));
        };
        if (
          req.headers.origin &&
          req.headers.origin !== `http://${req.headers.host}` &&
          req.headers.origin !== `https://${req.headers.host}`
        )
          return error(403, 'Same-origin requests only');
        try {
          if (
            url.pathname === '/__oralpilot/toothfairy/catalog' &&
            req.method === 'GET'
          ) {
            const text = await readFile(
              path.join(cache, 'catalog.json'),
              'utf8',
            );
            const data = JSON.parse(text) as ToothFairyCatalog;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
            return;
          }
          const id = url.searchParams.get('id') || '';
          if (!validToothFairyId(id)) return error(400, 'Invalid case ID');
          const catalog = JSON.parse(
            await readFile(path.join(cache, 'catalog.json'), 'utf8'),
          ) as ToothFairyCatalog;
          if (!catalog.cases.some((c) => c.id === id))
            return error(404, 'Case not indexed');
          if (
            url.pathname === '/__oralpilot/toothfairy/prepare' &&
            req.method === 'POST'
          ) {
            if (!jobs.has(id)) {
              const job = queue
                .catch(() => {})
                .then(() =>
                  exec(python, [script, 'prepare', '--case', id], {
                    cwd: root,
                    timeout: 300000,
                    maxBuffer: 1024 * 1024,
                  }),
                );
              queue = job;
              jobs.set(id, job);
              void job.finally(() => jobs.delete(id)).catch(() => {});
            }
            await jobs.get(id);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ id, ready: true }));
            return;
          }
          if (
            url.pathname === '/__oralpilot/toothfairy/file' &&
            req.method === 'GET'
          ) {
            const name = url.searchParams.get('file');
            if (name !== 'case.json' && name !== 'surface.bin')
              return error(400, 'Invalid case file');
            const file = path.join(cache, id, name);
            const info = await stat(file);
            res.setHeader(
              'Content-Type',
              name.endsWith('.json')
                ? 'application/json'
                : 'application/octet-stream',
            );
            res.setHeader('Content-Length', info.size);
            createReadStream(file)
              .on('error', () => res.destroy())
              .pipe(res);
            return;
          }
          error(405, 'Unsupported request');
        } catch {
          error(500, 'Local ToothFairy data could not be prepared');
        }
      });
    },
  };
}
