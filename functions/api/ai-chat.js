/**
 * Cloudflare Pages Function: /api/ai-chat
 * 安全转发前端对话至智谱开放平台免费模型 GLM-4-Flash
 * - 优先使用环境变量 ZHIPU_API_KEY（服务端免密透传）
 * - 若未配置环境变量，则支持使用请求体中用户自备的免费智谱 API Key
 */

const ZHIPU_ENDPOINT = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const DEFAULT_MODEL = "glm-4-flash";

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function onRequestOptions() {
  return jsonResp({ ok: true }, 204);
}

export async function onRequestGet(context) {
  const hasServerKey = Boolean(context.env && context.env.ZHIPU_API_KEY);
  return jsonResp({
    ok: true,
    serverConfigured: hasServerKey,
    model: DEFAULT_MODEL,
  });
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const messages = Array.isArray(body && body.messages) ? body.messages : [];
    if (!messages.length) {
      return jsonResp({ ok: false, error: "缺少 messages 对话内容" }, 400);
    }

    const envKey = context.env && context.env.ZHIPU_API_KEY ? String(context.env.ZHIPU_API_KEY).trim() : "";
    const clientKey = body && body.apiKey ? String(body.apiKey).trim() : "";
    const apiKey = envKey || clientKey;

    if (!apiKey) {
      return jsonResp(
        {
          ok: false,
          needKey: true,
          error: "尚未配置智谱 GLM-4-Flash 免费 API Key，请在右上角设置或 Cloudflare Pages 环境变量中配置 ZHIPU_API_KEY。",
        },
        401
      );
    }

    const upstream = await fetch(ZHIPU_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages,
        temperature: 0.3,
        max_tokens: 1800,
      }),
    });

    const data = await upstream.json();
    if (!upstream.ok || data.error) {
      const msg = (data && data.error && data.error.message) || `智谱接口异常 (${upstream.status})`;
      return jsonResp({ ok: false, error: msg }, upstream.status >= 400 ? upstream.status : 502);
    }

    const reply =
      (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
    return jsonResp({
      ok: true,
      model: data.model || DEFAULT_MODEL,
      reply,
      usage: data.usage || null,
    });
  } catch (err) {
    return jsonResp({ ok: false, error: `AI 接口调用失败: ${err && err.message ? err.message : String(err)}` }, 500);
  }
}
