"use client";

import * as React from "react";
import { Download, Share2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

export function WhatsAppShareButton({
  mobile,
  message,
  pdfUrl,
  fileName,
  label = "Share via WhatsApp",
  variant = "outline",
  size = "sm",
}: {
  mobile: string;
  message: string;
  pdfUrl?: string;
  fileName?: string;
  label?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
}) {
  const [mounted, setMounted] = React.useState(false);
  const [sharingFile, setSharingFile] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  function openWhatsApp() {
    const url = buildWhatsAppUrl(mobile, message);
    if (!url) {
      toast.error("The customer's mobile number is not a valid Indian mobile number.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
    toast.info("WhatsApp opened with a prefilled message. Download the PDF and attach it manually — delivery is not automatic.", {
      duration: 8000,
    });
  }

  async function shareFile() {
    if (!pdfUrl) return;
    try {
      setSharingFile(true);
      const response = await fetch(pdfUrl);
      if (!response.ok) throw new Error("Could not download the PDF.");
      const blob = await response.blob();
      const file = new File([blob], fileName ?? "statement.pdf", { type: "application/pdf" });
      const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], text: message, title: fileName ?? "Loan statement" });
        toast.success("Shared using your device. Confirm the recipient in the share sheet.");
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName ?? "statement.pdf";
        link.click();
        URL.revokeObjectURL(url);
        toast.info("Direct PDF sharing is not available on this device. The PDF was downloaded — attach it manually in WhatsApp.");
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        toast.error(error instanceof Error ? error.message : "Could not share the PDF.");
      }
    } finally {
      setSharingFile(false);
    }
  }

  const canShareFiles =
    mounted &&
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof (navigator as Navigator & { canShare?: unknown }).canShare === "function";

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant={variant} size={size} onClick={openWhatsApp}>
        <Share2 className="h-4 w-4" /> {label}
      </Button>
      {canShareFiles && pdfUrl ? (
        <Button type="button" variant="ghost" size={size} onClick={shareFile} disabled={sharingFile}>
          <Smartphone className="h-4 w-4" /> {sharingFile ? "Preparing…" : "Share PDF"}
        </Button>
      ) : null}
    </div>
  );
}

export function DownloadPdfButton({ href, label = "Download PDF" }: { href: string; label?: string }) {
  return (
    <Button asChild variant="outline" size="sm">
      <a href={href} target="_blank" rel="noreferrer">
        <Download className="h-4 w-4" /> {label}
      </a>
    </Button>
  );
}
