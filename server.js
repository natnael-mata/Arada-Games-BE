const http = require('http');
const https = require('https');
const { URL } = require('url');
const db = require('./db');

const host = process.env.API_HOST || '0.0.0.0';
const port = Number(process.env.API_PORT || 3000);
const archersWebUrl = process.env.ARCHERS_WEB_URL || 'http://localhost:8081/';
const archersHealthUrl =
  process.env.ARCHERS_HEALTH_URL || new URL('healthz', archersWebUrl).toString();
const corsOrigin = process.env.CORS_ORIGIN || '*';

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(payload));
}

function sendNotFound(res) {
  sendJson(res, 404, {
    ok: false,
    message: 'Resource not found',
  });
}

function formatGame(row) {
  return {
    slug: row.slug,
    name: row.name,
    image: row.image,
    route: row.route,
    modeLabel: row.modeLabel,
    playerCountLabel: row.playerCountLabel,
    rating: row.rating,
    launch: {
      type: row.launchType,
      url: row.launchUrl,
      requiresHealthCheck: !!row.requiresHealthCheck,
    },
  };
}

async function getGames() {
  const [rows] = await db.query('SELECT * FROM games');
  return rows.map(formatGame);
}

async function getGame(slug) {
  const [rows] = await db.query('SELECT * FROM games WHERE slug = ?', [slug]);
  return rows.length > 0 ? formatGame(rows[0]) : null;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on('data', (chunk) => {
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (!chunks.length) {
        resolve({});
        return;
      }

      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(parsed);
      } catch (error) {
        reject(error);
      }
    });

    req.on('error', reject);
  });
}

function probeJson(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https://') ? https : http;
    const request = client.get(url, { timeout: 3000 }, (response) => {
      const chunks = [];

      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');

        if (response.statusCode && response.statusCode >= 400) {
          reject(new Error(`Upstream responded with status ${response.statusCode}`));
          return;
        }

        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on('timeout', () => {
      request.destroy(new Error('Health check timed out'));
    });
    request.on('error', reject);
  });
}

async function handleContact(req, res) {
  try {
    const body = await readJsonBody(req);
    const fullName = String(body.fullName || '').trim();
    const phoneNumber = String(body.phoneNumber || '').trim();
    const message = String(body.message || '').trim();

    if (!fullName || !phoneNumber || !message) {
      sendJson(res, 400, {
        ok: false,
        message: 'Full name, phone number, and message are required.',
      });
      return;
    }

    await db.query(
      'INSERT INTO contact_submissions (fullName, phoneNumber, message) VALUES (?, ?, ?)',
      [fullName, phoneNumber, message]
    );

    sendJson(res, 201, {
      ok: true,
      message: 'Your message was sent successfully.',
    });
  } catch (error) {
    sendJson(res, 400, {
      ok: false,
      message: 'The request body must be valid JSON.',
    });
  }
}

async function handleLogin(req, res) {
  try {
    const body = await readJsonBody(req);
    const userId = String(body.user_id || '').trim();
    const password = String(body.password || '').trim();

    if (!userId || !password) {
      sendJson(res, 400, {
        ok: false,
        message: 'User ID and password are required.',
      });
      return;
    }

    const [rows] = await db.query(
      'SELECT id, user_id, status FROM users WHERE user_id = ? AND password = ?',
      [userId, password]
    );

    if (rows.length === 0) {
      sendJson(res, 401, {
        ok: false,
        message: 'Invalid User ID or password.',
      });
      return;
    }

    const user = rows[0];

    if (user.status !== 'active') {
      sendJson(res, 403, {
        ok: false,
        message: 'Your account is inactive. Please contact support.',
      });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      message: 'Login successful.',
      user: {
        id: user.id,
        user_id: user.user_id,
        status: user.status
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    sendJson(res, 500, {
      ok: false,
      message: 'An error occurred during login.',
    });
  }
}

async function handleGameHealth(res, slug) {
  const game = await getGame(slug);

  if (!game) {
    sendNotFound(res);
    return;
  }

  if (!game.launch.requiresHealthCheck) {
    sendJson(res, 200, {
      ok: true,
      game: game.slug,
      launchUrl: game.launch.url,
    });
    return;
  }

  try {
    await probeJson(archersHealthUrl);
    sendJson(res, 200, {
      ok: true,
      game: game.slug,
      launchUrl: game.launch.url,
    });
  } catch (error) {
    sendJson(res, 503, {
      ok: false,
      game: game.slug,
      launchUrl: game.launch.url,
      details:
        'ArchersWebb is unavailable. Start it with `npm start` or `npm run start:archers`.',
    });
  }
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = requestUrl.pathname;

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  try {
    if (req.method === 'GET' && pathname === '/api/health') {
      sendJson(res, 200, {
        ok: true,
        service: 'arada-games-api',
        archersWebUrl,
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/games') {
      const gamesList = await getGames();
      sendJson(res, 200, gamesList);
      return;
    }

    const gameMatch = pathname.match(/^\/api\/games\/([^/]+)$/);
    if (req.method === 'GET' && gameMatch) {
      const game = await getGame(gameMatch[1]);
      if (!game) {
        sendNotFound(res);
        return;
      }

      sendJson(res, 200, game);
      return;
    }

    const healthMatch = pathname.match(/^\/api\/games\/([^/]+)\/health$/);
    if (req.method === 'GET' && healthMatch) {
      await handleGameHealth(res, healthMatch[1]);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/contact') {
      await handleContact(req, res);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/login') {
      await handleLogin(req, res);
      return;
    }

    sendNotFound(res);
  } catch (error) {
    console.error('Server error:', error);
    sendJson(res, 500, {
      ok: false,
      message: 'Internal server error',
    });
  }
});

server.listen(port, host, () => {
  console.log(`API running at http://${host}:${port}`);
});
