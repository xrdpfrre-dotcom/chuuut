import { Readable } from 'stream';

const STRIP_KEYS = new Set(['creator', 'author', 'credit', 'credits', 'by', 'made_by']);

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

async function freshTempLink(pageUrl: string): Promise<string | null> {
  try {
    const pageRes = await fetch(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Referer: 'https://tmpfiles.org/',
      },
    });
    if (!pageRes.ok) return null;
    const html = await pageRes.text();
    const directMatch = html.match(/https?:\/\/[a-zA-Z0-9.-]*tmpfiles\.org\/dl\/[^\s"'<>]+/i);
    if (directMatch) return directMatch[0];
    const slashDl = html.match(/["'](\/dl\/[^\s"'<>]+)["']/i);
    if (slashDl) return 'https://tmpfiles.org' + slashDl[1];
    return null;
  } catch {
    return null;
  }
}

function sanitizeJson(val: any, origin = ''): any {
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

export default async function handler(req: any, res: any) {
  const rawUrl = req.url || '';
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || '';
  const proto = (req.headers['x-forwarded-proto'] as string) || (host.includes('localhost') ? 'http' : 'https');
  const origin = host ? `${proto}://${host}` : '';
  const movieBase = origin ? `${origin}/api/movie` : '/api/movie';
  const fileBase = origin ? `${origin}/api/file` : '/api/file';

  // 1. Movie API Proxy
  if (rawUrl.startsWith('/api/movie')) {
    try {
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
        // Direct media stream: instant download with Content-Disposition attachment
        const upstreamDisposition = upstream.headers.get('content-disposition');
        if (upstreamDisposition) {
          res.setHeader('Content-Disposition', upstreamDisposition);
        } else {
          const queryFilename = parsed.searchParams.get('filename') || parsed.pathname.split('/').pop() || 'movie-download.mp4';
          const safeFilename = queryFilename.endsWith('.mp4') || queryFilename.endsWith('.mkv') ? queryFilename : `${queryFilename}.mp4`;
          res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
        }

        const contentLength = upstream.headers.get('content-length');
        if (contentLength) res.setHeader('Content-Length', contentLength);

        const acceptRanges = upstream.headers.get('accept-ranges');
        if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);

        const contentRange = upstream.headers.get('content-range');
        if (contentRange) res.setHeader('Content-Range', contentRange);

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

  // 3. Direct File Download & Short URL Routes: /file/:key or /api/file/download
  if (rawUrl.startsWith('/file/') || rawUrl.startsWith('/api/file/download')) {
    try {
      const parsed = new URL(rawUrl, 'http://localhost');
      let key = parsed.searchParams.get('id') || parsed.searchParams.get('key') || '';
      if (!key) {
        const segments = parsed.pathname.replace(/^\/(?:file|api\/file\/download)\/?/, '').split('/');
        key = segments[0]?.replace(/\.[a-zA-Z0-9]+$/, '') || '';
      }

      let dlLink = await freshStorageLink(key);
      if (!dlLink) dlLink = await freshTempLink(`https://tmpfiles.org/${key}`);

      if (!dlLink) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ status: false, error: 'File Not Found', message: 'File not found or expired.' }));
        return;
      }

      const fileRes = await fetch(dlLink, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          Referer: `https://onlyfiles.com/${key}`,
        },
      });

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
        return;
      }
    } catch (err: any) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status: false, error: 'Stream Error', message: err?.message }));
      return;
    }
  }

  // 3. File Upload Proxy: /api/file/upload or /api/upload
  if (rawUrl.startsWith('/api/file/upload') || rawUrl.startsWith('/api/upload')) {
    try {
      const parsed = new URL(rawUrl, 'http://localhost');
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      const reqBody = Buffer.concat(chunks);

      const upstream = await fetch(`https://api.onlyfiles.com/v1/upload${parsed.search}`, {
        method: req.method || 'POST',
        body: reqBody.length > 0 ? new Uint8Array(reqBody) : undefined,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; KaalixFileStorage/1.0)',
          Referer: 'https://onlyfiles.com/',
          ...(req.headers['content-type'] ? { 'content-type': req.headers['content-type'] as string } : {}),
        },
      });

      res.statusCode = upstream.status;
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');

      const text = await upstream.text();
      try {
        const parsedData = JSON.parse(text);
        if (parsedData?.data?.file) {
          const id = parsedData.data.file.metadata?.id || '';
          const name = parsedData.data.file.metadata?.name || '';
          parsedData.data.file.url = {
            full: `${fileBase}/download?id=${id}`,
            short: `${origin ? `${origin}/file/${id}` : `/file/${id}`}`,
            download: `${fileBase}/download?id=${id}`,
            direct: `${origin ? `${origin}/file/${id}/${name}` : `/file/${id}/${name}`}`,
            info: `${fileBase}/info?id=${id}`,
          };
        }
        res.end(JSON.stringify(sanitizeJson(parsedData, origin)));
      } catch {
        res.end(text);
      }
      return;
    } catch (err: any) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status: false, error: 'Upload Proxy Error', message: err?.message }));
      return;
    }
  }

  // 4. Default 404 for unknown API routes
  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'Endpoint Not Found' }));
}
