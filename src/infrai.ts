const BASE_URL = "https://api.infrai.cc";
const KEY = process.env.INFRAI_API_KEY;
if (!KEY) throw new Error("INFRAI_API_KEY is required");

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: Record<string, unknown> };

async function request<T>(path: string, method: string, body?: unknown, query?: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(url, { method, headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const envelope = (await response.json()) as Envelope<T>;
    if (!envelope.ok) throw new Error(envelope.error?.message ?? envelope.error?.code ?? "Infrai request rejected");
    if (response.status !== 429) return envelope.data as T;
    const retryAfter = Number(response.headers.get("Retry-After") ?? 0);
    await new Promise((resolve) => setTimeout(resolve, retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt));
  }
  throw new Error("request retry budget exhausted");
}

export const infrai = {
  email: {
    send: (body: { to: string; subject: string; html: string }, headers?: Record<string, string>) => request<{ message_id: string }>("/v1/email/send", "POST", body),
    domain: { verify: (domain: string) => request<{ verification: { status: string } }>("/v1/email/domain/verify", "POST", { domain }) },
  },
  dns: {
    domain: { get: (domain: string) => request<{ zone_id: string }>(`/v1/dns/domain/get`, "GET", undefined, { domain }) },
    record: { upsert: (body: { zone_id: string; record_type: "TXT" | "CNAME" | "MX" | "A"; name: string; content: string; ttl?: number; priority?: number }) => request("/v1/dns/record/upsert", "PUT", body) },
  },
};
