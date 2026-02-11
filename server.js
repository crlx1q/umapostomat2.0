import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const LOCKER_ID = 'locker-main-001';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});


const state = {
  users: [
    { id: 'player1', name: 'Player One' },
    { id: 'player2', name: 'Player Two' }
  ],
  cells: [],
  shipments: new Map(),
  sessions: new Map(),
  qr: null,
  screenMode: { mode: 'qr', color: null },
  tests: { rgb: false, openSeq: false, openSeqTimer: null, rgbTimer: null },
  autoCloseTimers: new Map()
};

function buildCells() {
  const cols = 10;
  const rows = 8;
  const occupied = Array.from({ length: rows }, () => Array(cols).fill(false));
  const cells = [];
  let idCounter = 1;

  const canPlace = (x, y, w, h) => {
    if (x + w > cols || y + h > rows) return false;
    for (let yy = y; yy < y + h; yy += 1) {
      for (let xx = x; xx < x + w; xx += 1) {
        if (occupied[yy][xx]) return false;
      }
    }
    return true;
  };

  const place = (x, y, w, h, size) => {
    for (let yy = y; yy < y + h; yy += 1) {
      for (let xx = x; xx < x + w; xx += 1) {
        occupied[yy][xx] = true;
      }
    }
    cells.push({
      id: `C${String(idCounter).padStart(3, '0')}`,
      x,
      y,
      w,
      h,
      size,
      state: 'closed',
      shipmentId: null
    });
    idCounter += 1;
  };

  let lUnits = 4;
  let mUnits = 20;

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (occupied[y][x]) continue;

      if (lUnits >= 4 && canPlace(x, y, 2, 2) && (x + y) % 7 === 0) {
        place(x, y, 2, 2, 'L');
        lUnits -= 4;
        continue;
      }

      if (mUnits >= 2 && canPlace(x, y, 2, 1) && (x + y) % 3 === 0) {
        place(x, y, 2, 1, 'M');
        mUnits -= 2;
        continue;
      }

      place(x, y, 1, 1, 'S');
    }
  }

  return cells;
}

state.cells = buildCells();

function broadcast(event, payload = {}) {
  const message = JSON.stringify({ event, payload, ts: Date.now() });
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(message);
  }
}

async function generateQr() {
  const token = crypto.randomBytes(12).toString('hex');
  const createdAt = Date.now();
  const expiresAt = createdAt + 60_000;
  const tokenPayload = JSON.stringify({ token, lockerId: LOCKER_ID, createdAt, expiresAt });
  const image = await QRCode.toDataURL(tokenPayload, {
    margin: 1,
    color: { dark: '#111111', light: '#ffffff' }
  });
  state.qr = { token, lockerId: LOCKER_ID, createdAt, expiresAt, image };
  broadcast('qrUpdated', { qr: state.qr });
}

function startQrLoop() {
  generateQr();
  setInterval(generateQr, 60_000);
}

function requireAdmin(req, res, next) {
  const pass = req.headers['x-admin-password'] || req.body?.password;
  if (pass !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized admin access' });
  next();
}

function validateSession(sessionId, userId) {
  const session = state.sessions.get(sessionId);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    state.sessions.delete(sessionId);
    return null;
  }
  if (userId && session.userId !== userId) return null;
  return session;
}

function openCell(cellId, { byAdmin = false, shipmentId = null } = {}) {
  const cell = state.cells.find((c) => c.id === cellId);
  if (!cell) return { ok: false, error: 'Cell not found' };
  cell.state = 'open';
  if (shipmentId) cell.shipmentId = shipmentId;
  broadcast('cellOpened', { cellId: cell.id, shipmentId: cell.shipmentId, byAdmin });

  if (!state.tests.openSeq) {
    if (state.autoCloseTimers.has(cell.id)) clearTimeout(state.autoCloseTimers.get(cell.id));
    state.autoCloseTimers.set(
      cell.id,
      setTimeout(() => {
        if (cell.state === 'open') closeCell(cell.id, { auto: true });
      }, 8_000)
    );
  }
  return { ok: true, cell };
}

function closeCell(cellId, { auto = false } = {}) {
  const cell = state.cells.find((c) => c.id === cellId);
  if (!cell) return { ok: false, error: 'Cell not found' };
  cell.state = 'closed';
  broadcast('cellClosed', { cellId: cell.id, auto });
  return { ok: true, cell };
}

