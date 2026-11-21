import type { Metadata } from 'next';
import { ShopProvider } from '@/store/shop';
import { ThemeProvider } from '@/store/theme';
import { Shell } from '@/components/layout/shell';
import '@/styles/globals.css';
import '@/styles/retail-shell.css';
import '@/styles/retail-catalog.css';
import '@/styles/retail-checkout.css';
import '@/styles/retail-orders.css';
import '@/styles/promotions.css';
import '@/styles/reviews.css';
import '@/styles/chat.css';
import 'leaflet/dist/leaflet.css';
export const metadata: Metadata = {
  title: { default: 'ShopGo — Mua tươi ngon, nhận thảnh thơi', template: '%s | ShopGo' },
  description: 'Chọn thực phẩm tại cửa hàng, đặt giờ và ghé nhận với ShopGo.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const themeScript = `(function(){try{var p=localStorage.getItem('shopgo-theme');if(p!=='light'&&p!=='dark'&&p!=='system')p='system';var t=p==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p;var e=document.documentElement;e.dataset.theme=t;e.dataset.themePreference=p;e.style.colorScheme=t}catch(_){}})();`;
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a className="skip-link" href="#main-content">
          Đến nội dung chính
        </a>
        <ThemeProvider>
          <ShopProvider>
            <Shell>{children}</Shell>
          </ShopProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
