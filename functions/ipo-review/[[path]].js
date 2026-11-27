/**
 * Cloudflare Pages Function — SPA 独立路由回退
 * 拦截所有 /ipo-review/* 直接访问或浏览器刷新请求，返回根目录 /index.html（HTTP 200）。
 */
export async function onRequest(context) {
  const url = new URL("/index.html", context.request.url);
  const resp = await context.env.ASSETS.fetch(url);
  const headers = new Headers(resp.headers);
  headers.set("Cache-Control", "public, max-age=0, must-revalidate");
  return new Response(resp.body, {
    status: 200,
    headers,
  });
}
