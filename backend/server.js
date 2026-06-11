require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || process.env.AUTH_JWT_SECRET;

// Fail fast on required secrets
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET (or AUTH_JWT_SECRET) environment variable is not set');
  process.exit(1);
}

const express      = require('express');
const cors         = require('cors');
const bcrypt       = require('bcrypt');
const jwt          = require('jsonwebtoken');
const multer       = require('multer');
const rateLimit    = require('express-rate-limit');
const Minio        = require('minio');
const { v4: uuidv4 } = require('uuid');

const pool           = require('./db');
const authMiddleware = require('./middleware/auth');

const app = express();

// ─── Constants ─────────────────────────────────────────────────────────────────

const BCRYPT_ROUNDS  = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);
const MINIO_USE_SSL  = process.env.MINIO_USE_SSL === 'true';
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'localhost';
const MINIO_PORT     = process.env.MINIO_PORT     || '9000';
const MINIO_BUCKET   = process.env.MINIO_BUCKET   || 'group0-pfps';
const MINIO_PROTOCOL = MINIO_USE_SSL ? 'https' : 'http';
const SLOW_REQUEST_MS = 200;

const MAX_PFP_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_PFP_MIMETYPES = new Set(['image/webp', 'image/gif', 'image/png', 'image/jpeg']);
const MIME_TO_EXT = { 'image/webp': 'webp', 'image/gif': 'gif', 'image/png': 'png', 'image/jpeg': 'jpg' };

// Username: 1–30 chars, letters/digits/underscore/hyphen only
const USERNAME_RE = /^[A-Za-z0-9_-]{1,30}$/;
const MIN_PASSWORD_LENGTH = 6;

// All tables the generic query/mutate endpoints are allowed to touch
const ALLOWED_TABLES = new Set([
  'users', 'posts', 'worlds', 'world_access', 'music_tracks', 'categories',
  'comments', 'notifications', 'post_links'
]);

// MinIO buckets that should exist
const REQUIRED_BUCKETS = [
  MINIO_BUCKET,
  'group0-posts',
  'group0-worlds',
];

// ─── MinIO client ──────────────────────────────────────────────────────────────

const minioClient = new Minio.Client({
  endPoint:  MINIO_ENDPOINT,
  port:      parseInt(MINIO_PORT, 10),
  useSSL:    MINIO_USE_SSL,
  accessKey: process.env.MINIO_ACCESS_KEY || 'admin',
  secretKey: process.env.MINIO_SECRET_KEY || 'changeme',
});

// Auto-create required MinIO buckets on startup (best-effort)
async function ensureBuckets() {
  for (const bucket of REQUIRED_BUCKETS) {
    try {
      const exists = await minioClient.bucketExists(bucket);
      if (!exists) {
        await minioClient.makeBucket(bucket);
        console.log(`Created MinIO bucket: ${bucket}`);
      }
    } catch (err) {
      console.warn(`Could not ensure MinIO bucket "${bucket}": ${err.message}`);
    }
  }
}
ensureBuckets();

// ─── Multer (memory, with size limit) ─────────────────────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PFP_BYTES },
});

const uploadAny = multer({ storage: multer.memoryStorage() });

// ─── App middleware ────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    if (durationMs <= SLOW_REQUEST_MS) return;
    const safeUrl = (req.originalUrl || req.url || '').split('?')[0];
    console.warn(`[slow-request] ${req.method} ${safeUrl} ${res.statusCode} ${durationMs.toFixed(1)}ms`);
  });
  next();
});

// ─── Rate limiting ─────────────────────────────────────────────────────────────

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { data: null, error: 'Too many requests, please try again later.' },
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { data: null, error: 'Too many requests, please try again later.' },
});

const readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { data: null, error: 'Too many requests, please try again later.' },
});

// ─── Helpers ───────────────────────────────────────────────────────────────────

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function safeUser(row) {
  return { id: row.id, username: row.username, pfp: row.pfp, pfp_url: row.pfp_url };
}

