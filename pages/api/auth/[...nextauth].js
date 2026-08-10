import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

/** Refresh an expired Google access token using the stored refresh token */
async function refreshAccessToken(token) {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        grant_type:    "refresh_token",
        refresh_token: token.refreshToken,
      }),
    });
    const refreshed = await res.json();
    if (!res.ok) throw refreshed;
    return {
      ...token,
      accessToken:          refreshed.access_token,
      // Google may or may not return a new refresh token — keep old one if not
      refreshToken:         refreshed.refresh_token ?? token.refreshToken,
      accessTokenExpiresAt: Date.now() + refreshed.expires_in * 1000,
      error:                undefined,
    };
  } catch (err) {
    console.error("Token refresh failed:", err);
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      authorization: {
        params: {
          // calendar — full access needed to create the "From Kahija" calendar
          // and manage events within it.
          // Note: requires Google OAuth verification for production apps.
          // drive.appdata removed — Drive sync not in use.
          scope: "openid email profile https://www.googleapis.com/auth/calendar",
          access_type: "offline",
          response_type: "code",
          prompt: "consent",  // force re-consent so Google issues a new token with the updated scope
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // First sign-in — store tokens and expiry
      if (account) {
        return {
          ...token,
          accessToken:          account.access_token,
          refreshToken:         account.refresh_token,
          accessTokenExpiresAt: account.expires_at
            ? account.expires_at * 1000          // Google gives seconds
            : Date.now() + 3600 * 1000,           // fallback: 1 hour
        };
      }
      // Token still valid — return as-is
      if (Date.now() < token.accessTokenExpiresAt - 60_000) {
        return token;
      }
      // Token expired (or expiring within 60s) — refresh it
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      // Expose refresh error to the browser so UI can prompt re-login
      if (token.error === "RefreshAccessTokenError") {
        session.error = "RefreshAccessTokenError";
      }
      // accessToken / refreshToken stay server-side in the JWT only
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export default NextAuth(authOptions);
