const path = require('path');
const dotenv = require('dotenv');

// Prefer backend/.env (override: true forces it to win over system env vars).
dotenv.config({ path: path.resolve(__dirname, '.env'), override: true });
// Fall back to workspace root .env for anything not already set.
dotenv.config();

const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Client: MinioClient } = require('minio');
const { query } = require('./db');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const PORT = Number(process.env.PORT || 8787);
const JWT_SECRET = process.env.AUTH_JWT_SECRET || 'change-me';
const TOKEN_TTL = process.env.AUTH_TOKEN_TTL || '7d';

const TABLE_ALLOWLIST = new Set([
  'users',
  'posts',
  'comments',
  'categories',
  'post_links',
  'notifications',
  'worlds',
  'world_access',
  'updates',
  'music_tracks'
]);

const minioClient = new MinioClient({
  endPoint: process.env.MINIO_ENDPOINT || '127.0.0.1',
  port: Number(process.env.MINIO_PORT || 9000),
  useSSL: String(process.env.MINIO_USE_SSL || 'false').toLowerCase() === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin'
});

const storageBucket = process.env.MINIO_BUCKET || 'demo';
const minioPublicBase = process.env.MINIO_PUBLIC_BASE || `http://${process.env.MINIO_ENDPOINT || '127.0.0.1'}:${process.env.MINIO_PORT || 9000}`;

app.use(cors({ origin: true }));
app.use(express.json({ limit: '25mb' }));

function apiError(message, status = 400, code = 'BAD_REQUEST', details = null) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.details = details;
  return error;
}

function sendError(res, error) {
  res.status(error.status || 500).json({
    error: {
      message: error.message || 'Internal server error',
      code: error.code || 'INTERNAL_ERROR',
      details: error.details || null
    }
  });
}

function qid(identifier) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw apiError(`Invalid identifier: ${identifier}`, 400, 'INVALID_IDENTIFIER');
  }
  return `"${identifier}"`;
}

function ensureTableAllowed(table) {
  if (!TABLE_ALLOWLIST.has(table)) {
    throw apiError(`Table not allowed: ${table}`, 403, 'TABLE_NOT_ALLOWED');
  }
}

function parseSelect(select) {
  if (!select || select === '*') return '*';

  const columns = String(select)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((name) => qid(name));

  return columns.length ? columns.join(', ') : '*';
}

function splitCommaAware(input) {
  const parts = [];
  let buffer = '';
  let depth = 0;

  for (const ch of String(input || '')) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);

    if (ch === ',' && depth === 0) {
      if (buffer.trim()) parts.push(buffer.trim());
      buffer = '';
      continue;
    }

    buffer += ch;
  }

  if (buffer.trim()) parts.push(buffer.trim());
  return parts;
}

function parseOrCondition(orExpr) {
  const parts = splitCommaAware(orExpr);

  return parts.map((part) => {
    const match = part.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\.(eq|in)\.(.+)$/);
    if (!match) {
      throw apiError(`Unsupported OR expression part: ${part}`, 400, 'UNSUPPORTED_OR');
    }

    const [, column, op, rawValue] = match;
    if (op === 'eq') {
      return { type: 'eq', column, value: rawValue };
    }

    const inMatch = rawValue.match(/^\((.*)\)$/);
    if (!inMatch) {
      throw apiError(`Invalid IN expression: ${part}`, 400, 'INVALID_IN');
    }

    const values = splitCommaAware(inMatch[1]).map((item) => item.trim()).filter(Boolean);
    return { type: 'in', column, values };
  });
}

