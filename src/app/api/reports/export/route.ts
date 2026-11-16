import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth-guard";
import { generateReport, isReportType } from "@/lib/services/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "";
  if (!isReportType(type)) {
    return NextResponse.json({ error: "Unknown report type" }, { status: 400 });
  }

  const report = await generateReport(type, {
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });

  return new NextResponse(new Uint8Array(report.buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${report.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
