# Lucky Draw

## การตั้งค่าครั้งแรก (First-time setup)

1. ตั้งค่า environment variables ใน Vercel ให้ครบทุกตัวใน `.env.example`
2. Deploy ขึ้น Vercel
3. เรียก POST `/api/init` พร้อม body `{ "password": "your_admin_password" }` เพื่อโหลด code pool เข้า Redis
   หรือเข้าหน้า Admin แล้วกด "รีเซ็ตทั้งหมด" (จะโหลด pool ใหม่ให้อัตโนมัติ)

## การเข้าใช้งาน

- แชร์ลิงค์ LIFF: `https://liff.line.me/your-liff-id`
- หน้า Admin: เพิ่ม `?admin=1` ต่อท้าย URL

## Environment Variables

| Key | คำอธิบาย |
|-----|---------|
| UPSTASH_REDIS_REST_URL | URL ของ Upstash Redis |
| UPSTASH_REDIS_REST_TOKEN | Token ของ Upstash Redis |
| ADMIN_PASSWORD | รหัสผ่าน Admin |
| LINE_CHANNEL_ID | Channel ID ของ LINE Login |
| NEXT_PUBLIC_BASE_URL | URL ของเว็บไซต์ |
| NEXT_PUBLIC_LIFF_ID | LIFF ID จาก LINE Developers Console |

## Architecture

- โค้ดถูกเก็บใน Redis Set (`code_pool`) → ใช้ `SPOP` เพื่อแจกแบบ atomic ป้องกัน race condition
- Rate limit ต่อ UID และ IP ผ่าน Upstash Ratelimit
- ยืนยันตัวตนผ่าน LIFF access token → verify กับ LINE API ฝั่ง server
