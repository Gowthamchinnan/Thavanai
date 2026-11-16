import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";

export const PDF_COLORS = {
  ink: "#0f172a",
  muted: "#64748b",
  line: "#e2e8f0",
  teal: "#0f766e",
  tealSoft: "#f0fdfa",
  rose: "#be123c",
  slateSoft: "#f8fafc",
};

export function fontPath(file: string): string {
  return path.join(process.cwd(), "assets", "fonts", file);
}

export function createPdf(): PDFKit.PDFDocument {
  const doc = new PDFDocument({
    size: "A4",
    bufferPages: true,
    margins: { top: 42, bottom: 46, left: 44, right: 44 },
    info: {
      Creator: "Thavanai Manager",
      Producer: "Thavanai Manager",
    },
  });
  const regular = fontPath("NotoSans-Regular.ttf");
  const bold = fontPath("NotoSans-Bold.ttf");
  doc.registerFont("Body", fs.existsSync(regular) ? regular : "Helvetica");
  doc.registerFont("Heading", fs.existsSync(bold) ? bold : "Helvetica-Bold");
  doc.font("Body");
  return doc;
}

export async function renderPdf(build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  const doc = createPdf();
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  build(doc);
  doc.end();
  return done;
}

export interface PdfColumn {
  header: string;
  width: number;
  align?: "left" | "right" | "center";
}

export function contentWidth(doc: PDFKit.PDFDocument): number {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

export function drawRule(doc: PDFKit.PDFDocument, y: number, color = PDF_COLORS.line): void {
  const x = doc.page.margins.left;
  const width = contentWidth(doc);
  doc.save().strokeColor(color).lineWidth(0.8).moveTo(x, y).lineTo(x + width, y).stroke().restore();
}

export function drawPageFooter(doc: PDFKit.PDFDocument, label: string): void {
  const range = doc.bufferedPageRange();
  const total = range.count;
  for (let i = 0; i < total; i += 1) {
    doc.switchToPage(range.start + i);
    const y = doc.page.height - 30;
    doc.font("Body").fontSize(7.5).fillColor(PDF_COLORS.muted);
    doc.text(label, doc.page.margins.left, y, {
      width: contentWidth(doc) / 2,
      align: "left",
      lineBreak: false,
    });
    doc.text(`Page ${i + 1} of ${total}`, doc.page.margins.left, y, {
      width: contentWidth(doc),
      align: "right",
      lineBreak: false,
    });
  }
}

function drawTableHeader(doc: PDFKit.PDFDocument, columns: PdfColumn[], x: number, y: number): number {
  const totalWidth = columns.reduce((sum, c) => sum + c.width, 0);
  const height = 20;
  doc.save().rect(x, y, totalWidth, height).fill(PDF_COLORS.teal).restore();
  let cellX = x;
  doc.font("Heading").fontSize(8).fillColor("#ffffff");
  for (const column of columns) {
    doc.text(column.header, cellX + 4, y + 6, {
      width: column.width - 8,
      align: column.align ?? "left",
      lineBreak: false,
      ellipsis: true,
    });
    cellX += column.width;
  }
  return y + height;
}

export function drawTable(
  doc: PDFKit.PDFDocument,
  options: {
    columns: PdfColumn[];
    rows: string[][];
    x?: number;
    y: number;
    emptyText?: string;
    fontSize?: number;
    rowHeight?: number;
    maxFirstRows?: number;
  },
): number {
  const x = options.x ?? doc.page.margins.left;
  const totalWidth = options.columns.reduce((sum, c) => sum + c.width, 0);
  const rowHeight = options.rowHeight ?? 17;
  const fontSize = options.fontSize ?? 8;
  const limit = options.maxFirstRows ?? Infinity;
  let y = options.y;

  const ensureSpace = (needed: number) => {
    const bottom = doc.page.height - doc.page.margins.bottom - 34;
    if (y + needed > bottom) {
      doc.addPage();
      y = doc.page.margins.top;
      y = drawTableHeader(doc, options.columns, x, y);
    }
  };

  y = drawTableHeader(doc, options.columns, x, y);

  if (!options.rows.length) {
    ensureSpace(rowHeight);
    doc.font("Body").fontSize(fontSize).fillColor(PDF_COLORS.muted).text(
      options.emptyText ?? "No records.",
      x + 4,
      y + 5,
      { width: totalWidth - 8, lineBreak: false },
    );
    y += rowHeight;
    drawRule(doc, y);
    return y;
  }

  let rowIndex = 0;
  for (const row of options.rows) {
    ensureSpace(rowHeight);
    if (rowIndex % 2 === 1) {
      doc.save().rect(x, y, totalWidth, rowHeight).fill(PDF_COLORS.slateSoft).restore();
    }
    let cellX = x;
    doc.font("Body").fontSize(fontSize).fillColor(PDF_COLORS.ink);
    for (let i = 0; i < options.columns.length; i += 1) {
      const column = options.columns[i];
      doc.text(row[i] ?? "", cellX + 4, y + 5, {
        width: column.width - 8,
        align: column.align ?? "left",
        lineBreak: false,
        ellipsis: true,
      });
      cellX += column.width;
    }
    y += rowHeight;
    rowIndex += 1;
    if (rowIndex >= limit) break;
  }
  drawRule(doc, y);
  return y;
}

export function drawKeyValueGrid(
  doc: PDFKit.PDFDocument,
  rows: { label: string; value: string; emphasize?: boolean }[],
  options?: { y: number; x?: number; width?: number; columns?: number },
): number {
  const x = options?.x ?? doc.page.margins.left;
  const totalWidth = options?.width ?? contentWidth(doc);
  const columns = options?.columns ?? 2;
  const gap = 12;
  const columnWidth = (totalWidth - gap * (columns - 1)) / columns;
  let y = options?.y ?? doc.y;
  rows.forEach((row, index) => {
    const col = index % columns;
    if (col === 0 && index > 0) y += row.emphasize ? 30 : 26;
    const cellX = x + col * (columnWidth + gap);
    doc.font("Body").fontSize(7.5).fillColor(PDF_COLORS.muted).text(row.label.toUpperCase(), cellX, y, {
      width: columnWidth,
      lineBreak: false,
    });
    doc
      .font(row.emphasize ? "Heading" : "Body")
      .fontSize(row.emphasize ? 12 : 9.5)
      .fillColor(PDF_COLORS.ink)
      .text(row.value, cellX, y + 11, { width: columnWidth, lineBreak: false, ellipsis: true });
  });
  return y + 26;
}
