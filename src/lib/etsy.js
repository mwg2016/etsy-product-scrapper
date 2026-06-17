// Etsy Open API v3 helper.
// Docs: https://developers.etsy.com/documentation/reference

const BASE = "https://openapi.etsy.com/v3/application";

export function getKeystring() {
  const key = process.env.ETSY_API_KEY;
  if (!key || key === "your_keystring_here") {
    throw new Error(
      "ETSY_API_KEY missing. .env.local me apni Etsy keystring daalo."
    );
  }
  return key;
}

// x-api-key value. Is account ki app keystring:shared_secret format maangti hai.
function apiKeyValue() {
  const key = getKeystring();
  const secret = process.env.ETSY_SHARED_SECRET;
  return secret ? `${key}:${secret}` : key;
}

function authHeaders(accessToken) {
  const headers = { "x-api-key": apiKeyValue() };
  const token = accessToken || process.env.ETSY_ACCESS_TOKEN;
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

async function etsyFetch(path, { searchParams, accessToken } = {}) {
  const url = new URL(BASE + path);
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url, {
    headers: authHeaders(accessToken),
    cache: "no-store",
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg =
      (body && (body.error || body.message)) || text || `HTTP ${res.status}`;
    const err = new Error(`Etsy ${path} -> ${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

// price object -> number (amount/divisor)
export function money(price) {
  if (!price || typeof price.amount !== "number") return null;
  const divisor = price.divisor || 100;
  return {
    value: price.amount / divisor,
    currency: price.currency_code || "USD",
  };
}

// Shop name (e.g. "CustomCooper") -> shop_id
export async function getShopId(shopName, accessToken) {
  const data = await etsyFetch("/shops", {
    searchParams: { shop_name: shopName },
    accessToken,
  });
  const shop = data?.results?.[0];
  if (!shop) throw new Error(`Shop "${shopName}" nahi mila.`);
  return { shopId: shop.shop_id, shopName: shop.shop_name };
}

// Active listings of a shop (public, API key only). Returns listing objects.
export async function getActiveListings(
  shopId,
  { limit = 20, offset = 0, accessToken } = {}
) {
  const data = await etsyFetch(`/shops/${shopId}/listings/active`, {
    searchParams: { limit, offset, includes: "Images" },
    accessToken,
  });
  return data?.results || [];
}

// Authenticated user's own info: { user_id, shop_id }.
export async function getMe(accessToken) {
  return etsyFetch("/users/me", { accessToken });
}

// Shop details by id (for shop name).
export async function getShop(shopId, accessToken) {
  return etsyFetch(`/shops/${shopId}`, { accessToken });
}

// Per-variant inventory for a listing. Needs OAuth in most cases.
// Returns null if not authorized so caller can degrade gracefully.
export async function tryGetInventory(listingId, accessToken) {
  try {
    const data = await etsyFetch(`/listings/${listingId}/inventory`, {
      accessToken,
    });
    return data;
  } catch (e) {
    if (e.status === 401 || e.status === 403 || e.status === 404) return null;
    throw e;
  }
}
