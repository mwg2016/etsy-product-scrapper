import { cookies } from "next/headers";
import { getValidAccessToken } from "@/lib/tokenStore";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("etsy_session")?.value;
  try {
    const session = await getValidAccessToken(sessionId);
    return Response.json({
      connected: Boolean(session),
      shopName: session?.shopName || null,
    });
  } catch (e) {
    return Response.json({ connected: false, error: e.message });
  }
}
