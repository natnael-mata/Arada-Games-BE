// Constants and State
const API_BASE = '/api';
const WS_URL =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'ws://localhost:3000'
        : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/api`;

let gameMode = 'single'; // 'single', 'multiplayer', 'local_pvp'
let difficulty = 'easy';
let level = 1;
let movesTaken = 0;
let currentPlayer = 'X';
let gameActive = false;
let cells = ['', '', '', '', '', '', '', '', ''];
let scoreX = 0;
let scoreO = 0;
let startTime;
let timerInterval;

// Multiplayer state
let ws = null;
let mySymbol = null;
let myNickName = 'Player';
let myUserId = null;
let currentRoomCode = null;
let isMyTurn = false;
let roundNumber = 1;

// DOM Elements
const mainMenu = document.getElementById('main-menu');
const difficultyMenu = document.getElementById('difficulty-menu');
const multiplayerMenu = document.getElementById('multiplayer-menu');
const joinRoomMenu = document.getElementById('join-room-menu');
const waitingRoom = document.getElementById('waiting-room');
const roomsListMenu = document.getElementById('rooms-list-menu');
const gameScreen = document.getElementById('game-screen');
const board = document.getElementById('board');
const messageDisplay = document.getElementById('message');
const timerDisplay = document.getElementById('timer');
const levelDisplay = document.getElementById('level-display');
const roundDisplay = document.getElementById('round-display');
const currentLevelSpan = document.getElementById('current-level');
const currentRoundSpan = document.getElementById('current-round');
const scoreXDisplay = document.getElementById('score-x');
const scoreODisplay = document.getElementById('score-o');
const nameXDisplay = document.getElementById('name-x');
const nameODisplay = document.getElementById('name-o');
const scoreBoxX = document.getElementById('score-box-x');
const scoreBoxO = document.getElementById('score-box-o');
const leaderboardMenu = document.getElementById('leaderboard-menu');
const leaderboardList = document.getElementById('leaderboard-list');
const helpMenu = document.getElementById('help-menu');
const roomCodeDisplay = document.getElementById('room-code-display');
const mpStatusBar = document.getElementById('mp-status-bar');
const gameStatus = document.getElementById('game-status');
const waitingRoomCode = document.getElementById('waiting-room-code');
const waitingText = document.getElementById('waiting-text');
const roomsList = document.getElementById('rooms-list');
const joinCodeInput = document.getElementById('join-code-input');

// Audio
const clickSound = document.getElementById('click-sound');
const winSound = document.getElementById('win-sound');

// Win Patterns
const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
];

// All overlay elements for toggling
const allOverlays = [mainMenu, difficultyMenu, multiplayerMenu, joinRoomMenu, waitingRoom, roomsListMenu, gameScreen, leaderboardMenu, helpMenu];

// Initialization
function init() {
    setupEventListeners();
    fetchUserProfile();
}

async function fetchUserProfile() {
    try {
        const token = localStorage.getItem('access_token');
        if (!token) return;

        const response = await fetch(`${API_BASE}/profile`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.ok && data.user) {
            myNickName = data.user.nick_name || 'Player';
            myUserId = data.user.user_id;
            nameXDisplay.innerText = `${myNickName} (X)`;
        }
    } catch (e) {
        console.error('Failed to fetch profile:', e);
    }
}

function setupEventListeners() {
    // Menu Navigation
    document.getElementById('sp-btn').onclick = () => showOverlay(difficultyMenu);
    document.getElementById('mp-btn').onclick = () => showOverlay(multiplayerMenu);

    // Multiplayer options
    document.getElementById('create-room-btn').onclick = () => createOnlineRoom();
    document.getElementById('join-code-btn').onclick = () => showOverlay(joinRoomMenu);
    document.getElementById('join-random-btn').onclick = () => joinRandomMatch();
    document.getElementById('view-rooms-btn').onclick = () => {
        showOverlay(roomsListMenu);
        requestRoomList();
    };
    document.getElementById('local-pvp-btn').onclick = () => startGame('local_pvp');

    // Join room form
    document.getElementById('join-submit-btn').onclick = () => {
        const code = joinCodeInput.value.trim();
        if (code.length === 4 && /^\d{4}$/.test(code)) {
            joinRoomByCode(code);
        } else {
            joinCodeInput.style.borderColor = '#ff5050';
            setTimeout(() => { joinCodeInput.style.borderColor = ''; }, 1500);
        }
    };
    joinCodeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('join-submit-btn').click();
        }
    });

    // Waiting room
    document.getElementById('cancel-wait-btn').onclick = () => {
        leaveRoom();
        showOverlay(multiplayerMenu);
    };

    // Open rooms
    document.getElementById('refresh-rooms-btn').onclick = () => requestRoomList();
    document.getElementById('rooms-back-btn').onclick = () => {
        disconnectWs();
        showOverlay(multiplayerMenu);
    };

    // Back buttons
    document.getElementById('join-back-btn').onclick = () => {
        disconnectWs();
        showOverlay(multiplayerMenu);
    };
    document.getElementById('help-btn').onclick = () => showOverlay(helpMenu);
    document.getElementById('help-back-btn').onclick = () => showOverlay(mainMenu);
    document.getElementById('back-to-main').onclick = () => showOverlay(mainMenu);
    document.getElementById('mp-back-btn').onclick = () => showOverlay(mainMenu);

    // Exit menu button
    document.getElementById('exit-menu-btn').onclick = () => {
        if (gameMode === 'multiplayer' && currentRoomCode) {
            leaveRoom();
        }
        showOverlay(mainMenu);
    };

    document.getElementById('exit-app-btn').onclick = () => {
        if (gameActive && gameMode === 'single') saveScoreToBackend('loss', 'O', true);
        if (gameMode === 'multiplayer' && currentRoomCode) leaveRoom();
        if (window.parent) {
            window.parent.postMessage({ type: 'navigate', path: '/landing/game-list' }, '*');
        } else {
            window.location.href = '/landing/game-list';
        }
    };

    // Leaderboard
    document.getElementById('leaderboard-btn').onclick = () => {
        showOverlay(leaderboardMenu);
        fetchLeaderboard();
    };
    document.getElementById('leaderboard-back-btn').onclick = () => showOverlay(mainMenu);
    
    document.getElementById('leaderboard-game-filter').addEventListener('change', fetchLeaderboard);
    document.getElementById('leaderboard-date-filter').addEventListener('change', fetchLeaderboard);

    // Chat
    const chatInput = document.getElementById('chat-input');
    const chatSendBtn = document.getElementById('chat-send-btn');
    function sendChat() {
        const text = chatInput.value.trim();
        if (text && gameMode === 'multiplayer' && currentRoomCode) {
            wsSend({ type: 'send_chat', nickName: myNickName, text: text });
            chatInput.value = '';
        }
    }
    chatSendBtn.onclick = sendChat;
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendChat();
    });

    // Difficulty Selection
    document.querySelectorAll('.btn-diff').forEach(btn => {
        btn.onclick = () => {
            difficulty = btn.getAttribute('data-diff');
            startGame('single');
        };
    });

    // Game Controls
    document.getElementById('new-round-btn').onclick = () => {
        if (gameMode === 'multiplayer') {
            // Request new round from server
            wsSend({ type: 'new_round' });
        } else {
            scoreX = 0;
            scoreO = 0;
            updateScoreUI();
            startNewRound();
        }
    };
    document.getElementById('reset-game-btn').onclick = () => {
        scoreX = 0;
        scoreO = 0;
        level = 1;
        updateScoreUI();
        startNewRound();
    };
}

function showOverlay(overlayToShow) {
    allOverlays.forEach(el => el.classList.add('hidden'));
    overlayToShow.classList.remove('hidden');
    if (overlayToShow !== gameScreen) stopTimer();
}

// ==========================
// WebSocket Connection
// ==========================
function ensureWsConnected() {
    return new Promise((resolve, reject) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            resolve();
            return;
        }

        ws = new WebSocket(WS_URL);

        ws.onopen = () => {
            console.log('WebSocket connected');
            resolve();
        };

        ws.onmessage = (event) => {
            handleWsMessage(JSON.parse(event.data));
        };

        ws.onclose = () => {
            console.log('WebSocket disconnected');
            ws = null;
            // If we were in a game, show opponent left
            if (gameMode === 'multiplayer' && gameActive) {
                gameActive = false;
                messageDisplay.innerText = 'Connection lost!';
                gameStatus.innerText = 'Disconnected';
            }
        };

        ws.onerror = (err) => {
            console.error('WebSocket error:', err);
            reject(err);
        };

        // Timeout after 5 seconds
        setTimeout(() => {
            if (ws && ws.readyState !== WebSocket.OPEN) {
                ws.close();
                reject(new Error('WebSocket connection timeout'));
            }
        }, 5000);
    });
}

function wsSend(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
    }
}

function disconnectWs() {
    if (ws) {
        ws.close();
        ws = null;
    }
    currentRoomCode = null;
    mySymbol = null;
}

function leaveRoom() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        wsSend({ type: 'leave_room' });
    }
    currentRoomCode = null;
    mySymbol = null;
    gameActive = false;
    disconnectWs();
}

// ==========================
// Multiplayer Actions
// ==========================
async function createOnlineRoom() {
    try {
        await ensureWsConnected();
        wsSend({
            type: 'create_room',
            userId: myUserId || 'guest',
            nickName: myNickName
        });
    } catch (e) {
        console.error('Failed to connect:', e);
        alert('Could not connect to game server. Make sure the backend is running.');
    }
}

async function joinRoomByCode(code) {
    try {
        await ensureWsConnected();
        wsSend({
            type: 'join_room',
            roomCode: code,
            userId: myUserId || 'guest',
            nickName: myNickName
        });
    } catch (e) {
        console.error('Failed to connect:', e);
        alert('Could not connect to game server.');
    }
}

async function joinRandomMatch() {
    try {
        await ensureWsConnected();
        wsSend({
            type: 'join_random',
            userId: myUserId || 'guest',
            nickName: myNickName
        });
        showOverlay(waitingRoom);
        waitingText.innerText = 'Searching for a match...';
        waitingRoomCode.innerText = '...';
    } catch (e) {
        console.error('Failed to connect:', e);
        alert('Could not connect to game server.');
    }
}

async function requestRoomList() {
    try {
        await ensureWsConnected();
        wsSend({ type: 'list_rooms' });
        roomsList.innerHTML = '<p>Searching for rooms...</p>';
    } catch (e) {
        console.error('Failed to connect:', e);
        roomsList.innerHTML = '<p>Could not connect to server.</p>';
    }
}

// ==========================
// WebSocket Message Handler
// ==========================
function handleWsMessage(msg) {
    switch (msg.type) {
        case 'room_created': {
            currentRoomCode = msg.roomCode;
            mySymbol = msg.symbol;
            showOverlay(waitingRoom);
            waitingRoomCode.innerText = msg.roomCode;
            waitingText.innerText = msg.isRandom
                ? 'Searching for opponent...'
                : 'Share this code with your friend...';
            break;
        }

        case 'room_joined': {
            currentRoomCode = msg.roomCode;
            mySymbol = msg.symbol;
            // Game will start when 'game_start' message arrives
            break;
        }

        case 'opponent_joined': {
            // Host gets notified
            waitingText.innerText = `${msg.opponentName} joined!`;
            break;
        }

        case 'game_start': {
            gameMode = 'multiplayer';
            roundNumber = msg.round;
            scoreX = msg.scores.X;
            scoreO = msg.scores.O;

            showOverlay(gameScreen);
            levelDisplay.classList.add('hidden');
            roundDisplay.classList.remove('hidden');
            mpStatusBar.classList.remove('hidden');

            roomCodeDisplay.innerText = currentRoomCode;
            currentRoundSpan.innerText = msg.round;
            document.getElementById('chat-panel').classList.remove('hidden');
            document.getElementById('chat-messages').innerHTML = '<div class="chat-msg system">Game started! Chat is open.</div>';

            // Set player names
            const xName = msg.players.X;
            const oName = msg.players.O;
            nameXDisplay.innerText = `${xName} (X)`;
            nameODisplay.innerText = `${oName} (O)`;

            // Set board state
            cells = [...msg.board];
            currentPlayer = msg.currentTurn;
            isMyTurn = (msg.currentTurn === mySymbol);
            gameActive = true;
            movesTaken = 0;
            messageDisplay.innerText = '';

            updateScoreUI();
            renderBoard();
            updateMpStatusUI();
            startTimer();

            // Hide reset button in multiplayer
            document.getElementById('reset-game-btn').classList.add('hidden');
            break;
        }

        case 'move_made': {
            cells = [...msg.board];
            currentPlayer = msg.currentTurn;
            isMyTurn = (msg.currentTurn === mySymbol);
            movesTaken = msg.movesTaken;
            playSound(clickSound);
            renderBoard();
            updateMpStatusUI();
            break;
        }

        case 'round_end': {
            cells = [...msg.board];
            gameActive = false;
            stopTimer();
            renderBoard();

            if (msg.result === 'win') {
                highlightWin(msg.line);
                const winnerName = msg.winner === 'X'
                    ? nameXDisplay.innerText.replace(' (X)', '')
                    : nameODisplay.innerText.replace(' (O)', '');

                if (msg.winner === mySymbol) {
                    addSystemMessage('You Win! 🎉');
                } else {
                    addSystemMessage(`${winnerName} Wins! 😔`);
                }
                playSound(winSound);
            } else {
                addSystemMessage("It's a Draw! 🤝");
            }

            scoreX = msg.scores.X;
            scoreO = msg.scores.O;
            roundNumber = msg.round;
            updateScoreUI();

            gameStatus.innerText = 'Round Over — Click "New Round"';
            break;
        }

        case 'opponent_left': {
            gameActive = false;
            stopTimer();
            addSystemMessage(msg.message);
            gameStatus.innerText = 'Opponent Left';
            currentRoomCode = null;
            break;
        }

        case 'room_list': {
            renderRoomList(msg.rooms);
            break;
        }

        case 'error': {
            console.error('Server error:', msg.message);
            // Show error to user
            if (joinRoomMenu && !joinRoomMenu.classList.contains('hidden')) {
                joinCodeInput.style.borderColor = '#ff5050';
                joinCodeInput.placeholder = msg.message;
                setTimeout(() => {
                    joinCodeInput.style.borderColor = '';
                    joinCodeInput.placeholder = 'Enter 4-digit code';
                }, 2000);
            } else {
                alert(msg.message);
            }
            break;
        }

        case 'chat_message': {
            const chatMessages = document.getElementById('chat-messages');
            const msgEl = document.createElement('div');
            msgEl.classList.add('chat-msg');
            const isMe = msg.nickName === myNickName;
            
            const d = new Date(msg.timestamp);
            const timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
            
            msgEl.innerHTML = `
                <span class="sender" style="color: ${isMe ? 'var(--neon-lime)' : '#fff'}">${msg.nickName}:</span>
                <span class="text">${msg.text}</span>
                <span class="time">${timeStr}</span>
            `;
            chatMessages.appendChild(msgEl);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            break;
        }
    }
}

function addSystemMessage(text) {
    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages) {
        chatMessages.innerHTML += `<div class="chat-msg system">${text}</div>`;
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    messageDisplay.innerText = ''; // Clear center message
}

function renderRoomList(roomsData) {
    roomsList.innerHTML = '';
    if (!roomsData || roomsData.length === 0) {
        roomsList.innerHTML = '<p class="no-rooms">No open rooms. Create one!</p>';
        return;
    }

    roomsData.forEach(room => {
        const item = document.createElement('div');
        item.classList.add('leaderboard-item', 'room-item');
        item.innerHTML = `
            <span class="room-host"><i class="fas fa-user"></i> ${room.hostName}</span>
            <span class="room-code-badge">${room.code}</span>
            <button class="btn btn-join-room" data-code="${room.code}">Join</button>
        `;
        roomsList.appendChild(item);
    });

    // Attach join handlers
    document.querySelectorAll('.btn-join-room').forEach(btn => {
        btn.onclick = () => {
            const code = btn.getAttribute('data-code');
            joinRoomByCode(code);
        };
    });
}

function updateMpStatusUI() {
    if (isMyTurn) {
        gameStatus.innerText = 'Your Turn!';
        gameStatus.style.color = 'var(--neon-lime)';
    } else {
        gameStatus.innerText = "Opponent's Turn...";
        gameStatus.style.color = '#aaa';
    }
    updateStatusUI();
}

// ==========================
// Game Logic (SP / Local PvP)
// ==========================
function startGame(mode) {
    gameMode = mode;
    showOverlay(gameScreen);
    document.getElementById('reset-game-btn').classList.remove('hidden');

    if (mode === 'single') {
        levelDisplay.classList.remove('hidden');
        roundDisplay.classList.add('hidden');
        mpStatusBar.classList.add('hidden');
        nameODisplay.innerText = `CPU (${difficulty.toUpperCase()})`;
    } else if (mode === 'local_pvp') {
        levelDisplay.classList.add('hidden');
        roundDisplay.classList.add('hidden');
        mpStatusBar.classList.remove('hidden');
        roomCodeDisplay.innerText = 'LOCAL';
        gameStatus.innerText = 'Local PvP Mode';
        nameODisplay.innerText = 'Player 2 (O)';
    }

    document.getElementById('chat-panel').classList.add('hidden');

    scoreX = 0;
    scoreO = 0;
    updateScoreUI();
    startNewRound();
}

function startNewRound() {
    cells = ['', '', '', '', '', '', '', '', ''];
    movesTaken = 0;
    currentPlayer = 'X';
    gameActive = true;
    messageDisplay.innerText = '';
    currentLevelSpan.innerText = level;

    renderBoard();
    updateStatusUI();
    startTimer();
}

function renderBoard() {
    board.innerHTML = '';
    cells.forEach((cell, index) => {
        const div = document.createElement('div');
        div.classList.add('cell');
        if (cell) div.classList.add('taken');
        div.setAttribute('data-index', index);

        if (cell === 'X') div.innerHTML = '<i class="fas fa-times"></i>';
        else if (cell === 'O') div.innerHTML = '<i class="far fa-circle"></i>';

        div.onclick = () => handleMove(index);
        board.appendChild(div);
    });
}

function handleMove(index) {
    if (!gameActive || cells[index] !== '') return;

    if (gameMode === 'multiplayer') {
        // Only allow moves on your turn
        if (!isMyTurn) return;
        // Send move to server — server is source of truth
        wsSend({ type: 'make_move', index });
        return;
    }

    // Single player or local PvP
    const playerAtMove = currentPlayer;
    makeMove(index, playerAtMove);

    if (gameActive && gameMode === 'single' && playerAtMove === 'X') {
        gameActive = false; // Temporarily disable while CPU "thinks"
        setTimeout(makeCPUMove, 600);
    }
}

function makeMove(index, player) {
    cells[index] = player;
    movesTaken++;
    playSound(clickSound);
    renderBoard();
    checkGameResult(player);
}

function checkGameResult(player) {
    let win = false;
    let winningLine = null;

    for (const pattern of winPatterns) {
        const [a, b, c] = pattern;
        if (cells[a] && cells[a] === cells[b] && cells[a] === cells[c]) {
            win = true;
            winningLine = pattern;
            break;
        }
    }

    if (win) {
        endGame('win', player, winningLine);
    } else if (!cells.includes('')) {
        endGame('draw');
    } else {
        currentPlayer = (player === 'X') ? 'O' : 'X';
        gameActive = true;
        updateStatusUI();
    }
}

function endGame(result, winner = null, line = null) {
    gameActive = false;
    stopTimer();

    if (result === 'win') {
        highlightWin(line);
        if (winner === 'X') {
            messageDisplay.innerText = 'You Win! 🎉';
            scoreX++;
            if (gameMode === 'single') {
                level++;
                updateDifficulty();
            }
        } else {
            if (gameMode === 'local_pvp') {
                messageDisplay.innerText = 'Player 2 Wins! 🎉';
            } else {
                messageDisplay.innerText = 'CPU Wins! 🤖';
            }
            scoreO++;
        }
        playSound(winSound);
    } else {
        messageDisplay.innerText = "It's a Draw! 🤝";
    }

    updateScoreUI();

    // Only save score for single player games (multiplayer handled by server)
    if (gameMode === 'single') {
        saveScoreToBackend(result, winner);
    }
}

function updateDifficulty() {
    if (level > 5 && difficulty === 'easy') difficulty = 'medium';
    if (level > 10 && difficulty === 'medium') difficulty = 'hard';
}

function highlightWin(line) {
    if (!line) return;
    const allCells = document.querySelectorAll('.cell');
    line.forEach(i => allCells[i].classList.add('winning-cell'));
}

function updateScoreUI() {
    scoreXDisplay.innerText = scoreX;
    scoreODisplay.innerText = scoreO;
}

function updateStatusUI() {
    if (currentPlayer === 'X') {
        scoreBoxX.classList.add('active-turn');
        scoreBoxO.classList.remove('active-turn');
    } else {
        scoreBoxO.classList.add('active-turn');
        scoreBoxX.classList.remove('active-turn');
    }
}

// AI Logic
function makeCPUMove() {
    let index;
    if (difficulty === 'hard') {
        index = getBestMove();
    } else if (difficulty === 'medium') {
        index = Math.random() > 0.5 ? getBestMove() : getRandomMove();
    } else {
        index = getRandomMove();
    }

    if (index !== null) {
        makeMove(index, 'O');
    }
}

function getRandomMove() {
    const available = cells.map((c, i) => c === '' ? i : null).filter(c => c !== null);
    if (available.length === 0) return null;
    return available[Math.floor(Math.random() * available.length)];
}

function getBestMove() {
    let bestScore = -Infinity;
    let move = null;
    for (let i = 0; i < 9; i++) {
        if (cells[i] === '') {
            cells[i] = 'O';
            let score = minimax(cells, 0, false);
            cells[i] = '';
            if (score > bestScore) {
                bestScore = score;
                move = i;
            }
        }
    }
    return move;
}

const scores = { X: -10, O: 10, draw: 0 };

function minimax(board, depth, isMaximizing) {
    let result = checkWinner();
    if (result !== null) return scores[result];

    if (isMaximizing) {
        let bestScore = -Infinity;
        for (let i = 0; i < 9; i++) {
            if (board[i] === '') {
                board[i] = 'O';
                let score = minimax(board, depth + 1, false);
                board[i] = '';
                bestScore = Math.max(score, bestScore);
            }
        }
        return bestScore;
    } else {
        let bestScore = Infinity;
        for (let i = 0; i < 9; i++) {
            if (board[i] === '') {
                board[i] = 'X';
                let score = minimax(board, depth + 1, true);
                board[i] = '';
                bestScore = Math.min(score, bestScore);
            }
        }
        return bestScore;
    }
}

function checkWinner() {
    for (const pattern of winPatterns) {
        const [a, b, c] = pattern;
        if (cells[a] && cells[a] === cells[b] && cells[a] === cells[c]) return cells[a];
    }
    if (!cells.includes('')) return 'draw';
    return null;
}

// Scoring and Backend
async function saveScoreToBackend(gameResult, winner, isAbandoned = false) {
    const token = localStorage.getItem('access_token');
    if (!token) return;

    let result = 'loss';
    if (gameResult === 'draw') result = 'draw';
    else if (winner === 'X') result = 'win';

    if (isAbandoned) result = 'abandoned';

    const calculatedScore = isAbandoned ? -50 : calculateScore(result);

    try {
        await fetch(`${API_BASE}/scores`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                score: calculatedScore,
                game_mode: gameMode,
                difficulty: gameMode === 'single' ? difficulty : null,
                moves_taken: movesTaken,
                result: result,
                game_slug: 'xo'
            })
        });
    } catch (e) {
        console.error('Failed to save score:', e);
    }
}

async function fetchLeaderboard() {
    try {
        const gameFilter = document.getElementById('leaderboard-game-filter').value;
        const dateFilter = document.getElementById('leaderboard-date-filter').value;
        
        let url = `${API_BASE}/scores/leaderboard`;
        const params = [];
        if (gameFilter) params.push(`game=${gameFilter}`);
        if (dateFilter) params.push(`date=${dateFilter}`);
        if (params.length > 0) url += '?' + params.join('&');

        const response = await fetch(url);
        const data = await response.json();

        leaderboardList.innerHTML = '';
        if (data && data.length > 0) {
            data.forEach((entry, index) => {
                const item = document.createElement('div');
                item.classList.add('leaderboard-item');
                item.innerHTML = `
                    <span class="rank">#${index + 1}</span>
                    <span class="name">${getDisplayName(entry)}</span>
                    <span class="score">${entry.score} pts</span>
                `;
                leaderboardList.appendChild(item);
            });
        } else {
            leaderboardList.innerHTML = '<p>No scores yet. Be the first!</p>';
        }
    } catch (e) {
        console.error('Failed to fetch leaderboard:', e);
        leaderboardList.innerHTML = '<p>Error loading leaderboard.</p>';
    }
}

function getDisplayName(entry) {
    let name = entry.nick_name || 'Anonymous';
    if (entry.game_mode === 'single') {
        name += ` (${entry.difficulty})`;
    }
    return name;
}

function calculateScore(result) {
    if (result === 'loss') return 0;

    const baseScore = 100;
    const moveBonus = (9 - movesTaken) * 10;

    let multiplier = 1;
    if (gameMode === 'single') {
        if (difficulty === 'medium') multiplier = 1.5;
        else if (difficulty === 'hard') multiplier = 2;
    }

    if (result === 'draw') {
        return gameMode === 'single' ? (10 * multiplier) : 25;
    }

    return (baseScore + moveBonus) * multiplier;
}

// Timer
function startTimer() {
    startTime = Date.now();
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const secs = (elapsed % 60).toString().padStart(2, '0');
        timerDisplay.innerText = `${mins}:${secs}`;
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
}

function playSound(sound) {
    if (sound && sound.play) {
        sound.currentTime = 0;
        sound.play().catch(() => {});
    }
}

init();
