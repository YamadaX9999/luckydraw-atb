import './globals.css';
import Script from 'next/script';

export const metadata = {
  title: 'สุ่มรับโค้ดรางวัล',
  description: 'กดสุ่มเพื่อลุ้นรับโค้ดรางวัล',
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <head>
        <Script src="https://static.line-scdn.net/liff/edge/2/sdk.js" strategy="beforeInteractive" />
      </head>
      <body>{children}</body>
    </html>
  );
}
