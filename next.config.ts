import type { NextConfig } from "next";

// Статическая сборка: бэкенда нет, все данные живут в браузере, поэтому сайт собирается в папку out/
// и открывается с любого статического хостинга.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // ARTIFACT=1 — демо-страница: пути к файлам относительные, папку out/_next кладём как app/_next
  ...(process.env.ARTIFACT ? { assetPrefix: "./app", env: { NEXT_PUBLIC_DEMO: "1" } } : {}),
};

export default nextConfig;
