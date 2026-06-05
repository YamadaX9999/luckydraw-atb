import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

const redis = Redis.fromEnv();

const uidRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(1, '24 h'),
  prefix: 'rl:uid',
});

const ipRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(3, '24 h'),
  prefix: 'rl:ip',
});

async function getVerifiedProfile(accessToken) {
  const [profileRes, verifyRes] = await Promise.all([
    fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
    fetch(`https://api.line.me/oauth2/v2.1/verify?access_token=${accessToken}`),
  ]);

  if (!profileRes.ok || !verifyRes.ok) return null;

  const [profile, tokenInfo] = await Promise.all([profileRes.json(), verifyRes.json()]);

  if (!profile.userId) return null;
  if (tokenInfo.client_id !== process.env.LINE_CHANNEL_ID) return null;
  if (tokenInfo.expires_in <= 0) return null;

  return profile;
}

// Lua script: atomic SPOP → SET line:uid → LPUSH draw_log → LTRIM draw_log
// ถ้าขั้นตอนใดล้มเหลว Redis จะ rollback ทั้งหมด (Lua script รันแบบ atomic)
// KEYS[1] = code_pool, KEYS[2] = uid_key (line:uid), KEYS[3] = draw_log
// ARGV[1] = uid, ARGV[2] = timestamp, ARGV[3] = log cap size
const DRAW_SCRIPT = `
local code = redis.call('SPOP', KEYS[1])
if not code then return {err='empty'} end
redis.call('SET', KEYS[2], code)
local log = cjson.encode({uid=ARGV[1], code=code, time=tonumber(ARGV[2])})
redis.call('LPUSH', KEYS[3], log)
redis.call('LTRIM', KEYS[3], 0, tonumber(ARGV[3]) - 1)
return code
`;

const LOG_CAP = 1000;

export async function POST(req) {
  try {
    const { accessToken } = await req.json();

    if (!accessToken || typeof accessToken !== 'string') {
      return Response.json({ status: 'unauthorized' }, { status: 401 });
    }

    const profile = await getVerifiedProfile(accessToken);
    if (!profile) {
      return Response.json({ status: 'unauthorized' }, { status: 401 });
    }

    const uid = profile.userId;

    // เช็ค already_drawn ก่อน rate limit เพื่อไม่กินโควต้า
    const existingCode = await redis.get(`line:${uid}`);
    if (existingCode !== null && existingCode !== undefined) {
      return Response.json({ status: 'already_drawn', code: existingCode });
    }

    // Rate limit ต่อ IP
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const ipResult = await ipRatelimit.limit(ip);
    if (!ipResult.success) {
      const retryAfterHrs = Math.ceil((ipResult.reset - Date.now()) / 1000 / 60 / 60);
      return Response.json({ status: 'rate_limited', retryAfter: retryAfterHrs });
    }

    // Rate limit ต่อ UID
    const uidResult = await uidRatelimit.limit(uid);
    if (!uidResult.success) {
      const retryAfterHrs = Math.ceil((uidResult.reset - Date.now()) / 1000 / 60 / 60);
      return Response.json({ status: 'rate_limited', retryAfter: retryAfterHrs });
    }

    // Atomic: SPOP + SET + LPUSH + LTRIM ในคำสั่งเดียว ผ่าน Lua script
    const result = await redis.eval(
      DRAW_SCRIPT,
      ['code_pool', `line:${uid}`, 'draw_log'],
      [uid, String(Date.now()), String(LOG_CAP)]
    );

    if (!result || result?.err === 'empty') {
      return Response.json({ status: 'empty' });
    }

    const code = String(result);
    return Response.json({ status: 'won', code });
  } catch (err) {
    console.error(err);
    return Response.json({ status: 'error', message: err.message }, { status: 500 });
  }
}
