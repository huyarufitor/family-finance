export function headers(origin: string | null) {
  const allowed = Deno.env.get("ALLOWED_ORIGIN") || "*";
  return {
    "Access-Control-Allow-Origin":
      allowed === "*" ? "*" : origin === allowed ? allowed : "null",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info, x-channel-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
}
export function json(req: Request, value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: headers(req.headers.get("origin")),
  });
}
export function environment(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
export async function body(req: Request, max = 100000) {
  const text = await req.text();
  if (text.length > max) throw new Error("请求内容过大");
  return JSON.parse(text);
}
export async function rest(
  path: string,
  options: RequestInit = {},
  token?: string,
) {
  const key = environment(
    token ? "SUPABASE_ANON_KEY" : "SUPABASE_SERVICE_ROLE_KEY",
  );
  return fetch(`${environment("SUPABASE_URL")}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token || key}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
}