function applyFilters(baseParams, filters = [], orExpr = null) {
  let idx = baseParams.length;
  const clauses = [];
  const params = [...baseParams];

  for (const filter of filters) {
    const column = qid(filter.column);

    if (filter.operator === 'eq') {
      if (filter.value === null) {
        clauses.push(`${column} IS NULL`);
      } else {
        idx += 1;
        clauses.push(`${column} = $${idx}`);
        params.push(filter.value);
      }
      continue;
    }

    if (filter.operator === 'in') {
      const values = Array.isArray(filter.value) ? filter.value : [];
      if (values.length === 0) {
        clauses.push('FALSE');
      } else {
        idx += 1;
        clauses.push(`${column} = ANY($${idx})`);
        params.push(values);
      }
      continue;
    }

    if (filter.operator === 'is') {
      if (filter.value === null) {
        clauses.push(`${column} IS NULL`);
      } else if (String(filter.value).toLowerCase() === 'true') {
        clauses.push(`${column} IS TRUE`);
      } else if (String(filter.value).toLowerCase() === 'false') {
        clauses.push(`${column} IS FALSE`);
      } else {
        throw apiError(`Unsupported IS value for ${filter.column}`, 400, 'UNSUPPORTED_IS');
      }
      continue;
    }

    throw apiError(`Unsupported filter operator: ${filter.operator}`, 400, 'UNSUPPORTED_FILTER');
  }

  if (orExpr) {
    const orParts = parseOrCondition(orExpr);
    const orClauses = [];

    for (const part of orParts) {
      const column = qid(part.column);
      if (part.type === 'eq') {
        idx += 1;
        orClauses.push(`${column} = $${idx}`);
        params.push(part.value);
      } else if (part.type === 'in') {
        idx += 1;
        orClauses.push(`${column} = ANY($${idx})`);
        params.push(part.values);
      }
    }

    if (orClauses.length > 0) {
      clauses.push(`(${orClauses.join(' OR ')})`);
    }
  }

  const whereClause = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
  return { whereClause, params, nextParamIndex: idx };
}

function normalizeBucketAndPath(logicalBucket, rawPath = '') {
  const path = String(rawPath || '').replace(/^\/+/, '');

  if (logicalBucket === 'group0-pfps') {
    return {
      bucket: storageBucket,
      objectPath: `pfps/group0/${path}`
    };
  }

  if (logicalBucket === 'group0-posts') {
    return {
      bucket: storageBucket,
      objectPath: `posts/group0/${path}`
    };
  }

  if (logicalBucket === 'worlds') {
    return {
      bucket: storageBucket,
      objectPath: `banners/${path}`
    };
  }

  return {
    bucket: storageBucket,
    objectPath: `${logicalBucket}/${path}`
  };
}

function decodeAuthToken(req) {
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  try {
    return jwt.verify(match[1], JWT_SECRET);
  } catch {
    return null;
  }
}

function requireUser(req, res, next) {
  const payload = decodeAuthToken(req);
  if (!payload?.sub) {
    return sendError(res, apiError('Unauthorized', 401, 'UNAUTHORIZED'));
  }

  req.auth = {
    userId: payload.sub,
    email: payload.email || null,
    token: payload
  };

  next();
}

function normalizeResultShape(rows, { single = false, maybeSingle = false } = {}) {
  if (!single && !maybeSingle) return { data: rows, error: null };

  if (rows.length === 0) {
    if (maybeSingle) return { data: null, error: null };
    return {
      data: null,
      error: apiError('Expected a single row but found none', 406, 'PGRST116')
    };
  }

  if (rows.length > 1) {
    return {
      data: null,
      error: apiError('Expected one row but found multiple', 406, 'PGRST116')
    };
  }

  return { data: rows[0], error: null };
}