// Build WHERE conditions + values array from a filters array.
// Supports eq, in, is operators.
function buildWhereClause(filters, startIdx = 1) {
  const conditions = [];
  const values = [];
  let idx = startIdx;

  for (const f of (filters || [])) {
    if (f.operator === 'eq') {
      conditions.push(`"${f.column}" = $${idx++}`);
      values.push(f.value);
    } else if (f.operator === 'in') {
      if (!Array.isArray(f.value) || f.value.length === 0) {
        // IN () is invalid SQL — produce a never-true condition
        conditions.push('FALSE');
      } else {
        const placeholders = f.value.map(() => `$${idx++}`).join(', ');
        conditions.push(`"${f.column}" IN (${placeholders})`);
        values.push(...f.value);
      }
    } else if (f.operator === 'is') {
      if (f.value === null) {
        conditions.push(`"${f.column}" IS NULL`);
      } else {
        conditions.push(`"${f.column}" = $${idx++}`);
        values.push(f.value);
      }
    }
  }

  return { conditions, values };
}

// ─── POST /auth/signup ─────────────────────────────────────────────────────────

app.post('/auth/signup', authLimiter, async (req, res) => {
  const { username, password, pfp, pfp_url } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ data: null, error: 'username and password are required' });
  }
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ data: null, error: 'Username must be 1–30 characters and may only contain letters, numbers, underscores, or hyphens' });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ data: null, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }

  try {
    const { rows: existing } = await pool.query(
      'SELECT id FROM public.users WHERE username = $1',
      [username]
    );
    if (existing.length > 0) {
      return res.status(409).json({ data: null, error: 'Username already taken' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const id  = uuidv4();
    const now = new Date().toISOString();

    await pool.query(
      `INSERT INTO public.users (id, username, password_hash, pfp, pfp_url, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, username, passwordHash, pfp || null, pfp_url || null, now, now]
    );

    const user  = { id, username, pfp: pfp || null, pfp_url: pfp_url || null };
    const token = signToken(user);

    return res.status(201).json({ data: { token, user }, error: null });
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({ data: null, error: err.message });
  }
});

// ─── POST /auth/login ──────────────────────────────────────────────────────────

app.post('/auth/login', authLimiter, async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ data: null, error: 'username and password are required' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT id, username, password_hash, pfp, pfp_url FROM public.users WHERE username = $1',
      [username]
    );

    if (rows.length === 0) {
      return res.status(401).json({ data: null, error: 'Username not found' });
    }

    const row   = rows[0];
    const match = await bcrypt.compare(password, row.password_hash);
    if (!match) {
      return res.status(401).json({ data: null, error: 'Incorrect password' });
    }

    const user  = safeUser(row);
    const token = signToken(user);

    return res.json({ data: { token, user }, error: null });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ data: null, error: err.message });
  }
});

// ─── GET /auth/me ──────────────────────────────────────────────────────────────

app.get('/auth/me', readLimiter, authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, username, pfp, pfp_url FROM public.users WHERE id = $1',
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ data: null, error: 'User not found' });
    }

    return res.json({ data: { user: safeUser(rows[0]) }, error: null });
  } catch (err) {
    console.error('Me error:', err);
    return res.status(500).json({ data: null, error: err.message });
  }
});

// ─── POST /auth/upload-pfp ─────────────────────────────────────────────────────

app.post('/auth/upload-pfp', uploadLimiter, authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ data: null, error: 'No file uploaded' });
  }

  if (!ALLOWED_PFP_MIMETYPES.has(req.file.mimetype)) {
    return res.status(400).json({ data: null, error: 'Profile picture must be webp, gif, png, or jpeg' });
  }

  if (req.file.size > MAX_PFP_BYTES) {
    return res.status(400).json({ data: null, error: 'Profile picture must be 2 MB or smaller' });
  }

  const ext       = MIME_TO_EXT[req.file.mimetype];
  const objectKey = `${req.user.id}.${ext}`;

  try {
    await minioClient.putObject(MINIO_BUCKET, objectKey, req.file.buffer, req.file.size, {
      'Content-Type': req.file.mimetype,
    });

    const url = `${MINIO_PROTOCOL}://${MINIO_ENDPOINT}:${MINIO_PORT}/${MINIO_BUCKET}/${objectKey}`;

    await pool.query(
      'UPDATE public.users SET pfp_url = $1, updated_at = $2 WHERE id = $3',
      [url, new Date().toISOString(), req.user.id]
    );

    return res.json({ data: { url }, error: null });
  } catch (err) {
    console.error('Upload pfp error:', err);
    return res.status(500).json({ data: null, error: err.message });
  }
});

// ─── GET /worlds/:id/theme ─────────────────────────────────────────────────────

app.get('/worlds/:id/theme', readLimiter, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, background_url, font_family, font_color, ui_color FROM public.worlds WHERE id = $1',
      [req.params.id]
    );

    return res.json({ data: rows[0] || null, error: null });
  } catch (err) {
    console.error('World theme error:', err);
    return res.status(500).json({ data: null, error: err.message });
  }
});

