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
    if (error instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    const digest = (error as { digest?: string } | null)?.digest;
    if (
      (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) ||
      (error instanceof Error && error.message.includes("NEXT_REDIRECT"))
    ) {
      throw error;
    }
    console.error("Login action error:", error);
    return { error: "Unable to connect to the database. Please check server configuration." };
  }
  return {};
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