function shipmentPublic(shipment) {
  return {
    id: shipment.id,
    title: shipment.title,
    description: shipment.description,
    size: shipment.size,
    userId: shipment.userId,
    cellId: shipment.cellId,
    status: shipment.status
  };
}

app.get('/api/qr/current', (req, res) => {
  if (!state.qr) return res.status(503).json({ error: 'QR not ready' });
  res.json({ ...state.qr, ttlMs: Math.max(0, state.qr.expiresAt - Date.now()) });
});

app.post('/api/qr/scan', (req, res) => {
  const { token, userId = 'player1', deviceId = 'browser-device' } = req.body || {};
  if (!state.qr || token !== state.qr.token || state.qr.expiresAt < Date.now()) {
    return res.status(400).json({ error: 'Invalid or expired QR token' });
  }
  const sessionId = crypto.randomUUID();
  const expiresAt = Date.now() + 5 * 60_000;
  state.sessions.set(sessionId, { sessionId, userId, deviceId, lockerId: LOCKER_ID, expiresAt });
  broadcast('sessionBound', { userId, deviceId, sessionId, expiresAt });
  res.json({ sessionId, expiresAt, lockerId: LOCKER_ID, userId });
});

app.get('/api/user/:id/shipments', (req, res) => {
  const { sessionid } = req.headers;
  const session = validateSession(sessionid, req.params.id);
  if (!session) return res.status(401).json({ error: 'Session expired or invalid' });
  const rows = [...state.shipments.values()].filter((s) => s.userId === req.params.id).map(shipmentPublic);
  res.json(rows);
});

app.post('/api/shipment/:id/open', (req, res) => {
  const { sessionId } = req.body || {};
  const session = validateSession(sessionId);
  if (!session) return res.status(401).json({ error: 'Invalid session' });
  const shipment = state.shipments.get(req.params.id);
  if (!shipment) return res.status(404).json({ error: 'Shipment not found' });
  if (shipment.userId !== session.userId) return res.status(403).json({ error: 'Not your shipment' });
  if (shipment.status === 'picked') return res.status(400).json({ error: 'Shipment already picked' });

  shipment.status = 'opened';
  const result = openCell(shipment.cellId, { shipmentId: shipment.id });
  broadcast('shipmentUpdated', { shipment: shipmentPublic(shipment) });
  res.json({ shipment: shipmentPublic(shipment), cell: result.cell });
});

app.post('/api/shipment/:id/pickup', (req, res) => {
  const { sessionId } = req.body || {};
  const session = validateSession(sessionId);
  if (!session) return res.status(401).json({ error: 'Invalid session' });

  const shipment = state.shipments.get(req.params.id);
  if (!shipment) return res.status(404).json({ error: 'Shipment not found' });
  if (shipment.userId !== session.userId) return res.status(403).json({ error: 'Forbidden' });

  shipment.status = 'picked';
  const cell = state.cells.find((c) => c.id === shipment.cellId);
  if (cell) cell.shipmentId = null;
  broadcast('shipmentUpdated', { shipment: shipmentPublic(shipment) });
  res.json({ shipment: shipmentPublic(shipment) });
});

app.get('/api/cells', (req, res) => {
  res.json(state.cells);
});

app.post('/api/cells/:id/close', (req, res) => {
  const { sessionId } = req.body || {};
  const admin = req.headers['x-admin-password'] === ADMIN_PASSWORD;
  const session = sessionId ? validateSession(sessionId) : null;
  if (!admin && !session) return res.status(401).json({ error: 'Unauthorized' });
  const result = closeCell(req.params.id);
  if (!result.ok) return res.status(404).json({ error: result.error });
  res.json(result.cell);
});

app.post('/api/cells/:id/open', requireAdmin, (req, res) => {
  const result = openCell(req.params.id, { byAdmin: true });
  if (!result.ok) return res.status(404).json({ error: result.error });
  res.json(result.cell);
});

