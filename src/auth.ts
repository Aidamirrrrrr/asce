import { compare } from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { DEV_USER_EMAIL, isDevAuthSkip } from "@/lib/auth/dev-skip";
import { normalizeEmail, verifyAndConsumeLoginCode } from "@/lib/auth/email-code";
import { db } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      id: "dev",
      name: "Dev skip",
      credentials: {},
      async authorize() {
        // Жёсткая защита: только вне production и при явном флаге.
        if (!isDevAuthSkip()) {
          return null;
        }
        const user = await db.user.upsert({
          where: { email: DEV_USER_EMAIL },
          update: {},
          create: { email: DEV_USER_EMAIL, name: "Dev", emailVerified: new Date() },
          select: { id: true, email: true, name: true },
        });
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
    Credentials({
      id: "email-code",
      name: "Email code",
      credentials: {
        email: { label: "Email", type: "email" },
        code: { label: "Code", type: "text" },
      },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === "string" ? normalizeEmail(credentials.email) : "";
        const code = typeof credentials?.code === "string" ? credentials.code.trim() : "";
        if (!(email && /^\d{6}$/.test(code))) {
          return null;
        }

        const ok = await verifyAndConsumeLoginCode(email, code);
        if (!ok) {
          return null;
        }

        // Код выдаётся только после проверки пароля (см. /api/auth/email-code/request),
        // поэтому здесь достаточно сверить код существующего пользователя.
        const user = await db.user.findUnique({ where: { email } });
        if (!user) {
          return null;
        }
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";

        if (!(email && password)) {
          return null;
        }

        const user = await db.user.findUnique({ where: { email } });
        if (!user?.passwordHash) {
          return null;
        }

        const valid = await compare(password, user.passwordHash);
        if (!valid) {
          return null;
        }

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  secret: process.env.AUTH_SECRET ?? "dev-only-auth-secret-change-me",
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
});