async function ensureAuthTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS public.auth_accounts (
      id uuid PRIMARY KEY,
      email text UNIQUE NOT NULL,
      password_hash text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

app.post('/api/auth/signup', async (req, res) => {
  try {
    await ensureAuthTable();

    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      throw apiError('Email and password are required', 400, 'INVALID_CREDENTIALS');
    }

    if (password.length < 6) {
      throw apiError('Password must be at least 6 characters', 400, 'WEAK_PASSWORD');
    }

    const existing = await query('SELECT id FROM public.auth_accounts WHERE email = $1 LIMIT 1', [email]);
    if (existing.rowCount > 0) {
      throw apiError('User already registered', 409, 'USER_EXISTS');
    }

    const userId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);

    await query(
      'INSERT INTO public.auth_accounts (id, email, password_hash) VALUES ($1, $2, $3)',
      [userId, email, passwordHash]
    );

    res.json({
      data: {
        user: {
          id: userId,
          email
        }
      }
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/auth/signin', async (req, res) => {
  try {
    await ensureAuthTable();

    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    const rows = await query(
      'SELECT id, email, password_hash FROM public.auth_accounts WHERE email = $1 LIMIT 1',
      [email]
    );

    if (rows.rowCount === 0) {
      throw apiError('Invalid login credentials', 401, 'INVALID_LOGIN');
    }

    const account = rows.rows[0];
    const valid = await bcrypt.compare(password, account.password_hash);
    if (!valid) {
      throw apiError('Invalid login credentials', 401, 'INVALID_LOGIN');
    }

    const token = jwt.sign(
      { sub: account.id, email: account.email },
      JWT_SECRET,
      { expiresIn: TOKEN_TTL }
    );

    res.json({
      data: {
        session: {
          access_token: token,
          user: {
            id: account.id,
            email: account.email
          }
        },
        user: {
          id: account.id,
          email: account.email
        }
      }
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/auth/signout', async (_req, res) => {
  res.json({ data: { ok: true } });
});

app.get('/api/auth/session', async (req, res) => {
  const payload = decodeAuthToken(req);
  if (!payload?.sub) {
    return res.json({ data: { session: null } });
  }

  return res.json({
    data: {
      session: {
        user: {
          id: payload.sub,
          email: payload.email || null
        }
      }
    }
  });
});

app.get('/api/auth/user', async (req, res) => {
  const payload = decodeAuthToken(req);
  if (!payload?.sub) {
    return res.json({ data: { user: null } });
  }

  return res.json({
    data: {
      user: {
        id: payload.sub,
        email: payload.email || null
      }
    }
  });
});

app.post('/api/db/query', async (req, res) => {
  try {
    const {
      table,
      select = '*',
      filters = [],
      or = null,
      order = [],
      limit = null,
      range = null,
      single = false,
      maybeSingle = false
    } = req.body || {};

    ensureTableAllowed(table);

    const selectClause = parseSelect(select);
    const tableName = qid(table);

    const { whereClause, params } = applyFilters([], filters, or);

    const orderParts = Array.isArray(order)
      ? order.map((item) => `${qid(item.column)} ${item.ascending === false ? 'DESC' : 'ASC'}`)
      : [];

    const orderClause = orderParts.length ? ` ORDER BY ${orderParts.join(', ')}` : '';

    let limitClause = '';
    const finalParams = [...params];

    if (range && Number.isInteger(range.from) && Number.isInteger(range.to) && range.to >= range.from) {
      finalParams.push(range.to - range.from + 1);
      finalParams.push(range.from);
      const lenIdx = finalParams.length - 1;
      const offsetIdx = finalParams.length;
      limitClause = ` LIMIT $${lenIdx} OFFSET $${offsetIdx}`;
    } else if (Number.isInteger(limit) && limit >= 0) {
      finalParams.push(limit);
      limitClause = ` LIMIT $${finalParams.length}`;
    }

    const sql = `SELECT ${selectClause} FROM ${tableName}${whereClause}${orderClause}${limitClause}`;
    const result = await query(sql, finalParams);

    const normalized = normalizeResultShape(result.rows, { single, maybeSingle });
    if (normalized.error) {
      throw normalized.error;
    }

    res.json({ data: normalized.data });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/db/mutate', requireUser, async (req, res) => {
  try {
    const {
      table,
      action,
      values,
      filters = [],
      or = null,
      select = null,
      single = false,
      maybeSingle = false
    } = req.body || {};

    ensureTableAllowed(table);

    const tableName = qid(table);
    let sql = '';
    let params = [];

    if (action === 'insert') {
      const rows = Array.isArray(values) ? values : [];
      if (rows.length === 0) {
        throw apiError('Insert requires at least one row', 400, 'INVALID_INSERT');
      }

      const columns = Object.keys(rows[0]);
      if (columns.length === 0) {
        throw apiError('Insert row cannot be empty', 400, 'INVALID_INSERT');
      }

      const colSql = columns.map((column) => qid(column)).join(', ');
      const valueSql = [];
      params = [];

      rows.forEach((row) => {
        const placeholders = [];
        columns.forEach((column) => {
          params.push(row[column]);
          placeholders.push(`$${params.length}`);
        });
        valueSql.push(`(${placeholders.join(', ')})`);
      });

      sql = `INSERT INTO ${tableName} (${colSql}) VALUES ${valueSql.join(', ')}`;
    } else if (action === 'update') {
      const updateValues = values || {};
      const columns = Object.keys(updateValues);
      if (columns.length === 0) {
        throw apiError('Update requires at least one column', 400, 'INVALID_UPDATE');
      }

      const setClause = columns
        .map((column) => {
          params.push(updateValues[column]);
          return `${qid(column)} = $${params.length}`;
        })
        .join(', ');

      const filterResult = applyFilters(params, filters, or);
      params = filterResult.params;
      sql = `UPDATE ${tableName} SET ${setClause}${filterResult.whereClause}`;
    } else if (action === 'delete') {
      const filterResult = applyFilters([], filters, or);
      params = filterResult.params;
      sql = `DELETE FROM ${tableName}${filterResult.whereClause}`;
    } else {
      throw apiError(`Unsupported action: ${action}`, 400, 'UNSUPPORTED_ACTION');
    }

    if (select) {
      sql += ` RETURNING ${parseSelect(select)}`;
    }

    const result = await query(sql, params);
    const data = select ? result.rows : null;

    const normalized = select
      ? normalizeResultShape(Array.isArray(data) ? data : [], { single, maybeSingle })
      : { data: null, error: null };

    if (normalized.error) {
      throw normalized.error;
    }

    res.json({ data: normalized.data });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/rpc/:fn', requireUser, async (req, res) => {
  try {
    const fn = req.params.fn;

    if (fn === 'grant_world_access') {
      const worldId = req.body?.p_world_id || req.body?.world_id;
      const password = req.body?.p_password || req.body?.password || '';
      if (!worldId) throw apiError('world id is required', 400, 'INVALID_RPC_ARGS');

      const worldResult = await query('SELECT password_hash FROM public.worlds WHERE id = $1 LIMIT 1', [worldId]);
      if (worldResult.rowCount === 0) {
        throw apiError('World not found', 404, 'WORLD_NOT_FOUND');
      }

      const passwordHash = worldResult.rows[0].password_hash;
      if (!passwordHash) {
        return res.json({ data: true });
      }

      const verify = await query('SELECT crypt($1, $2) = $2 AS ok', [password, passwordHash]);
      const allowed = Boolean(verify.rows[0]?.ok);

      if (!allowed) {
        return res.json({ data: false });
      }

      await query(
        `INSERT INTO public.world_access (user_id, world_id, unlocked_at)
         VALUES ($1, $2, now())
         ON CONFLICT (user_id, world_id)
         DO UPDATE SET unlocked_at = EXCLUDED.unlocked_at`,
        [req.auth.userId, worldId]
      );

      return res.json({ data: true });
    }

    if (fn === 'set_world_password') {
      const worldId = req.body?.p_world_id || req.body?.world_id;
      const password = String(req.body?.p_password || req.body?.password || '');
      if (!worldId) throw apiError('world id is required', 400, 'INVALID_RPC_ARGS');

      const trimmed = password.trim();
      const result = await query(
        `UPDATE public.worlds
         SET password_hash = CASE
           WHEN $1 = '' THEN NULL
           ELSE crypt($1, gen_salt('bf'))
         END
         WHERE id = $2 AND user_id = $3`,
        [trimmed, worldId, req.auth.userId]
      );

      return res.json({ data: result.rowCount > 0 });
    }

    throw apiError(`RPC not supported: ${fn}`, 404, 'RPC_NOT_FOUND');
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/storage/upload', requireUser, upload.single('file'), async (req, res) => {
  try {
    const logicalBucket = String(req.body?.bucket || '').trim();
    const path = String(req.body?.path || '').trim();
    const upsert = String(req.body?.upsert || 'false').toLowerCase() === 'true';

    if (!logicalBucket || !path) {
      throw apiError('bucket and path are required', 400, 'INVALID_STORAGE_ARGS');
    }

    if (!req.file) {
      throw apiError('file is required', 400, 'FILE_REQUIRED');
    }

    const resolved = normalizeBucketAndPath(logicalBucket, path);

    if (upsert) {
      const exists = await minioClient.statObject(resolved.bucket, resolved.objectPath).then(() => true).catch(() => false);
      if (exists) {
        await minioClient.removeObject(resolved.bucket, resolved.objectPath);
      }
    }

    await minioClient.putObject(
      resolved.bucket,
      resolved.objectPath,
      req.file.buffer,
      req.file.size,
      {
        'Content-Type': req.file.mimetype || 'application/octet-stream'
      }
    );

    res.json({ data: { path } });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/storage/list', requireUser, async (req, res) => {
  try {
    const logicalBucket = String(req.body?.bucket || '').trim();
    const prefix = String(req.body?.prefix || '').trim();

    if (!logicalBucket) {
      throw apiError('bucket is required', 400, 'INVALID_STORAGE_ARGS');
    }

    const resolved = normalizeBucketAndPath(logicalBucket, prefix);

    const objects = [];
    await new Promise((resolve, reject) => {
      const stream = minioClient.listObjectsV2(resolved.bucket, resolved.objectPath, true);
      stream.on('data', (obj) => objects.push(obj));
      stream.on('error', reject);
      stream.on('end', resolve);
    });

    const data = objects.map((obj) => ({
      name: String(obj.name || '').replace(`${resolved.objectPath.replace(/\/$/, '')}/`, ''),
      size: obj.size || 0,
      lastModified: obj.lastModified || null
    }));

    res.json({ data });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/storage/remove', requireUser, async (req, res) => {
  try {
    const logicalBucket = String(req.body?.bucket || '').trim();
    const paths = Array.isArray(req.body?.paths) ? req.body.paths : [];

    if (!logicalBucket) {
      throw apiError('bucket is required', 400, 'INVALID_STORAGE_ARGS');
    }

    const resolvedPaths = paths
      .map((path) => normalizeBucketAndPath(logicalBucket, String(path || '').trim()))
      .filter((item) => item.objectPath);

    for (const item of resolvedPaths) {
      await minioClient.removeObject(item.bucket, item.objectPath);
    }

    res.json({ data: { removed: resolvedPaths.length } });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/storage/object', async (req, res) => {
  try {
    const logicalBucket = String(req.query?.bucket || '').trim();
    const path = String(req.query?.path || '').trim();

    if (!logicalBucket || !path) {
      throw apiError('bucket and path are required', 400, 'INVALID_STORAGE_ARGS');
    }

    const resolved = normalizeBucketAndPath(logicalBucket, path);
    const encodedPath = resolved.objectPath
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/');

    const url = `${minioPublicBase.replace(/\/$/, '')}/${encodeURIComponent(resolved.bucket)}/${encodedPath}`;
    res.redirect(url);
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ data: { ok: true } });
});

app.use((error, _req, res, _next) => {
  sendError(res, error);
});

async function ensureStorageBucket() {
  const exists = await minioClient.bucketExists(storageBucket).catch(() => false);
  if (!exists) {
    await minioClient.makeBucket(storageBucket, process.env.MINIO_REGION || 'us-east-1');
  }
}

app.listen(PORT, async () => {
  try {
    await ensureStorageBucket();
  } catch (error) {
    console.warn('Unable to verify MinIO bucket:', error?.message || error);
  }
  if (!process.env.DATABASE_URL && !process.env.PGHOST) {
    console.warn('Postgres env is missing. Set DATABASE_URL or PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE.');
  }
  console.log(`Backend listening on http://localhost:${PORT}`);
});
