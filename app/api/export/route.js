import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

const redis = Redis.fromEnv();
const LOG_CAP = 1000;

const exportRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(10, '15 m'),
  prefix: 'rl:export',
});

export async function GET(req) {
  try {
    const adminKey = req.headers.get('x-admin-key') || '';
    if (adminKey !== process.env.ADMIN_PASSWORD) {
      return new Response('Unauthorized', { status: 401 });
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const { success } = await exportRatelimit.limit(ip);
    if (!success) {
      return new Response('Too many requests', { status: 429 });
    }

    // อ่านแค่ LOG_CAP — list ถูก cap ตั้งแต่ตอนเขียนแล้ว ไม่ต้องดึง 0 -1
    const logs = await redis.lrange('draw_log', 0, LOG_CAP - 1);
    const parsedLogs = logs.map(l => {
      try { return typeof l === 'string' ? JSON.parse(l) : l; } catch { return null; }
    }).filter(Boolean);

    const header = 'LINE UID,Code,Date,Time';
    const rows = parsedLogs.map(item => {
      const d = new Date(item.time);
      const date = d.toLocaleDateString('th-TH', { year: 'numeric', month: '2-digit', day: '2-digit' });
      const time = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      // โค้ดถูกย้ายไปเก็บใน line:uid key แล้ว แต่ log เก่าอาจยังมี code field
      const code = item.code || '-';
      return `${item.uid},${code},${date},${time}`;
    });

    const csv = '\uFEFF' + [header, ...rows].join('\r\n');
    const filename = `lucky-draw-export-${new Date().toISOString().slice(0, 10)}.csv`;

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return new Response(err.message, { status: 500 });
  }
}
