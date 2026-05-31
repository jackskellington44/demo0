require('dotenv').config();

// Fail fast on required secrets
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set');
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
const path         = require('path');

const pool           = require('./db');
const authMiddleware = require('./middleware/auth');

const app    = express();
const upload = multer({ storage: multer.memoryStorage() });

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());

// ─── Rate limiting ─────────────────────────────────────────────────────────────

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
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

// ─── MinIO client ──────────────────────────────────────────────────────────────

const MINIO_USE_SSL  = process.env.MINIO_USE_SSL === 'true';
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT  || 'localhost';
const MINIO_PORT     = process.env.MINIO_PORT       || '9000';
const MINIO_BUCKET   = process.env.MINIO_BUCKET     || 'group0-pfps';
const PI_HOST        = process.env.PI_HOST           || 'localhost';
const MINIO_PROTOCOL = MINIO_USE_SSL ? 'https' : 'http';

const minioClient = new Minio.Client({
  endPoint:  MINIO_ENDPOINT,
  port:      parseInt(MINIO_PORT, 10),
  useSSL:    MINIO_USE_SSL,
  accessKey: process.env.MINIO_ACCESS_KEY || 'admin',
  secretKey: process.env.MINIO_SECRET_KEY || 'changeme',
});

const JWT_SECRET    = process.env.JWT_SECRET;
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);

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

// ─── POST /auth/signup ─────────────────────────────────────────────────────────

app.post('/auth/signup', authLimiter, async (req, res) => {
  const { username, password, pfp, pfp_url } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ data: null, error: 'username and password are required' });
  }

  try {
    // Check username availability
    const { rows: existing } = await pool.query(
      'SELECT id FROM public.users WHERE username = $1',
      [username]
    );
    if (existing.length > 0) {
      return res.status(409).json({ data: null, error: 'Username already taken' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const id = uuidv4();
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

  const extMap = {
    'image/webp': 'webp',
    'image/gif':  'gif',
    'image/png':  'png',
    'image/jpeg': 'jpg',
  };
  const ext       = extMap[req.file.mimetype] || path.extname(req.file.originalname).slice(1) || 'webp';
  const objectKey = `${req.user.id}.${ext}`;

  try {
    await minioClient.putObject(MINIO_BUCKET, objectKey, req.file.buffer, req.file.size, {
      'Content-Type': req.file.mimetype,
    });

    const url = `${MINIO_PROTOCOL}://${PI_HOST}:${MINIO_PORT}/${MINIO_BUCKET}/${objectKey}`;
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

app.get('/users', readLimiter, async (req, res) => {
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
});

// ─── GET /users/:id ────────────────────────────────────────────────────────────

app.get('/users/:id', readLimiter, async (req, res) => {
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
});

// ─── Start ─────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3001', 10);
app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
