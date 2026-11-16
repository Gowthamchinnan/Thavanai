import { headers } from "next/headers";
import { clientIpFromHeaders } from "@/lib/rate-limit";

export async function getActionIp(): Promise<string | null> {
  const headerStore = await headers();
  return clientIpFromHeaders(headerStore);
}
