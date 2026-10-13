import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRM Вентиляция",
  description: "CRM для компании по монтажу вентиляции и кондиционеров",
  icons: { icon: "img/mark.svg" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f8f9fa" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Geist:wght@400;500;600;700&display=swap" />
        <script dangerouslySetInnerHTML={{ __html: 'try{var f=localStorage.getItem("ventcrm_font");if(f==="geist"||f==="inter")document.documentElement.dataset.font=f;else document.documentElement.dataset.font="inter"}catch(e){document.documentElement.dataset.font="inter"}' }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
