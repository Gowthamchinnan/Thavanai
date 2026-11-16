"use client";

import * as React from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, SelectNative } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { REPORT_TYPE_OPTIONS } from "@/lib/constants";

export function ReportDownloadForm({ defaultFrom, defaultTo }: { defaultFrom: string; defaultTo: string }) {
  const [type, setType] = React.useState<string>("collections");
  const needsRange = type === "collections" || type === "overdue";
  const selected = REPORT_TYPE_OPTIONS.find((report) => report.value === type);

  return (
    <form action="/api/reports/export" method="get" className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="report-type">Report</Label>
        <SelectNative id="report-type" name="type" value={type} onChange={(event) => setType(event.target.value)}>
          {REPORT_TYPE_OPTIONS.map((report) => (
            <option key={report.value} value={report.value}>
              {report.label}
            </option>
          ))}
        </SelectNative>
        {selected ? <p className="text-xs text-muted-foreground">{selected.description}</p> : null}
      </div>

      {needsRange ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="report-from">From</Label>
            <Input id="report-from" name="from" type="date" defaultValue={defaultFrom} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="report-to">To</Label>
            <Input id="report-to" name="to" type="date" defaultValue={defaultTo} />
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Date range applies to payment dates (collections) or installment due dates (overdue). Dates use Asia/Kolkata.
          </p>
        </div>
      ) : null}

      <Button type="submit" className="w-full sm:w-auto">
        <Download className="h-4 w-4" /> Download Excel report
      </Button>
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <FileSpreadsheet className="h-3.5 w-3.5" /> Server-generated XLSX with INR formatting and summary totals.
      </p>
    </form>
  );
}
