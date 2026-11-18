import { auth } from "@/auth";
import { redirect } from "next/navigation";

export interface AdminUser {
  id: string;
  email: string;
  name: string;
}

export async function requireAdmin(): Promise<AdminUser> {
  let session = null;
  try {
    session = await auth();
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    console.error("requireAdmin error:", error);
  }
  if (!session?.user?.id) {
    redirect("/login");
  }
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    name: session.user.name ?? "Administrator",
  };
}

export async function getApiAdmin(): Promise<AdminUser | null> {
  try {
    const session = await auth();
    if (!session?.user?.id) return null;
    return {
      id: session.user.id,
      email: session.user.email ?? "",
      name: session.user.name ?? "Administrator",
    };
  } catch (error) {
    console.error("getApiAdmin error:", error);
    return null;
  }
}
