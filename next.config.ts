import type { NextConfig } from "next";

// Статическая сборка: бэкенда нет, все данные живут в браузере, поэтому сайт собирается в папку out/
// и открывается с любого статического хостинга.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // ARTIFACT=1 — пути к файлам относительные: сборку можно открыть из любой папки (демо-страница, файл на диске)
  ...(process.env.ARTIFACT ? { assetPrefix: "./", env: { NEXT_PUBLIC_DEMO: "1" } } : {}),
};

export default nextConfig;
