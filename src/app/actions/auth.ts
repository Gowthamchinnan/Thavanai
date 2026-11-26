"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { loginSchema } from "@/lib/validation";
import { clientIpFromHeaders, isLoginRateLimited } from "@/lib/rate-limit";

export interface LoginState {
  error?: string;
}

export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Enter a valid email address and password." };

  try {
    const headerStore = await headers();
    const ipAddress = clientIpFromHeaders(headerStore);
    if (await isLoginRateLimited(parsed.data.email.toLowerCase(), ipAddress)) {
      return { error: "Too many failed attempts. Please wait 15 minutes and try again." };
    }

    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    const digest = (error as { digest?: string } | null)?.digest;
    if (
      (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) ||
      (error instanceof Error && error.message.includes("NEXT_REDIRECT"))
    ) {
      throw error;
    }

    const causeErr = (error as { cause?: { err?: unknown } } | null)?.cause?.err;
    const isPrismaErr = (err: unknown) =>
      err instanceof Error && (err.name.startsWith("Prisma") || err.message.includes("Can't reach database server"));

    if (isPrismaErr(error) || isPrismaErr(causeErr)) {
      console.error("Login database error:", error);
      return { error: "Unable to connect to the database. Please check server configuration." };
    }

    if (
      error instanceof AuthError ||
      (error instanceof Error && (error.name === "CredentialsSignin" || error.name === "CallbackRouteError" || error.name === "AuthError"))
    ) {
      return { error: "Invalid email or password." };
    }

    console.error("Login action error:", error);
    const detail = process.env.NODE_ENV === "development" && error instanceof Error ? ` (${error.message.slice(0, 120)})` : "";
    return { error: `Sign-in failed due to a server error.${detail}` };
  }
  return {};
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