// ─── GET /users ────────────────────────────────────────────────────────────────

async function handleGetUserByUsername(req, res) {
  const { username } = req.query;

  if (!username) {
    return res.status(400).json({ data: null, error: 'username query param is required' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT id, username, pfp, pfp_url FROM public.users WHERE username = $1',
      [username]
    );

    return res.json({ data: rows[0] || null, error: null });
  } catch (err) {
    console.error('Get user by username error:', err);
    return res.status(500).json({ data: null, error: err.message });
  }
}

app.get('/users', readLimiter, handleGetUserByUsername);
app.get('/api/users', readLimiter, handleGetUserByUsername);

// ─── GET /users/:id ────────────────────────────────────────────────────────────

async function handleGetUserById(req, res) {
  try {
    const { rows } = await pool.query(
      'SELECT id, username, pfp, pfp_url FROM public.users WHERE id = $1',
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ data: null, error: 'User not found' });
    }

    return res.json({ data: safeUser(rows[0]), error: null });
  } catch (err) {
    console.error('Get user by id error:', err);
    return res.status(500).json({ data: null, error: err.message });
  }
}

app.get('/users/:id', readLimiter, handleGetUserById);
app.get('/api/users/:id', readLimiter, handleGetUserById);

// ─── POST /api/db/query ────────────────────────────────────────────────────────

app.post('/api/db/query', readLimiter, authMiddleware, async (req, res) => {
  const { table, select, filters, or, order = [], limit, range, single, maybeSingle } = req.body || {};

  if (!table) return res.status(400).json({ data: null, error: 'table is required' });
  if (!ALLOWED_TABLES.has(table)) {
    return res.status(400).json({ data: null, error: `Unknown table: ${table}` });
  }

  try {
    const cols = (select && select !== '*')
      ? select.split(',').map(c => `"${c.trim()}"`).join(', ')
      : '*';

    const { conditions, values } = buildWhereClause(filters);

    // Soft-delete: automatically exclude deleted posts
    if (table === 'posts') conditions.push('"deleted_at" IS NULL');

    let sql = `SELECT ${cols} FROM public."${table}"`;
    if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;

    if (order.length) {
      const orderClauses = order.map(o => `"${o.column}" ${o.ascending !== false ? 'ASC' : 'DESC'}`);
      sql += ` ORDER BY ${orderClauses.join(', ')}`;
    }

    if (limit != null) sql += ` LIMIT ${parseInt(limit, 10)}`;
    if (range != null) {
      const from = parseInt(range.from, 10);
      const to   = parseInt(range.to, 10);
      sql += ` LIMIT ${to - from + 1} OFFSET ${from}`;
    }

    const { rows } = await pool.query(sql, values);

    if (single) {
      if (rows.length === 0) return res.status(406).json({ data: null, error: 'No rows found' });
      return res.json({ data: rows[0], error: null });
    }
    if (maybeSingle) {
      return res.json({ data: rows[0] || null, error: null });
    }
    return res.json({ data: rows, error: null });
  } catch (err) {
    console.error('DB query error:', err);
    return res.status(500).json({ data: null, error: err.message });
  }
});

