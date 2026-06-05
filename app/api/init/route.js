import { Redis } from '@upstash/redis';
import { CODES } from '../../../lib/codes';

const redis = Redis.fromEnv();

// ตรวจ env ครบไหม
function checkEnv() {
  const required = [
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    'ADMIN_PASSWORD',
    'LINE_CHANNEL_ID',
    'NEXT_PUBLIC_LIFF_ID',
  ];
  const missing = required.filter(k => !process.env[k]);
  return missing;
}

export async function POST(req) {
  try {
    const { password } = await req.json();
    if (password !== process.env.ADMIN_PASSWORD) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ตรวจ env
    const missing = checkEnv();
    if (missing.length > 0) {
      return Response.json({ error: `Missing env: ${missing.join(', ')}` }, { status: 500 });
    }

    // ถ้า pool มีแล้วไม่ต้อง init ซ้ำ
    const existing = await redis.scard('code_pool');
    if (existing > 0) {
      return Response.json({ status: 'already_initialized', count: existing });
    }

    // โหลด code pool
    await redis.sadd('code_pool', ...CODES);
    await redis.set('code_pool_total', CODES.length);

    return Response.json({ status: 'ok', count: CODES.length });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  const missing = checkEnv();
  const poolSize = await redis.scard('code_pool');
  const poolTotal = await redis.get('code_pool_total');

  return Response.json({
    env_ok: missing.length === 0,
    missing_env: missing,
    pool_size: poolSize,
    pool_total: poolTotal ? parseInt(poolTotal) : 0,
  });
}
