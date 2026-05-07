const http = require('http');
const https = require('https');
const { URL } = require('url');
const db = require('./db');
const jwt = require('jsonwebtoken');
const { WebSocketServer, WebSocket } = require('ws');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const JWT_SECRET = process.env.JWT_SECRET || 'arada_super_secret_key_2026';
const host = '0.0.0.0'; // Bind to all interfaces
const port = Number(process.env.PORT || process.env.API_PORT || 3000);
const archersWebUrl = process.env.ARCHERS_WEB_URL || 'http://127.0.0.1:8081/';
const archersPublicUrl = '/api/archerswebb/';
const archersHealthUrl = new URL('healthz', archersWebUrl).toString();
const corsOrigin = process.env.CORS_ORIGIN || '*';

const DB_CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ER_ACCESS_DENIED_ERROR',
  'ER_BAD_DB_ERROR',
]);

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(payload));
}

async function checkDatabase() {
  try {
    await db.query('SELECT 1');
    return { ok: true };
  } catch (error) {
    console.error('Database health check failed:', error);
    return {
      ok: false,
      code: error.code || 'DB_HEALTH_CHECK_FAILED',
    };
  }
}

function getLoginErrorResponse(error) {
  if (DB_CONNECTION_ERROR_CODES.has(error.code)) {
    return {
      statusCode: 503,
      message: 'Database connection failed. Check the deployed DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, and DB_NAME settings.',
    };
  }

  if (
    error.code === 'ER_BAD_FIELD_ERROR' &&
    /active_token|active_device_id/i.test(error.sqlMessage || error.message || '')
  ) {
    return {
      statusCode: 500,
      message: 'The deployed database is missing login session columns. Run the users table migration for active_token and active_device_id.',
    };
  }

  return {
    statusCode: 500,
    message: 'An error occurred during login.',
  };
}

function sendNotFound(res) {
  sendJson(res, 404, {
    ok: false,
    message: 'Resource not found',
  });
}

function formatGame(row) {
  const launchUrl = row.slug === 'archerswebb' ? archersPublicUrl : row.launchUrl;

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
      url: launchUrl,
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
          const error = new Error(`Upstream responded with status ${response.statusCode}`);
          error.statusCode = response.statusCode;
          error.body = body;
          reject(error);
          return;
        }

        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (error) {
          console.error(`Failed to parse JSON from ${url}:`, body);
          reject(new Error(`Invalid JSON response from upstream: ${error.message}`));
        }
      });
    });

    request.on('timeout', () => {
      request.destroy(new Error('Health check timed out after 3000ms'));
    });
    request.on('error', (error) => {
      console.error(`Probe error for ${url}:`, error.message || error);
      reject(error);
    });
  });
}

function proxyArchersWeb(req, res, pathname, requestUrl) {
  const targetPath = pathname.replace(/^\/api\/archerswebb|^\/archerswebb/, '') || '/';
  const targetUrl = new URL(targetPath + requestUrl.search, archersWebUrl);
  const client = targetUrl.protocol === 'https:' ? https : http;

  const proxyReq = client.request(
    targetUrl,
    {
      method: req.method,
      headers: {
        ...req.headers,
        host: targetUrl.host,
      },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, {
        ...proxyRes.headers,
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
      });
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', (error) => {
    console.error('ArchersWebb proxy error:', error);
    sendJson(res, 503, {
      ok: false,
      message: 'ArchersWebb is unavailable. Make sure the ArchersWebb process is running with the API.',
    });
  });

  req.pipe(proxyReq);
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
      'SELECT user_id, full_name, nick_name, sex, status, email, telegram_username, address, active_token, active_device_id FROM users WHERE user_id = ? AND password = ?',
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

    const deviceId = String(body.device_id || '').trim();

    if (user.active_token) {
      try {
        jwt.verify(user.active_token, JWT_SECRET);

        // If the device_id matches, we allow re-login (e.g. browser was closed)
        if (user.active_device_id && user.active_device_id !== deviceId) {
          sendJson(res, 403, {
            ok: false,
            message: 'You are already logged in on another device. Please log out from that device first.',
          });
          return;
        }
      } catch (err) {
        // Token expired or invalid, proceed to login
      }
    }

    const token = jwt.sign({ user_id: user.user_id }, JWT_SECRET, { expiresIn: '24h' });

    await db.query('UPDATE users SET active_token = ?, active_device_id = ? WHERE user_id = ?', [token, deviceId, user.user_id]);

    sendJson(res, 200, {
      ok: true,
      message: 'Login successful.',
      token: token,
      user: {
        user_id: user.user_id,
        full_name: user.full_name,
        nick_name: user.nick_name,
        gender: user.sex,
        status: user.status,
        email: user.email,
        telegram_username: user.telegram_username,
        address: user.address
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    const loginError = getLoginErrorResponse(error);
    sendJson(res, loginError.statusCode, {
      ok: false,
      message: loginError.message,
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
    let errorMessage = error.message;
    if (!errorMessage) {
      errorMessage = error.code ? `Error Code: ${error.code}` : JSON.stringify(error);
    }
    if (!errorMessage || errorMessage === '{}') {
      errorMessage = 'No error message provided by system';
    }
    
    console.error(`Game health check failed for ${slug}:`, error);
    
    sendJson(res, 503, {
      ok: false,
      game: game.slug,
      launchUrl: game.launch.url,
      details:
        `ArchersWebb is unavailable (${errorMessage}). Start it with npm start or npm run start:archers.`,
    });
  }
}

function verifyToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

// ===========================
// WebSocket Multiplayer System
// ===========================
const rooms = new Map(); // roomCode -> { players: [], board, currentTurn, round, scores, status }

function generateRoomCode() {
  let code;
  do {
    code = Math.floor(1000 + Math.random() * 9000).toString();
  } while (rooms.has(code));
  return code;
}

function broadcastToRoom(roomCode, message) {
  const room = rooms.get(roomCode);
  if (!room) return;
  const data = JSON.stringify(message);
  room.players.forEach(p => {
    if (p.ws && p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(data);
    }
  });
}

function sendToPlayer(ws, message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function checkWinnerServer(board) {
  const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];
  for (const [a, b, c] of winPatterns) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line: [a, b, c] };
    }
  }
  if (!board.includes('')) return { winner: 'draw', line: null };
  return null;
}

