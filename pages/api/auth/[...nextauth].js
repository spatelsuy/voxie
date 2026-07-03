import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export default NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      authorization: {
        params: {
          // Phase 1: identity only — no Drive access yet.
          // When Sync is added, extend to: "openid email profile https://www.googleapis.com/auth/drive.appdata"
          scope: "openid email profile https://www.googleapis.com/auth/drive.appdata",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
      }
      return token;
    },
    async session({ session }) {
      // Only expose safe public profile fields to the browser.
      // accessToken / refreshToken stay in the server-side JWT only.
      // To use them in API routes, call: getServerSession(req, res, authOptions)
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
});