// ─── POST /api/db/mutate ───────────────────────────────────────────────────────

app.post('/api/db/mutate', readLimiter, authMiddleware, async (req, res) => {
  const { table, action, values: mutValues, filters, select, single, maybeSingle } = req.body || {};

  if (!table) return res.status(400).json({ data: null, error: 'table is required' });
  if (!action) return res.status(400).json({ data: null, error: 'action is required' });
  if (!ALLOWED_TABLES.has(table)) {
    return res.status(400).json({ data: null, error: `Unknown table: ${table}` });
  }

  try {
    let sql = '';
    let values = [];

    if (action === 'insert') {
      const inputRows = Array.isArray(mutValues) ? mutValues : [mutValues];
      const keys = Object.keys(inputRows[0]);
      const colNames = keys.map(k => `"${k}"`).join(', ');
      const rowPlaceholders = inputRows.map((row) => {
        return '(' + keys.map((k) => {
          values.push(row[k]);
          return `$${values.length}`;
        }).join(', ') + ')';
      });
      sql = `INSERT INTO public."${table}" (${colNames}) VALUES ${rowPlaceholders.join(', ')}`;

    } else if (action === 'update') {
      const keys = Object.keys(mutValues);
      const setClauses = keys.map(k => {
        values.push(mutValues[k]);
        return `"${k}" = $${values.length}`;
      });
      sql = `UPDATE public."${table}" SET ${setClauses.join(', ')}`;

      const { conditions: whereConds, values: whereVals } = buildWhereClause(filters, values.length + 1);
      values = values.concat(whereVals);
      if (whereConds.length) sql += ` WHERE ${whereConds.join(' AND ')}`;

    } else if (action === 'delete') {
      const { conditions: whereConds, values: whereVals } = buildWhereClause(filters);
      values = whereVals;

      if (whereConds.length === 0) {
        // Safety: never allow an unfiltered delete
        return res.status(400).json({ data: null, error: 'Delete requires at least one filter' });
      }

      if (table === 'posts') {
        // Soft delete: set deleted_at instead of removing the row
        sql = `UPDATE public."posts" SET "deleted_at" = NOW() WHERE ${whereConds.join(' AND ')} AND "deleted_at" IS NULL`;
      } else {
        sql = `DELETE FROM public."${table}" WHERE ${whereConds.join(' AND ')}`;
      }

    } else {
      return res.status(400).json({ data: null, error: `Unknown action: ${action}` });
    }

    if (select && action !== 'delete') {
      const cols = (select && select !== '*')
        ? select.split(',').map(c => `"${c.trim()}"`).join(', ')
        : '*';
      sql += ` RETURNING ${cols}`;
    }

    const result = await pool.query(sql, values);
    const rows = result.rows || [];

    if (single)      return res.json({ data: rows[0] || null, error: null });
    if (maybeSingle) return res.json({ data: rows[0] || null, error: null });
    return res.json({ data: select ? rows : null, error: null });
  } catch (err) {
    console.error('DB mutate error:', err);
    return res.status(500).json({ data: null, error: err.message });
  }
});

// ─── POST /api/storage/upload ──────────────────────────────────────────────────

app.post('/api/storage/upload', uploadLimiter, authMiddleware, uploadAny.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ data: null, error: 'No file uploaded' });

  const bucket  = req.body.bucket || 'uploads';
  const path    = req.body.path   || `${uuidv4()}-${req.file.originalname}`;

  try {
    await minioClient.putObject(bucket, path, req.file.buffer, req.file.size, {
      'Content-Type': req.file.mimetype,
    });
    const url = `${MINIO_PROTOCOL}://${MINIO_ENDPOINT}:${MINIO_PORT}/${bucket}/${path}`;
    return res.json({ data: { path, url }, error: null });
  } catch (err) {
    console.error('Storage upload error:', err);
    return res.status(500).json({ data: null, error: err.message });
  }
});

