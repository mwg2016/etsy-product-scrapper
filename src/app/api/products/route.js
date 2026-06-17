import { cookies } from "next/headers";
import {
  getShopId,
  getActiveListings,
  tryGetInventory,
  money,
} from "@/lib/etsy";
import { getValidAccessToken } from "@/lib/tokenStore";

export const dynamic = "force-dynamic";

function fmtVariant(propertyValues) {
  if (!propertyValues?.length) return "";
  return propertyValues
    .map((p) => `${p.property_name}: ${(p.values || []).join("/")}`)
    .join(" | ");
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit")) || 20, 100);

  const cookieStore = await cookies();
  const sessionId = cookieStore.get("etsy_session")?.value;

  let accessToken = null;
  let connectedShop = null;
  try {
    const session = await getValidAccessToken(sessionId);
    if (session) {
      accessToken = session.accessToken;
      connectedShop = session.shopName;
    }
  } catch {
    // token refresh fail -> treat as not connected
  }

  // shop param se ya connected shop se decide karo
  const shop =
    searchParams.get("shop") || connectedShop || process.env.ETSY_DEFAULT_SHOP || "";
  if (!shop) {
    return Response.json(
      { error: "shop param missing (ya Connect Etsy karo)" },
      { status: 400 }
    );
  }

  try {
    const { shopId, shopName } = await getShopId(shop, accessToken);
    const listings = await getActiveListings(shopId, { limit, accessToken });

    const rows = [];
    const warnings = new Set();

    for (const l of listings) {
      const inv = await tryGetInventory(l.listing_id, accessToken);

      if (inv?.products?.length) {
        // Per-variant data available
        for (const prod of inv.products) {
          const variant = fmtVariant(prod.property_values);
          for (const off of prod.offerings || []) {
            const m = money(off.price);
            rows.push({
              listing_id: l.listing_id,
              title: l.title,
              url: l.url,
              variant,
              sku: prod.sku || "",
              price: m ? m.value : null,
              currency: m ? m.currency : null,
              quantity: off.quantity ?? null,
              available: off.is_enabled ? "yes" : "no",
              source: "inventory",
            });
          }
        }
      } else {
        // Fallback: listing-level price + total quantity (no variant breakdown)
        warnings.add(
          accessToken
            ? "OAuth connected hai phir bhi per-variant inventory nahi mila (shayad in listings ke owner aap nahi ho) — listing-level price + total qty dikha raha hoon."
            : "Per-variant inventory ke liye 'Connect Etsy' karo. Abhi listing-level price + total qty dikha raha hoon."
        );
        const m = money(l.price);
        rows.push({
          listing_id: l.listing_id,
          title: l.title,
          url: l.url,
          variant: "(all variants — no breakdown)",
          sku: "",
          price: m ? m.value : null,
          currency: m ? m.currency : null,
          quantity: l.quantity ?? null,
          available: l.state === "active" ? "yes" : "no",
          source: "listing",
        });
      }
    }

    return Response.json({
      shop: shopName,
      shopId,
      connected: Boolean(accessToken),
      listingCount: listings.length,
      rowCount: rows.length,
      warnings: [...warnings],
      rows,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}