function calculateMpScore(result, movesTaken) {
  if (result === 'loss') return 0;
  if (result === 'draw') return 25;
  const baseScore = 100;
  const moveBonus = (9 - movesTaken) * 10;
  return baseScore + moveBonus;
}

async function saveMultiplayerScore(userId, nickName, score, movesTaken, result) {
  try {
    await db.query(
      'INSERT INTO game_scores (user_id, nick_name, score, game_mode, difficulty, moves_taken, result, game_slug) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [userId, nickName, score, 'multiplayer', null, movesTaken, result, 'xo']
    );
  } catch (e) {
    console.error('Failed to save multiplayer score:', e);
  }
}

function getOpenRooms() {
  const openRooms = [];
  rooms.forEach((room, code) => {
    if (room.status === 'waiting' && room.players.length === 1) {
      openRooms.push({
        code,
        hostName: room.players[0].nickName,
        createdAt: room.createdAt
      });
    }
  });
  return openRooms;
}

function resetRoomBoard(room) {
  room.board = ['', '', '', '', '', '', '', '', ''];
  room.movesTaken = 0;
  // Alternate who goes first each round
  room.currentTurn = room.round % 2 === 0 ? 'X' : 'O';
}

function handleWsMessage(ws, data) {
  let msg;
  try {
    msg = JSON.parse(data);
  } catch (e) {
    return sendToPlayer(ws, { type: 'error', message: 'Invalid JSON' });
  }

  switch (msg.type) {

    case 'create_room': {
      const code = generateRoomCode();
      const room = {
        players: [{
          ws,
          userId: msg.userId,
          nickName: msg.nickName,
          symbol: 'X'
        }],
        board: ['', '', '', '', '', '', '', '', ''],
        currentTurn: 'X',
        round: 1,
        movesTaken: 0,
        scores: { X: 0, O: 0 },
        status: 'waiting',
        createdAt: Date.now()
      };
      rooms.set(code, room);
      ws._roomCode = code;
      ws._symbol = 'X';

      sendToPlayer(ws, {
        type: 'room_created',
        roomCode: code,
        symbol: 'X',
        nickName: msg.nickName
      });
      console.log(`Room ${code} created by ${msg.nickName}`);
      break;
    }

    case 'join_room': {
      const code = msg.roomCode;
      const room = rooms.get(code);

      if (!room) {
        return sendToPlayer(ws, { type: 'error', message: 'Room not found.' });
      }
      if (room.status !== 'waiting') {
        return sendToPlayer(ws, { type: 'error', message: 'Room is already full or game in progress.' });
      }
      if (room.players.length >= 2) {
        return sendToPlayer(ws, { type: 'error', message: 'Room is full.' });
      }

      room.players.push({
        ws,
        userId: msg.userId,
        nickName: msg.nickName,
        symbol: 'O'
      });
      room.status = 'playing';
      ws._roomCode = code;
      ws._symbol = 'O';

      // Notify joiner
      sendToPlayer(ws, {
        type: 'room_joined',
        roomCode: code,
        symbol: 'O',
        opponentName: room.players[0].nickName
      });

      // Notify host that opponent joined
      sendToPlayer(room.players[0].ws, {
        type: 'opponent_joined',
        opponentName: msg.nickName
      });

      // Start the game
      broadcastToRoom(code, {
        type: 'game_start',
        board: room.board,
        currentTurn: room.currentTurn,
        round: room.round,
        scores: room.scores,
        players: {
          X: room.players[0].nickName,
          O: room.players[1].nickName
        }
      });

      console.log(`${msg.nickName} joined room ${code}`);
      break;
    }

    case 'join_random': {
      // Find any waiting room
      let foundCode = null;
      let foundRoom = null;
      for (const [code, room] of rooms) {
        if (room.status === 'waiting' && room.players.length === 1) {
          foundCode = code;
          foundRoom = room;
          break;
        }
      }

      if (foundRoom) {
        // Join existing room
        foundRoom.players.push({
          ws,
          userId: msg.userId,
          nickName: msg.nickName,
          symbol: 'O'
        });
        foundRoom.status = 'playing';
        ws._roomCode = foundCode;
        ws._symbol = 'O';

        sendToPlayer(ws, {
          type: 'room_joined',
          roomCode: foundCode,
          symbol: 'O',
          opponentName: foundRoom.players[0].nickName
        });

        sendToPlayer(foundRoom.players[0].ws, {
          type: 'opponent_joined',
          opponentName: msg.nickName
        });

        broadcastToRoom(foundCode, {
          type: 'game_start',
          board: foundRoom.board,
          currentTurn: foundRoom.currentTurn,
          round: foundRoom.round,
          scores: foundRoom.scores,
          players: {
            X: foundRoom.players[0].nickName,
            O: foundRoom.players[1].nickName
          }
        });
      } else {
        // Create new room and wait
        const code = generateRoomCode();
        const room = {
          players: [{
            ws,
            userId: msg.userId,
            nickName: msg.nickName,
            symbol: 'X'
          }],
          board: ['', '', '', '', '', '', '', '', ''],
          currentTurn: 'X',
          round: 1,
          movesTaken: 0,
          scores: { X: 0, O: 0 },
          status: 'waiting',
          createdAt: Date.now()
        };
        rooms.set(code, room);
        ws._roomCode = code;
        ws._symbol = 'X';

        sendToPlayer(ws, {
          type: 'room_created',
          roomCode: code,
          symbol: 'X',
          nickName: msg.nickName,
          isRandom: true
        });
      }
      break;
    }

    case 'list_rooms': {
      sendToPlayer(ws, {
        type: 'room_list',
        rooms: getOpenRooms()
      });
      break;
    }

    case 'make_move': {
      const code = ws._roomCode;
      const room = rooms.get(code);

      if (!room || room.status !== 'playing') {
        return sendToPlayer(ws, { type: 'error', message: 'No active game.' });
      }

      const playerSymbol = ws._symbol;
      if (playerSymbol !== room.currentTurn) {
        return sendToPlayer(ws, { type: 'error', message: 'Not your turn.' });
      }

      const idx = msg.index;
      if (idx < 0 || idx > 8 || room.board[idx] !== '') {
        return sendToPlayer(ws, { type: 'error', message: 'Invalid move.' });
      }

      room.board[idx] = playerSymbol;
      room.movesTaken++;

      const result = checkWinnerServer(room.board);

      if (result) {
        if (result.winner === 'draw') {
          room.scores.X += 0;
          room.scores.O += 0;

          broadcastToRoom(code, {
            type: 'round_end',
            board: room.board,
            result: 'draw',
            winner: null,
            line: null,
            scores: room.scores,
            round: room.round,
            movesTaken: room.movesTaken
          });

          // Save scores for both players
          for (const p of room.players) {
            const score = calculateMpScore('draw', room.movesTaken);
            saveMultiplayerScore(p.userId, p.nickName, score, room.movesTaken, 'draw');
          }
        } else {
          const winnerSymbol = result.winner;
          room.scores[winnerSymbol]++;

          broadcastToRoom(code, {
            type: 'round_end',
            board: room.board,
            result: 'win',
            winner: winnerSymbol,
            line: result.line,
            scores: room.scores,
            round: room.round,
            movesTaken: room.movesTaken
          });

          // Save scores
          for (const p of room.players) {
            const isWinner = p.symbol === winnerSymbol;
            const pResult = isWinner ? 'win' : 'loss';
            const score = calculateMpScore(pResult, room.movesTaken);
            saveMultiplayerScore(p.userId, p.nickName, score, room.movesTaken, pResult);
          }
        }

        // Prepare next round
        room.round++;
        resetRoomBoard(room);
      } else {
        room.currentTurn = playerSymbol === 'X' ? 'O' : 'X';
        broadcastToRoom(code, {
          type: 'move_made',
          board: room.board,
          index: idx,
          player: playerSymbol,
          currentTurn: room.currentTurn,
          movesTaken: room.movesTaken
        });
      }
      break;
    }

    case 'new_round': {
      const code = ws._roomCode;
      const room = rooms.get(code);
      if (!room) return;

      broadcastToRoom(code, {
        type: 'game_start',
        board: room.board,
        currentTurn: room.currentTurn,
        round: room.round,
        scores: room.scores,
        players: {
          X: room.players[0] ? room.players[0].nickName : '?',
          O: room.players[1] ? room.players[1].nickName : '?'
        }
      });
      break;
    }

    case 'send_chat': {
      const code = ws._roomCode;
      if (!code) return;
      broadcastToRoom(code, {
        type: 'chat_message',
        nickName: msg.nickName,
        text: msg.text,
        timestamp: Date.now()
      });
      break;
    }

    case 'leave_room': {
      handlePlayerLeave(ws);
      break;
    }

    default:
      sendToPlayer(ws, { type: 'error', message: 'Unknown message type.' });
  }
}