// ─── POST /api/storage/list ────────────────────────────────────────────────────

app.post('/api/storage/list', readLimiter, authMiddleware, async (req, res) => {
  const { bucket, prefix = '' } = req.body || {};
  if (!bucket) return res.status(400).json({ data: null, error: 'bucket is required' });

  try {
    const objects = [];
    await new Promise((resolve, reject) => {
      const stream = minioClient.listObjects(bucket, prefix, false);
      stream.on('data', obj => objects.push(obj));
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    return res.json({ data: objects, error: null });
  } catch (err) {
    console.error('Storage list error:', err);
    return res.status(500).json({ data: null, error: err.message });
  }
});

// ─── POST /api/storage/remove ─────────────────────────────────────────────────

app.post('/api/storage/remove', uploadLimiter, authMiddleware, async (req, res) => {
  const { bucket, paths = [] } = req.body || {};
  if (!bucket) return res.status(400).json({ data: null, error: 'bucket is required' });

  try {
    await minioClient.removeObjects(bucket, paths);
    return res.json({ data: null, error: null });
  } catch (err) {
    console.error('Storage remove error:', err);
    return res.status(500).json({ data: null, error: err.message });
  }
});

// ─── GET /api/storage/public/:bucket/* ────────────────────────────────────────

app.get('/api/storage/public/:bucket/*', async (req, res) => {
  const bucket    = req.params.bucket;
  const objectKey = req.params[0];

  try {
    const stream = await minioClient.getObject(bucket, objectKey);
    stream.pipe(res);
  } catch (err) {
    console.error('Storage get public error:', err);
    return res.status(404).json({ data: null, error: 'Object not found' });
  }
});

// ─── POST /api/rpc/:name ───────────────────────────────────────────────────────

app.post('/api/rpc/:name', readLimiter, async (req, res) => {
  const fnName = req.params.name;
  const args   = req.body || {};

  const PUBLIC_RPCS = new Set(['verify_world_password']);
  const AUTH_RPCS = new Set(['set_world_password', 'grant_world_access']);
  if (!PUBLIC_RPCS.has(fnName) && !AUTH_RPCS.has(fnName)) {
    return res.status(400).json({ data: null, error: `Unknown RPC: ${fnName}` });
  }

  const executeRpc = async () => {
    try {
      const keys   = Object.keys(args);
      const params = keys.map(k => args[k]);
      const named  = keys.map((k, i) => `${k} => $${i + 1}`).join(', ');
      const sql    = `SELECT * FROM ${fnName}(${named})`;
      const result = await pool.query(sql, params);
      return res.json({ data: result.rows[0] || null, error: null });
    } catch (err) {
      console.error(`RPC ${fnName} error:`, err);
      return res.status(500).json({ data: null, error: err.message });
    }
  };

  if (AUTH_RPCS.has(fnName)) {
    return authMiddleware(req, res, executeRpc);
  }

  return executeRpc();
});

// ─── POST /api/admin/purge-deleted-posts ──────────────────────────────────────

app.post('/api/admin/purge-deleted-posts', authLimiter, async (req, res) => {
  const purgeSecret = req.headers['x-purge-secret'];
  if (!purgeSecret || purgeSecret !== process.env.PURGE_SECRET) {
    return res.status(403).json({ data: null, error: 'Forbidden' });
  }

  try {
    const result = await pool.query(
      `DELETE FROM public."posts" WHERE "deleted_at" < NOW() - INTERVAL '24 hours'`
    );
    return res.json({ data: { deleted: result.rowCount }, error: null });
  } catch (err) {
    console.error('Purge deleted posts error:', err);
    return res.status(500).json({ data: null, error: err.message });
  }
});

// ─── Start ─────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3001', 10);
app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
