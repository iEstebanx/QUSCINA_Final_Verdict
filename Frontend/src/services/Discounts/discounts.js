// Frontend/src/services/Discounts/discounts.jsx
const API_BASE = import.meta.env?.VITE_API_BASE || "";
const join = (p) => `${API_BASE}`.replace(/\/+$/,"") + `/${String(p||"").replace(/^\/+/, "")}`;

// safer JSON parse for API responses
async function safeJson(res) {
  const text = await res.text();
  try { return text ? JSON.parse(text) : {}; }
  catch { return { error: text || res.statusText || "Invalid response" }; }
}

/**
 * Live reads via backend polling (works with cookie sessions).
 * Calls cb({ rows })
 */
export function subscribeDiscounts(cb, { intervalMs = 5000, onError } = {}) {
  let stopped = false;
  let timer = null;

  async function tick() {
    try {
      const res = await fetch(join("/api/discounts"), {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      // Backend returns an array of discounts
      const rows = (Array.isArray(data) ? data : []).map((d) => ({
        id: d.id || d.code, // keep your UI happy
        ...d,
      }));

      cb({ rows });
    } catch (e) {
      console.error("[subscribeDiscounts] failed:", e);
      onError?.(e.message || "Failed to fetch discounts");
    } finally {
      if (!stopped) timer = setTimeout(tick, intervalMs);
    }
  }

  tick();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}

/** Optional one-shot fetch */
export async function fetchDiscountsOnce() {
  const res = await fetch(join("/api/discounts"), {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.error || "Fetch discounts failed");
  return (Array.isArray(data) ? data : []).map((d) => ({ id: d.id || d.code, ...d }));
}

/** Writes go through your API (with cookies) */
export async function createDiscountAuto(payload) {
  const res = await fetch(join("/api/discounts"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: payload.name,
      value: Number(payload.value),
      type: payload.type ?? "percent",
      scope: payload.scope ?? "order",
      isStackable: !!payload.isStackable,
      requiresApproval: !!payload.requiresApproval,
      isActive: payload.isActive !== false,
    }),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.error || "Create failed");
  return data; // { ok: true, code }
}

export async function updateDiscount(code, patch) {
  const res = await fetch(join(`/api/discounts/${encodeURIComponent(code)}`), {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.error || "Update failed");
  return data;
}

export async function deleteDiscount(code) {
  const res = await fetch(join(`/api/discounts/${encodeURIComponent(code)}`), {
    method: "DELETE",
    credentials: "include",
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.error || "Delete failed");
  return data;
}

export async function deleteMany(codes = []) {
  const res = await fetch(join(`/api/discounts/bulkDelete`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codes }),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.error || "Bulk delete failed");
  return data;
}