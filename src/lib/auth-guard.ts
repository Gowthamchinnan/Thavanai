import { auth } from "@/auth";
import { redirect } from "next/navigation";

export interface AdminUser {
  id: string;
  email: string;
  name: string;
}

export async function requireAdmin(): Promise<AdminUser> {
  const session = await auth();
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
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    name: session.user.name ?? "Administrator",
  };
}
