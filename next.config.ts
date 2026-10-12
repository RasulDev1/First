import type { NextConfig } from "next";

// Статическая сборка: бэкенда нет, все данные живут в браузере, поэтому сайт собирается в папку out/
// и открывается с любого статического хостинга.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
