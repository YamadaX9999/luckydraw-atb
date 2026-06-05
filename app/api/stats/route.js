import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

const DISPLAY_TOTAL = 1000;
const LOG_CAP = 1000;

function getAdminKey(req) {
  return req.headers.get('x-admin-key') || '';
}

export async function GET(req) {
  try {
    const isAdmin = getAdminKey(req) === process.env.ADMIN_PASSWORD;

    const poolRemaining = await redis.scard('code_pool');
    const poolTotal = await redis.get('code_pool_total');
    const realTotal = poolTotal ? parseInt(poolTotal) : 0;
    const realUsed = realTotal - poolRemaining;
    const displayUsed = realUsed * 2;

    if (!isAdmin) {
      return Response.json({
        total: DISPLAY_TOTAL,
        used: displayUsed,
        remaining: DISPLAY_TOTAL - displayUsed,
        realUsed,
        realTotal,
      });
    }

    // อ่านแค่ LOG_CAP รายการ — list ถูก cap ตั้งแต่ตอนเขียนแล้ว ไม่ต้อง LTRIM ที่นี่
    const logs = await redis.lrange('draw_log', 0, LOG_CAP - 1);
    const parsedLogs = logs.map(l => {
      try { return typeof l === 'string' ? JSON.parse(l) : l; } catch { return null; }
    }).filter(Boolean);

    return Response.json({
      total: DISPLAY_TOTAL,
      used: displayUsed,
      remaining: DISPLAY_TOTAL - displayUsed,
      realUsed,
      realTotal,
      logCount: parsedLogs.length,
      logs: parsedLogs,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
