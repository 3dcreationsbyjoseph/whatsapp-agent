import { updateSession } from "@/lib/supabase/middleware";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Excluye assets estáticos, imágenes de Next, y las rutas de webhook
  // (los webhooks se autentican por firma HMAC, no por sesión).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
