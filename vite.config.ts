import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { Readable } from 'stream';
import { defineConfig, Plugin } from 'vite';

// Helper to resolve OnlyFiles direct download link from HTML page (from file-uploader-bot-vercel)
async function freshStorageLink(id: string): Promise<string | null> {
  try {
    const pageRes = await fetch(`https://onlyfiles.com/${encodeURIComponent(id)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Referer: 'https://onlyfiles.com/',
      },
    });
    if (!pageRes.ok) return null;
    const html = await pageRes.text();
    const abs = html.match(/https?:\/\/onlyfiles\.com\/dl\/[^"'\s<>]+/i);
    if (abs) return abs[0].replace(/&amp;/g, '&').replace(/^http:/, 'https:');
    const rel = html.match(/["'](\/dl\/[^"'\s<>]+)["']/i);
    if (rel) return 'https://onlyfiles.com' + rel[1].replace(/&amp;/g, '&');
    return null;
  } catch {
    return null;
  }
}

// Helper to resolve tmpfiles download link (from file-uploader-bot-vercel)
async function freshTempLink(pageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(pageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const abs = html.match(/https?:\/\/tmpfiles\.org\/dl\/[^"'\s<>]+/i);
    if (abs) return abs[0].replace(/&amp;/g, '&').replace(/^http:/, 'https:');
    const rel = html.match(/["'](\/dl\/[^"'\s<>]+)["']/i);
    if (rel) return 'https://tmpfiles.org' + rel[1].replace(/&amp;/g, '&');
    return null;
  } catch {
    return null;
  }
}

function maskedProxyPlugin(): Plugin {
  const STRIP_KEYS = new Set(['creator', 'author', 'credit', 'credits', 'by', 'made_by']);

  function sanitizeJson(val: any, origin: string = ''): any {
    if (Array.isArray(val)) return val.map((item) => sanitizeJson(item, origin));
    if (val && typeof val === 'object') {
      return Object.fromEntries(
        Object.entries(val)
          .filter(([k]) => !STRIP_KEYS.has(k.toLowerCase()))
          .map(([k, v]) => [k, k.toLowerCase() === 'source' ? (origin ? `${origin}/api/movie` : '/api/movie') : sanitizeJson(v, origin)])
      );
    }
    if (typeof val === 'string') {
      const movieBase = origin ? `${origin}/api/movie` : '/api/movie';
      const fileBase = origin ? `${origin}/api/file` : '/api/file';
      return val
        .replace(/https:\/\/movie-downloader-api\.vercel\.app\/api/gi, movieBase)
        .replace(/https:\/\/movie-downloader-api\.vercel\.app/gi, movieBase)
        .replace(/movie-downloader-api\.vercel\.app/gi, 'kaalix-apis')
        .replace(/https:\/\/api\.onlyfiles\.com\/v1/gi, fileBase)
        .replace(/https:\/\/onlyfiles\.com/gi, fileBase)
        .replace(/api\.onlyfiles\.com/gi, 'kaalix-apis')
        .replace(/onlyfiles\.com/gi, 'kaalix-apis')
        .replace(/onlyfiles/gi, 'kaalix-storage')
        .replace(/OnlyFiles/gi, 'Kaalix Storage')
        .replace(/tmpfiles\.org/gi, 'kaalix-apis')
        .replace(/tmpfiles/gi, 'kaalix-storage')
        .replace(/https:\/\/s\.xysushi\.in/gi, 'kaalix-apis')
        .replace(/s\.xysushi\.in/gi, 'kaalix-apis')
        .replace(/https:\/\/isha-50-like-api-new\.vercel\.app/gi, 'kaalix-apis')
        .replace(/isha-50-like-api-new\.vercel\.app/gi, 'kaalix-apis')
        .replace(/key=ISHA/gi, '')
        .replace(/&key=[^&\s"]+/gi, '')
        .replace(/\?key=[^&\s"]+/gi, '')
        .replace(/"key":\s*"[^"]*"/gi, '')
        .replace(/Samuel-Rebix/gi, 'Kaalix')
        .replace(/Samuel\s*[-_]?\s*Rebix/gi, 'Kaalix')
        .replace(/Lord[-_]?Samuel/gi, 'kaalix-dev')
        .replace(/Samuel/gi, 'Kaalix')
        .replace(/Rebix/gi, 'Kaalix');
    }
    return val;
  }

  async function handleStreamDownload(key: string, res: any) {
    if (!key) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status: false, error: 'Bad Request', message: 'File ID or key is required.' }));
      return;
    }

    // 1. Resolve storage direct download link (file-uploader-bot pattern)
    let dlLink = await freshStorageLink(key);

    // 2. If not found, try tmpfiles
    if (!dlLink) {
      dlLink = await freshTempLink(`https://tmpfiles.org/${key}`);
    }

    if (!dlLink) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        status: false,
        error: 'File Not Found',
        message: 'The requested file could not be found or has expired.',
      }));
      return;
    }

    try {
      const fileRes = await fetch(dlLink, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          Referer: `https://onlyfiles.com/${key}`,
        },
      });

      if (!fileRes.ok) {
        res.statusCode = fileRes.status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          status: false,
          error: 'Download Failed',
          message: `Storage server returned HTTP ${fileRes.status}`,
        }));
        return;
      }

      res.statusCode = fileRes.status;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=86400');

      const cType = fileRes.headers.get('content-type') || 'application/octet-stream';
      res.setHeader('Content-Type', cType);

      const cDisp = fileRes.headers.get('content-disposition');
      if (cDisp) res.setHeader('Content-Disposition', cDisp);

      const cLen = fileRes.headers.get('content-length');
      if (cLen) res.setHeader('Content-Length', cLen);

      const acceptRanges = fileRes.headers.get('accept-ranges');
      if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);

      if (fileRes.body) {
        Readable.fromWeb(fileRes.body as any).pipe(res);
        return;
      } else {
        const buf = Buffer.from(await fileRes.arrayBuffer());
        res.end(buf);
      }
    } catch (err: any) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status: false, error: 'Stream Error', message: err?.message || 'Failed to stream file' }));
    }
  }

  return {
    name: 'masked-proxy-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url || '';

        // 1. Movie Downloader API proxy
        if (rawUrl.startsWith('/api/movie')) {
          try {
            const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || '';
            const proto = (req.headers['x-forwarded-proto'] as string) || (host.includes('localhost') ? 'http' : 'https');
            const origin = host ? `${proto}://${host}` : '';
            const movieBase = origin ? `${origin}/api/movie` : '/api/movie';

            const parsed = new URL(rawUrl, 'http://localhost');
            const subPath = parsed.pathname.replace(/^\/api\/movie/, '');
            const targetUrl = `https://movie-downloader-api.vercel.app/api${subPath}${parsed.search}`;
            const upstream = await fetch(targetUrl, {
              method: req.method || 'GET',
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                ...(req.headers['range'] ? { Range: req.headers['range'] as string } : {}),
              },
            });

            res.statusCode = upstream.status;

            const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
            res.setHeader('Content-Type', contentType);
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Expose-Headers', '*');

            if (contentType.includes('application/json')) {
              let text = await upstream.text();
              text = text
                .replace(/https:\/\/movie-downloader-api\.vercel\.app\/api/gi, movieBase)
                .replace(/https:\/\/movie-downloader-api\.vercel\.app/gi, movieBase)
                .replace(/movie-downloader-api\.vercel\.app/gi, 'kaalix-apis')
                .replace(/Samuel-Rebix/gi, 'Kaalix')
                .replace(/Samuel\s*[-_]?\s*Rebix/gi, 'Kaalix')
                .replace(/Lord[-_]?Samuel/gi, 'kaalix-dev')
                .replace(/Samuel/gi, 'Kaalix')
                .replace(/Rebix/gi, 'Kaalix');
              try {
                const parsedData = JSON.parse(text);
                const cleaned = sanitizeJson(parsedData, origin);
                res.end(JSON.stringify(cleaned));
              } catch {
                res.end(text);
              }
              return;
            } else {
              // Direct video/media stream: stream directly with Content-Disposition attachment for immediate download
              const upstreamDisposition = upstream.headers.get('content-disposition');
              if (upstreamDisposition) {
                res.setHeader('Content-Disposition', upstreamDisposition);
              } else {
                const queryFilename = parsed.searchParams.get('filename') || parsed.pathname.split('/').pop() || 'movie-download.mp4';
                const safeFilename = queryFilename.endsWith('.mp4') || queryFilename.endsWith('.mkv') ? queryFilename : `${queryFilename}.mp4`;
                res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
              }

              const contentLength = upstream.headers.get('content-length');
              if (contentLength) {
                res.setHeader('Content-Length', contentLength);
              }

              const acceptRanges = upstream.headers.get('accept-ranges');
              if (acceptRanges) {
                res.setHeader('Accept-Ranges', acceptRanges);
              }

              const contentRange = upstream.headers.get('content-range');
              if (contentRange) {
                res.setHeader('Content-Range', contentRange);
              }

              if (upstream.body) {
                Readable.fromWeb(upstream.body as any).pipe(res);
                return;
              } else {
                const buffer = Buffer.from(await upstream.arrayBuffer());
                res.end(buffer);
                return;
              }
            }
          } catch (e: any) {
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Movie Proxy Error', message: e?.message }));
            return;
          }
        }

        // 2. Free Fire API Proxy (/api/ff/profile, /api/ff/info, /api/ff/like)
        if (rawUrl.startsWith('/api/ff')) {
          try {
            const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || '';
            const proto = (req.headers['x-forwarded-proto'] as string) || (host.includes('localhost') ? 'http' : 'https');
            const origin = host ? `${proto}://${host}` : '';

            const parsed = new URL(rawUrl, 'http://localhost');
            const sub = parsed.pathname.replace(/^\/api\/ff\/?/, '').toLowerCase();

            // 2a. FF Profile Info: /api/ff/profile or /api/ff/info
            if (sub === 'profile' || sub === 'info' || sub === '') {
              const uid = parsed.searchParams.get('uid') || '';
              if (!uid) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ status: false, error: 'UID is required', example: '/api/ff/profile?uid=1231557272' }));
                return;
              }
              const upstream = await fetch(`https://s.xysushi.in/ff/?uid=${encodeURIComponent(uid)}`, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                  'Accept': 'application/json',
                },
              });
              res.statusCode = upstream.status;
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              const text = await upstream.text();
              try {
                const parsedData = JSON.parse(text);
                res.end(JSON.stringify(sanitizeJson(parsedData, origin)));
              } catch {
                res.end(text);
              }
              return;
            }

            // 2b. FF Like API: /api/ff/like (Server secret key ISHA injected securely, never exposed)
            if (sub === 'like') {
              const uid = parsed.searchParams.get('uid') || '';
              const region = (parsed.searchParams.get('region') || parsed.searchParams.get('server_name') || 'IND').toUpperCase();
              if (!uid) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ status: false, error: 'UID is required', example: '/api/ff/like?uid=2093756996&region=IND' }));
                return;
              }

              // Upstream secret key 'ISHA' is strictly maintained on the server and never exposed to the client
              const targetUrl = `https://isha-50-like-api-new.vercel.app/like?uid=${encodeURIComponent(uid)}&server_name=${encodeURIComponent(region)}&key=ISHA`;
              const upstream = await fetch(targetUrl, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                  'Accept': 'application/json',
                },
              });

              res.statusCode = upstream.status;
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');

              let text = await upstream.text();
              text = text
                .replace(/https:\/\/isha-50-like-api-new\.vercel\.app/gi, 'kaalix-apis')
                .replace(/isha-50-like-api-new\.vercel\.app/gi, 'kaalix-apis')
                .replace(/key=ISHA/gi, '')
                .replace(/&key=[^&\s"]+/gi, '')
                .replace(/\?key=[^&\s"]+/gi, '')
                .replace(/"key":\s*"[^"]*"/gi, '');

              try {
                const parsedData = JSON.parse(text);
                delete parsedData.key;
                res.end(JSON.stringify(sanitizeJson(parsedData, origin)));
              } catch {
                res.end(text);
              }
              return;
            }

            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ status: false, error: 'Unknown Free Fire Endpoint', available: ['/api/ff/profile', '/api/ff/like'] }));
            return;
          } catch (e: any) {
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'FreeFire Proxy Error', message: e?.message }));
            return;
          }
        }

        // 3. Direct File Download & Short URL Routes: /file/:key
        if (rawUrl.startsWith('/file/') || rawUrl === '/file') {
          const parsed = new URL(rawUrl, 'http://localhost');
          const segments = parsed.pathname.replace(/^\/file\/?/, '').split('/');
          const key = segments[0]?.replace(/\.[a-zA-Z0-9]+$/, '') || '';
          await handleStreamDownload(key, res);
          return;
        }

        // 3. Clean File Storage API Proxy: /api/file, /api/upload, and legacy /api/onlyfiles
        const isFileApi =
          rawUrl.startsWith('/api/file') ||
          rawUrl.startsWith('/api/upload') ||
          rawUrl.startsWith('/api/onlyfiles');

        if (isFileApi) {
          try {
            const parsed = new URL(rawUrl, 'http://localhost');

            // 3a. Direct file stream / download route
            const isDownloadRoute =
              parsed.pathname === '/api/file/download' ||
              parsed.pathname === '/api/file/file' ||
              parsed.pathname === '/api/file' ||
              parsed.pathname.startsWith('/api/file/download/') ||
              parsed.pathname.startsWith('/api/file/file/') ||
              parsed.pathname === '/api/onlyfiles/file' ||
              parsed.pathname === '/api/onlyfiles/download' ||
              parsed.pathname.startsWith('/api/onlyfiles/file/') ||
              parsed.pathname.startsWith('/api/onlyfiles/download/');

            if (isDownloadRoute) {
              let key = parsed.searchParams.get('id') || parsed.searchParams.get('key') || '';
              if (!key) {
                const parts = parsed.pathname.replace(/^\/api\/(?:file|onlyfiles)\/(?:file|download)\/?/, '').split('/');
                key = parts[0]?.replace(/\.[a-zA-Z0-9]+$/, '') || '';
              }
              await handleStreamDownload(key, res);
              return;
            }

            // 3b. File Metadata Info route: /api/file/info
            const isInfoRoute =
              parsed.pathname === '/api/file/info' ||
              parsed.pathname.startsWith('/api/file/info/') ||
              parsed.pathname === '/api/onlyfiles/info' ||
              parsed.pathname.startsWith('/api/onlyfiles/info/');

            if (isInfoRoute) {
              let key = parsed.searchParams.get('id') || '';
              if (!key) {
                const parts = parsed.pathname.replace(/^\/api\/(?:file|onlyfiles)\/info\/?/, '').split('/');
                key = parts[0] || '';
              }
              const infoRes = await fetch(`https://api.onlyfiles.com/v1/file/${encodeURIComponent(key)}/info`, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                  Referer: 'https://onlyfiles.com/',
                },
              });
              const contentType = infoRes.headers.get('content-type') || 'application/json';
              res.setHeader('Content-Type', contentType);
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.statusCode = infoRes.status;

              const text = await infoRes.text();
              try {
                const json = JSON.parse(text);
                if (json?.data?.file) {
                  const id = json.data.file.metadata?.id || key;
                  const name = json.data.file.metadata?.name || '';
                  json.data.file.url = {
                    full: `/api/file/download?id=${id}`,
                    short: `/file/${id}`,
                    download: `/api/file/download?id=${id}`,
                    direct: `/file/${id}/${name}`,
                    info: `/api/file/info?id=${id}`,
                  };
                }
                const cleaned = sanitizeJson(json);
                res.end(JSON.stringify(cleaned));
              } catch {
                res.end(sanitizeJson(text));
              }
              return;
            }

            // 3c. Upload route: /api/file/upload or /api/upload
            const isUploadRoute =
              parsed.pathname === '/api/file/upload' ||
              parsed.pathname === '/api/upload' ||
              parsed.pathname === '/api/onlyfiles/upload';

            if (isUploadRoute) {
              let reqBody: Buffer | undefined = undefined;
              if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
                const chunks: Buffer[] = [];
                for await (const chunk of req) {
                  chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
                }
                reqBody = Buffer.concat(chunks);
              }

              const upstreamTarget = `https://api.onlyfiles.com/v1/upload${parsed.search}`;
              const upstream = await fetch(upstreamTarget, {
                method: req.method || 'POST',
                body: reqBody ? new Uint8Array(reqBody) : undefined,
                headers: {
                  'User-Agent': 'Mozilla/5.0 (compatible; KaalixFileStorage/1.0)',
                  Referer: 'https://onlyfiles.com/',
                  ...(req.headers['content-type'] ? { 'content-type': req.headers['content-type'] as string } : {}),
                },
              });

              const contentType = upstream.headers.get('content-type') || 'application/json';
              res.setHeader('Content-Type', contentType);
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.statusCode = upstream.status;

              const text = await upstream.text();
              try {
                const parsedData = JSON.parse(text);
                if (parsedData?.data?.file) {
                  const id = parsedData.data.file.metadata?.id || '';
                  const name = parsedData.data.file.metadata?.name || '';
                  parsedData.data.file.url = {
                    full: `/api/file/download?id=${id}`,
                    short: `/file/${id}`,
                    download: `/api/file/download?id=${id}`,
                    direct: `/file/${id}/${name}`,
                    info: `/api/file/info?id=${id}`,
                  };
                }
                const cleaned = sanitizeJson(parsedData);
                res.end(JSON.stringify(cleaned));
              } catch {
                res.end(sanitizeJson(text));
              }
              return;
            }

            // 3d. Fallback for other file storage subpaths
            const sub = parsed.pathname.replace(/^\/api\/(?:file|onlyfiles)/, '');
            const target = `https://api.onlyfiles.com/v1${sub}${parsed.search}`;
            const upstream = await fetch(target, {
              method: req.method || 'GET',
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                Referer: 'https://onlyfiles.com/',
                ...(req.headers['content-type'] ? { 'content-type': req.headers['content-type'] as string } : {}),
              },
            });

            const contentType = upstream.headers.get('content-type') || 'application/json';
            res.setHeader('Content-Type', contentType);
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.statusCode = upstream.status;

            if (contentType.includes('application/json')) {
              const text = await upstream.text();
              try {
                res.end(JSON.stringify(sanitizeJson(JSON.parse(text))));
              } catch {
                res.end(sanitizeJson(text));
              }
              return;
            } else {
              const buffer = Buffer.from(await upstream.arrayBuffer());
              res.end(buffer);
              return;
            }
          } catch (e: any) {
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'File Storage Error', message: e?.message }));
            return;
          }
        }

        next();
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), maskedProxyPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        // Direct Blue Archive compatibility route through upstream
        '/api/bluearchive': {
          target: 'https://api-rebix.vercel.app',
          changeOrigin: true,
        },
        // Pollinations image API: use /api/pollinations/prompt/...
        '/api/pollinations': {
          target: 'https://image.pollinations.ai',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/pollinations/, ''),
        },
        // Existing API upstream: use /api/v1/zone/...
        '/api/v1/zone': {
          target: 'https://api-rebix.vercel.app',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/v1\/zone/, ''),
        },
        // Zone.id convenience namespace: use /api/zone/...
        '/api/zone': {
          target: 'https://api-rebix.vercel.app',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/zone/, ''),
        },
        '/api/v1': {
          target: 'https://api-rebix.vercel.app',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/v1/, ''),
        },
        '/api': {
          target: 'https://api-rebix.vercel.app',
          changeOrigin: true,
        },
      },
    },
  };
});
