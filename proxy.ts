import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isUnauthenticatedAuthError } from "@/features/auth/types";
import { getSafeInternalRedirectUrl } from "@/lib/utils";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const pathname = request.nextUrl.pathname;

  const isDashboardRoute = pathname.startsWith("/dashboard");
  const isOnboardingRoute = pathname.startsWith("/onboarding");
  // Coarse internal-operator prefix only: "/internal" and "/internal/...",
  // never lookalikes such as "/internally". Authorization is not decided here.
  const isInternalRoute =
    pathname === "/internal" || pathname.startsWith("/internal/");
  const isAuthRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password");

  const isProtectedRoute =
    isDashboardRoute || isOnboardingRoute || isInternalRoute;

  // Bypass Auth check entirely for accountless public routes
  if (!isProtectedRoute && !isAuthRoute) {
    return supabaseResponse;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // Refresh auth token
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  // If there is an infrastructure failure from Supabase Auth, do not treat as logout/redirect
  const isDefinitelyUnauthenticated =
    !user && (!error || isUnauthenticatedAuthError(error));

  // Coarse route redirects (defense in depth is still in feature interfaces + RLS)
  if (isDefinitelyUnauthenticated && isProtectedRoute) {
    const redirectUrl = new URL("/login", request.url);
    // Preserve the requested path and its query so login can return there.
    redirectUrl.searchParams.set(
      "redirectTo",
      `${pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(redirectUrl);
  }

  if (user && isAuthRoute) {
    const target = getSafeInternalRedirectUrl(
      request.nextUrl.searchParams.get("redirectTo"),
      "/dashboard",
    );
    // Resolve against the request origin only; the login request's own query
    // (including its untrusted redirectTo) is not carried into the destination.
    return NextResponse.redirect(new URL(target, request.url));
  }

  return supabaseResponse;
}

export default proxy;

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
