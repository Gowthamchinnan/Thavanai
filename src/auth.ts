import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { clientIpFromHeaders, isLoginRateLimited, recordLoginAttempt } from "@/lib/rate-limit";

const authSecret =
  process.env.AUTH_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  "uQyh9ZYnXwG4K57LGsrAeT19TE9Jyq5z3k2v3dYHwMk=";

if (!process.env.AUTH_SECRET) {
  process.env.AUTH_SECRET = authSecret;
}
if (!process.env.NEXTAUTH_SECRET) {
  process.env.NEXTAUTH_SECRET = authSecret;
}
if (!process.env.AUTH_TRUST_HOST) {
  process.env.AUTH_TRUST_HOST = "true";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: authSecret,
  trustHost: true,
  logger: {
    error(error) {
      if (error.name === "JWTSessionError") {
        console.warn("[auth] Ignoring invalid or expired session cookie.");
        return;
      }
      console.error("[auth][error]", error);
    },
  },
  session: { strategy: "jwt", maxAge: 8 * 60 * 60, updateAge: 15 * 60 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "Administrator",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const email = typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) return null;

        const ipAddress = clientIpFromHeaders(request.headers);
        if (await isLoginRateLimited(email, ipAddress)) {
          return null;
        }

        const admin = await prisma.admin.findUnique({ where: { email } });
        if (!admin) {
          await recordLoginAttempt(email, ipAddress, false);
          return null;
        }

        const valid = await verifyPassword(admin.passwordHash, password);
        await recordLoginAttempt(email, ipAddress, valid);
        if (!valid) return null;

        await prisma.admin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
        return { id: admin.id, email: admin.email, name: admin.name };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      const adminId = (token.sub ?? token.id) as string | undefined;
      if (!adminId) return session;
      const admin = await prisma.admin.findUnique({
        where: { id: adminId },
        select: { id: true, email: true, name: true },
      });
      if (!admin) return session;
      session.user.id = admin.id;
      session.user.email = admin.email;
      session.user.name = admin.name;
      return session;
    },
  },
});
