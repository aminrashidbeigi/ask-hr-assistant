import { NextResponse, type NextRequest } from "next/server";

/** Constant-time string comparison (avoids leaking how many leading characters matched). */
function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** HTTP basic auth for the admin dashboard (ADMIN_USER / ADMIN_PASSWORD). */
export function proxy(request: NextRequest) {
  const user = process.env.ADMIN_USER;
  const password = process.env.ADMIN_PASSWORD;
  if (!user || !password) {
    return new NextResponse("Admin dashboard is disabled: ADMIN_USER / ADMIN_PASSWORD are not set.", { status: 503 });
  }

  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const [u, ...rest] = atob(header.slice(6)).split(":");
      if (safeEqual(u, user) && safeEqual(rest.join(":"), password)) return NextResponse.next();
    } catch {
      /* malformed header → fall through to 401 */
    }
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Ask HR admin", charset="UTF-8"' },
  });
}

export const config = { matcher: ["/admin/:path*"] };
