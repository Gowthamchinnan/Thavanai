import ExcelJS from "exceljs";
import { formatDateTimeIndia } from "@/lib/dates";

export interface SheetColumn {
  header: string;
  key: string;
  width?: number;
  money?: boolean;
  integer?: boolean;
  center?: boolean;
}

export interface SheetSpec {
  name: string;
  title: string;
  subtitle?: string;
  columns: SheetColumn[];
  rows: Record<string, unknown>[];
  totals?: Record<string, unknown>;
  notes?: string[];
}

const MONEY_FORMAT = '"₹"#,##0.00;[Red]-"₹"#,##0.00';

export async function buildWorkbookBuffer(
  specs: SheetSpec[],
  meta: { businessName: string; generatedAt: Date; filters?: string },
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = meta.businessName;
  workbook.created = meta.generatedAt;
  workbook.modified = meta.generatedAt;

  for (const spec of specs) {
    const sheet = workbook.addWorksheet(spec.name.slice(0, 31), {
      views: [{ state: "frozen", ySplit: 0 }],
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });

    const lastColumn = Math.max(1, spec.columns.length);
    const titleRow = sheet.addRow([spec.title]);
    titleRow.font = { size: 15, bold: true, color: { argb: "FF0F172A" } };
    sheet.mergeCells(titleRow.number, 1, titleRow.number, lastColumn);
    titleRow.height = 24;

    const metaRow = sheet.addRow([`${meta.businessName} · Generated ${formatDateTimeIndia(meta.generatedAt)}${meta.filters ? ` · ${meta.filters}` : ""}`]);
    metaRow.font = { size: 9, color: { argb: "FF64748B" } };
    sheet.mergeCells(metaRow.number, 1, metaRow.number, lastColumn);

    if (spec.subtitle) {
      const subtitleRow = sheet.addRow([spec.subtitle]);
      subtitleRow.font = { size: 10, italic: true, color: { argb: "FF475569" } };
      sheet.mergeCells(subtitleRow.number, 1, subtitleRow.number, lastColumn);
    }

    sheet.addRow([]);

    const headerRow = sheet.addRow(spec.columns.map((c) => c.header));
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      cell.border = {
        bottom: { style: "thin", color: { argb: "FF115E59" } },
      };
    });
    headerRow.height = 22;

    spec.columns.forEach((column, index) => {
      const worksheetColumn = sheet.getColumn(index + 1);
      worksheetColumn.width = column.width ?? 18;
      worksheetColumn.key = column.key;
    });

    for (const row of spec.rows) {
      const values = spec.columns.map((column) => {
        const value = row[column.key];
        if (value === null || value === undefined || value === "") return "";
        if (column.money || column.integer) return Number(value);
        return value as ExcelJS.CellValue;
      });
      const added = sheet.addRow(values);
      added.eachCell((cell, colNumber) => {
        const column = spec.columns[colNumber - 1];
        cell.font = { size: 10 };
        cell.border = {
          bottom: { style: "hair", color: { argb: "FFE2E8F0" } },
        };
        if (column?.money) {
          cell.numFmt = MONEY_FORMAT;
          cell.alignment = { horizontal: "right" };
        } else if (column?.integer) {
          cell.alignment = { horizontal: "right" };
        } else if (column?.center) {
          cell.alignment = { horizontal: "center" };
        }
      });
    }

    if (spec.totals) {
      const totalValues = spec.columns.map((column) => {
        const value = spec.totals?.[column.key];
        if (value === null || value === undefined || value === "") return "";
        if (column.money || column.integer) return Number(value);
        return value as ExcelJS.CellValue;
      });
      const totalRow = sheet.addRow(totalValues);
      totalRow.font = { bold: true, size: 10 };
      totalRow.eachCell((cell, colNumber) => {
        const column = spec.columns[colNumber - 1];
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
        cell.border = { top: { style: "thin", color: { argb: "FF94A3B8" } } };
        if (column?.money) {
          cell.numFmt = MONEY_FORMAT;
          cell.alignment = { horizontal: "right" };
        } else if (column?.integer) {
          cell.alignment = { horizontal: "right" };
        }
      });
    }

    if (spec.notes?.length) {
      sheet.addRow([]);
      for (const note of spec.notes) {
        const noteRow = sheet.addRow([note]);
        noteRow.font = { size: 9, italic: true, color: { argb: "FF64748B" } };
        sheet.mergeCells(noteRow.number, 1, noteRow.number, lastColumn);
      }
    }

    if (spec.rows.length === 0) {
      const empty = sheet.addRow(["No records matched the selected filters."]);
      empty.font = { italic: true, color: { argb: "FF64748B" } };
      sheet.mergeCells(empty.number, 1, empty.number, lastColumn);
    }

    sheet.autoFilter = {
      from: { row: headerRow.number, column: 1 },
      to: { row: headerRow.number + spec.rows.length, column: lastColumn },
    };
    sheet.views = [{ state: "frozen", ySplit: headerRow.number }];
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