app.post('/api/admin/login', (req, res) => {
  if (req.body?.password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Wrong password' });
  res.json({ ok: true });
});

app.get('/api/admin/state', requireAdmin, (req, res) => {
  res.json({
    users: state.users,
    cells: state.cells,
    shipments: [...state.shipments.values()].map(shipmentPublic),
    tests: { rgb: state.tests.rgb, openSeq: state.tests.openSeq },
    screenMode: state.screenMode
  });
});

app.post('/api/admin/shipments', requireAdmin, (req, res) => {
  const { title, description, size, userId, cellId } = req.body || {};
  const id = crypto.randomUUID().slice(0, 8);
  const freeCell = cellId
    ? state.cells.find((c) => c.id === cellId)
    : state.cells.find((c) => c.size === size && !c.shipmentId);
  if (!freeCell) return res.status(400).json({ error: 'No free cell for this size' });

  const shipment = {
    id,
    title: title || `Посылка ${id}`,
    description: description || '',
    size: size || 'S',
    userId: userId || 'player1',
    cellId: freeCell.id,
    status: 'waiting'
  };
  state.shipments.set(id, shipment);
  freeCell.shipmentId = id;
  broadcast('shipmentUpdated', { shipment: shipmentPublic(shipment) });
  res.json(shipmentPublic(shipment));
});

app.put('/api/admin/shipments/:id', requireAdmin, (req, res) => {
  const shipment = state.shipments.get(req.params.id);
  if (!shipment) return res.status(404).json({ error: 'Not found' });
  Object.assign(shipment, req.body || {});
  broadcast('shipmentUpdated', { shipment: shipmentPublic(shipment) });
  res.json(shipmentPublic(shipment));
});

app.delete('/api/admin/shipments/:id', requireAdmin, (req, res) => {
  const shipment = state.shipments.get(req.params.id);
  if (!shipment) return res.status(404).json({ error: 'Not found' });
  const cell = state.cells.find((c) => c.id === shipment.cellId);
  if (cell) cell.shipmentId = null;
  state.shipments.delete(req.params.id);
  broadcast('shipmentUpdated', { shipment: { ...shipmentPublic(shipment), deleted: true } });
  res.json({ ok: true });
});

app.post('/api/admin/test/rgb/start', requireAdmin, (req, res) => {
  state.tests.rgb = true;
  const colors = ['#ff0000', '#00ff00', '#0000ff'];
  let idx = 0;
  state.screenMode = { mode: 'rgb', color: colors[idx] };
  broadcast('screenModeChanged', state.screenMode);
  if (state.tests.rgbTimer) clearInterval(state.tests.rgbTimer);
  state.tests.rgbTimer = setInterval(() => {
    idx = (idx + 1) % colors.length;
    state.screenMode = { mode: 'rgb', color: colors[idx] };
    broadcast('screenModeChanged', state.screenMode);
  }, 1500);
  broadcast('testModeChanged', { rgb: true, openSeq: state.tests.openSeq });
  res.json({ ok: true });
});

app.post('/api/admin/test/rgb/stop', requireAdmin, (req, res) => {
  state.tests.rgb = false;
  if (state.tests.rgbTimer) clearInterval(state.tests.rgbTimer);
  state.screenMode = { mode: 'qr', color: null };
  broadcast('screenModeChanged', state.screenMode);
  broadcast('testModeChanged', { rgb: false, openSeq: state.tests.openSeq });
  res.json({ ok: true });
});

app.post('/api/admin/test/open-seq/start', requireAdmin, (req, res) => {
  state.tests.openSeq = true;
  let i = 0;
  if (state.tests.openSeqTimer) clearInterval(state.tests.openSeqTimer);
  state.tests.openSeqTimer = setInterval(() => {
    if (i >= state.cells.length) return;
    openCell(state.cells[i].id, { byAdmin: true });
    i += 1;
  }, 700);
  broadcast('testModeChanged', { rgb: state.tests.rgb, openSeq: true });
  res.json({ ok: true });
});

app.post('/api/admin/test/open-seq/stop', requireAdmin, (req, res) => {
  state.tests.openSeq = false;
  if (state.tests.openSeqTimer) clearInterval(state.tests.openSeqTimer);
  broadcast('testModeChanged', { rgb: state.tests.rgb, openSeq: false });
  res.json({ ok: true });
});

wss.on('connection', (socket) => {
  socket.send(
    JSON.stringify({
      event: 'bootstrap',
      payload: {
        qr: state.qr,
        cells: state.cells,
        screenMode: state.screenMode,
        tests: { rgb: state.tests.rgb, openSeq: state.tests.openSeq }
      }
    })
  );
});

startQrLoop();

server.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});
