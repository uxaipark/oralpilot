import { readdir, stat, realpath } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import { datasetKind, type DatasetFile } from '../lib/dataset-catalog';

export async function resolveDatasetFile(root: string, relative: string) {
  const base = await realpath(root),
    resolved = await realpath(path.resolve(base, relative));
  if (
    !resolved.startsWith(base + path.sep) ||
    !datasetKind(resolved) ||
    !(await stat(resolved)).isFile()
  )
    throw Error('지원하는 datasets 파일이 아닙니다.');
  return resolved;
}
async function scan(root: string, directory = root): Promise<DatasetFile[]> {
  const files: DatasetFile[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (
      entry.name.startsWith('.') ||
      entry.name === '__MACOSX' ||
      entry.isSymbolicLink()
    )
      continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await scan(root, full)));
    else if (entry.isFile() && datasetKind(entry.name)) {
      const info = await stat(full);
      files.push({
        path: path.relative(root, full).split(path.sep).join('/'),
        size: info.size,
        modified: info.mtimeMs,
      });
    }
  }
  return files;
}
/** Development-only access to the workspace datasets; never part of the hosted Worker. */
export function localDatasets(): Plugin {
  return {
    name: 'oralpilot-local-datasets',
    apply: 'serve',
    enforce: 'pre',
    configureServer(server) {
      const datasetsRoot = path.resolve(server.config.root, '../datasets');
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost');
        if (
          !['/__oralpilot/datasets', '/__oralpilot/dataset-file'].includes(
            url.pathname,
          )
        )
          return next();
        res.setHeader('Cache-Control', 'no-store');
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.end();
          return;
        }
        try {
          if (url.pathname === '/__oralpilot/datasets') {
            const files = await scan(datasetsRoot);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ root: 'datasets', files }));
            return;
          }
          const file = await resolveDatasetFile(
            datasetsRoot,
            url.searchParams.get('path') || '',
          );
          const info = await stat(file);
          if (info.size > 180_000_000) {
            res.statusCode = 413;
            res.end('180 MB limit');
            return;
          }
          res.setHeader('Content-Type', 'application/octet-stream');
          res.setHeader('Content-Length', info.size);
          createReadStream(file)
            .on('error', () => res.destroy())
            .pipe(res);
        } catch {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error: 'datasets 폴더 또는 지원하는 파일을 찾지 못했습니다.',
            }),
          );
        }
      });
    },
  };
}