function handlePlayerLeave(ws) {
  const code = ws._roomCode;
  if (!code) return;

  const room = rooms.get(code);
  if (!room) return;

  const leavingPlayer = room.players.find(p => p.ws === ws);
  const remainingPlayer = room.players.find(p => p.ws !== ws);

  if (room.status === 'playing' && leavingPlayer && remainingPlayer) {
    // The leaving player loses, score = 0
    saveMultiplayerScore(leavingPlayer.userId, leavingPlayer.nickName, 0, room.movesTaken, 'abandoned');

    // The remaining player wins
    const score = calculateMpScore('win', room.movesTaken);
    saveMultiplayerScore(remainingPlayer.userId, remainingPlayer.nickName, score, room.movesTaken, 'win');

    sendToPlayer(remainingPlayer.ws, {
      type: 'opponent_left',
      message: `${leavingPlayer.nickName} left the game. You win!`
    });
  }

  rooms.delete(code);
  ws._roomCode = null;
  ws._symbol = null;
  console.log(`Room ${code} closed`);
}


const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = requestUrl.pathname;

  if (pathname === '/api/archerswebb' || pathname === '/archerswebb') {
    const publicPrefix = pathname.startsWith('/api/') ? '/api/archerswebb/' : '/archerswebb/';
    res.writeHead(302, {
      Location: `${publicPrefix}${requestUrl.search}`,
    });
    res.end();
    return;
  }

  if (pathname.startsWith('/api/archerswebb/') || pathname.startsWith('/archerswebb/')) {
    proxyArchersWeb(req, res, pathname, requestUrl);
    return;
  }

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  try {
    if (req.method === 'GET' && pathname === '/api/health') {
      const database = await checkDatabase();
      sendJson(res, database.ok ? 200 : 503, {
        ok: database.ok,
        service: 'arada-games-api',
        database,
        archersWebUrl,
        archersPublicUrl,
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

    if (req.method === 'GET' && pathname === '/api/profile') {
      const decoded = verifyToken(req);
      if (!decoded) {
        sendJson(res, 401, { ok: false, message: 'Unauthorized' });
        return;
      }
      const [rows] = await db.query(
        'SELECT user_id, full_name, nick_name, sex, status, email, telegram_username, address FROM users WHERE user_id = ?',
        [decoded.user_id]
      );
      if (rows.length === 0) {
        sendJson(res, 404, { ok: false, message: 'User not found' });
        return;
      }
      const user = rows[0];
      sendJson(res, 200, {
        ok: true,
        user: {
          user_id: user.user_id,
          full_name: user.full_name,
          nick_name: user.nick_name,
          gender: user.sex,
          status: user.status,
          email: user.email,
          telegram_username: user.telegram_username,
          address: user.address
        }
      });
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

    if (req.method === 'POST' && pathname === '/api/scores') {
      const decoded = verifyToken(req);
      if (!decoded) {
        sendJson(res, 401, { ok: false, message: 'Unauthorized' });
        return;
      }
      const body = await readJsonBody(req);
      const { score, game_mode, difficulty, moves_taken, result, game_slug } = body;

      // Get nick_name from users table
      const [userRows] = await db.query('SELECT nick_name FROM users WHERE user_id = ?', [decoded.user_id]);
      const nickName = userRows.length > 0 ? userRows[0].nick_name : 'Unknown';

      await db.query(
        'INSERT INTO game_scores (user_id, nick_name, score, game_mode, difficulty, moves_taken, result, game_slug) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [decoded.user_id, nickName, score, game_mode, difficulty, moves_taken, result, game_slug || 'xo']
      );

      sendJson(res, 201, { ok: true, message: 'Score saved successfully.' });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/scores/leaderboard') {
      const gameSlug = requestUrl.searchParams.get('game');
      const dateFilter = requestUrl.searchParams.get('date');

      let query = 'SELECT nick_name, MAX(score) as score FROM game_scores';
      const params = [];
      const conditions = [];

      if (gameSlug && gameSlug !== 'all') {
        conditions.push('game_slug = ?');
        params.push(gameSlug);
      }

      if (dateFilter && dateFilter !== 'all') {
        if (dateFilter === 'daily') {
          conditions.push('played_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)');
        } else if (dateFilter === 'weekly') {
          conditions.push('played_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)');
        } else if (dateFilter === 'monthly') {
          conditions.push('played_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)');
        }
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' GROUP BY nick_name ORDER BY score DESC LIMIT 10';

      try {
        const [rows] = await db.query(query, params);
        sendJson(res, 200, rows);
      } catch (err) {
        console.error(err);
        sendJson(res, 500, { ok: false, message: 'Database error' });
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/api/logout') {
      const decoded = verifyToken(req);
      if (decoded) {
        await db.query('UPDATE users SET active_token = NULL, active_device_id = NULL WHERE user_id = ?', [decoded.user_id]);
      }
      sendJson(res, 200, { ok: true, message: 'Logged out successfully.' });
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

// ===========================
// WebSocket Multi-Game Routing
// ===========================

// 1. Initialize XO WebSocket server in noServer mode
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws) => {
  console.log('XO WebSocket client connected');
  ws.on('message', (data) => handleWsMessage(ws, data.toString()));
  ws.on('close', () => {
    console.log('XO WebSocket client disconnected');
    handlePlayerLeave(ws);
  });
  ws.on('error', (err) => {
    console.error('XO WebSocket error:', err);
    handlePlayerLeave(ws);
  });
});

// 2. Handle Upgrade requests for both games
const net = require('net');

server.on('upgrade', (request, socket, head) => {
  const pathname = request.url.split('?')[0];

  if (pathname === '/api/ws') {
    // Route to XO game logic
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else if (pathname === '/api/archerswebb/ws' || pathname === '/archerswebb/ws') {
    // Proxy to Godot dedicated server for ArchersWebb (port 9090)
    console.log('Proxying ArchersWebb WebSocket to port 9090');

    const targetSocket = net.connect(9090, '127.0.0.1', () => {
      // Reconstruct the original HTTP upgrade request for the target
      let reqStr = `${request.method} ${request.url} HTTP/${request.httpVersion}\r\n`;
      for (const [key, value] of Object.entries(request.headers)) {
        reqStr += `${key}: ${value}\r\n`;
      }
      reqStr += '\r\n';

      targetSocket.write(reqStr);
      targetSocket.write(head);

      socket.pipe(targetSocket).pipe(socket);
    });

    targetSocket.on('error', (err) => {
      console.error('ArchersWebb WS Proxy Error:', err);
      socket.destroy();
    });

    socket.on('error', () => targetSocket.destroy());
  } else {
    socket.destroy();
// ===========================
// Auto-start ArchersWebb if not running
// ===========================
const archersStartScript = path.join(__dirname, 'ArchersWebb', 'start.js');
if (fs.existsSync(archersStartScript)) {
  console.log('Detected ArchersWebb, starting game server...');
  const archersProcess = spawn('node', [archersStartScript], {
    env: { ...process.env, WEB_PORT: '8081' },
    stdio: 'inherit',
    detached: false
  });

  archersProcess.on('error', (err) => {
    console.error('Failed to start ArchersWebb auto-launcher:', err);
  });
}

server.listen(port, host, () => {
  console.log(`API running at http://${host}:${port}`);
  console.log(`WebSocket server running on ws://${host}:${port}`);
});
