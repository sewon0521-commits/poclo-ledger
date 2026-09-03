import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const MAX_BODY = 12 * 1024 * 1024;

/**
 * `npm run dev`에서도 /api/read-receipt가 돌아가게 하는 플러그인.
 *
 * 배포(Vercel)에서는 api/ 폴더가 자동으로 서버리스 함수가 되지만 Vite 개발 서버는
 * 그 규칙을 모른다. 그래서 같은 handler를 미들웨어로 물리고, Vercel이 넣어주는
 * req.body / res.status().json() 만 흉내 낸다.
 *
 * ANTHROPIC_API_KEY는 프로젝트 루트 .env에서 읽어 서버 쪽 process.env에만 넣는다.
 * (VITE_ 접두사가 없으므로 클라이언트 번들에는 절대 들어가지 않는다.)
 */
function devApi() {
  return {
    name: "poclo-dev-api",
    apply: "serve",
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), "");
      if (env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY) {
        process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
      }

      server.middlewares.use("/api/read-receipt", async (req, res, next) => {
        if (req.method !== "POST") return next();

        let raw = "";
        let tooBig = false;
        req.on("data", (chunk) => {
          raw += chunk;
          if (raw.length > MAX_BODY) {
            tooBig = true;
            req.destroy();
          }
        });

        req.on("end", async () => {
          if (tooBig) {
            res.statusCode = 413;
            res.setHeader("Content-Type", "application/json");
            return res.end(JSON.stringify({ error: "too_large", message: "사진이 너무 커요." }));
          }
          try {
            req.body = raw ? JSON.parse(raw) : {};
          } catch {
            req.body = {};
          }
          // Vercel 응답 헬퍼 흉내
          res.status = (code) => {
            res.statusCode = code;
            return res;
          };
          res.json = (payload) => {
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify(payload));
            return res;
          };

          try {
            const { default: handler } = await server.ssrLoadModule("/api/read-receipt.js");
            await handler(req, res);
          } catch (err) {
            server.config.logger.error("[dev-api] " + (err?.stack || err));
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ error: "dev", message: "개발 서버에서 장끼 읽기에 실패했어요." }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    devApi(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon-192.png", "icon-512.png", "apple-touch-icon.png"],
      manifest: {
        name: "포클로 매입 장부",
        short_name: "포클로 장부",
        description: "사입 매입·부가세 관리 장부",
        lang: "ko",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#fafaf9",
        theme_color: "#9f1239",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
});
