"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarClock,
  CalendarDays,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Menu,
  MoreHorizontal,
  ReceiptIndianRupee,
  Settings,
  TriangleAlert,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { logoutAction } from "@/app/actions/auth";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/constants";

const ICONS = {
  LayoutDashboard,
  Users,
  Wallet,
  CalendarClock,
  TriangleAlert,
  CalendarDays,
  ReceiptIndianRupee,
  FileSpreadsheet,
  Settings,
} as const;

const GROUPS = [
  { label: "Overview", hrefs: ["/dashboard"] },
  { label: "Portfolio", hrefs: ["/customers", "/loans"] },
  { label: "Collections", hrefs: ["/collections/today", "/collections/overdue", "/collections/upcoming", "/payments"] },
  { label: "Insights", hrefs: ["/reports", "/settings"] },
];

function NavIcon({ icon }: { icon: string }) {
  const Icon = ICONS[icon as keyof typeof ICONS] ?? Wallet;
  return <Icon className="h-[18px] w-[18px]" />;
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/customers") return pathname === "/customers" || (pathname.startsWith("/customers/") && pathname !== "/customers/new");
  if (href === "/loans") return pathname === "/loans" || pathname.startsWith("/loans/");
  return pathname === href;
}

function SidebarLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
      {GROUPS.map((group) => {
        const items = NAV_ITEMS.filter((item) => group.hrefs.includes(item.href));
        if (!items.length) return null;
        return (
          <div key={group.label}>
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-muted">{group.label}</p>
            <div className="space-y-1">
              {items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-sidebar-active text-white shadow-sm"
                        : "text-sidebar-foreground/80 hover:bg-white/5 hover:text-white",
                    )}
                  >
                    <NavIcon icon={item.icon} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

export function AppNav({
  admin,
  businessName,
}: {
  admin: { name: string; email: string };
  businessName: string;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const pathname = usePathname();
  const dateLabel = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date());

  const initials = admin.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex h-16 items-center gap-3 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Wallet className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{businessName}</p>
            <p className="text-[11px] text-sidebar-muted">Loan &amp; collection management</p>
          </div>
        </div>
        <SidebarLinks />
        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white">
              {initials || "A"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">{admin.name}</p>
              <p className="truncate text-[11px] text-sidebar-muted">{admin.email}</p>
            </div>
            <form action={logoutAction}>
              <Button type="submit" variant="ghost" size="icon" className="text-sidebar-muted hover:bg-white/10 hover:text-white" aria-label="Sign out">
                <LogOut className="h-4 w-4" />
              </Button>
            </form>
          </div>
          <p className="px-2 pt-2 text-[10px] text-sidebar-muted">INR · Asia/Kolkata · Manual collections</p>
        </div>
      </aside>

      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur lg:pl-64">
        <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6 lg:h-16 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              className="lg:hidden"
              onClick={() => setMenuOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu className="h-4 w-4" />
            </Button>
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-sm font-semibold">{businessName}</p>
              <p className="text-xs text-muted-foreground">{dateLabel}</p>
            </div>
            <div className="flex items-center gap-2 sm:hidden">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Wallet className="h-4 w-4" />
              </div>
              <span className="truncate text-sm font-semibold">{businessName}</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Link href="/customers/new" className="hidden sm:inline-flex">
              <Button variant="outline" size="sm">
                <Users className="h-4 w-4" /> Add customer
              </Button>
            </Link>
            <Link href="/loans/new" className="hidden md:inline-flex">
              <Button size="sm">
                <Wallet className="h-4 w-4" /> New loan
              </Button>
            </Link>
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Administrator menu"
                >
                  {initials || "A"}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <span className="block truncate text-sm font-semibold text-foreground">{admin.name}</span>
                  <span className="block truncate text-[11px] font-normal">{admin.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <Settings className="h-4 w-4" /> Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/reports">
                    <FileSpreadsheet className="h-4 w-4" /> Reports & exports
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <form action={logoutAction}>
                  <DropdownMenuItem asChild>
                    <button type="submit" className="w-full text-left text-rose-600 dark:text-rose-400">
                      <LogOut className="h-4 w-4" /> Sign out
                    </button>
                  </DropdownMenuItem>
                </form>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent className="max-w-sm p-0 sm:max-w-sm">
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Wallet className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold">{businessName}</p>
                <p className="text-[11px] text-muted-foreground">Loan &amp; collection management</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setMenuOpen(false)} aria-label="Close navigation">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            <SidebarLinks onNavigate={() => setMenuOpen(false)} />
          </div>
          <form action={logoutAction} className="border-t border-border p-3">
            <Button type="submit" variant="outline" className="w-full justify-start">
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur lg:hidden">
        <div className="grid grid-cols-5">
          {[
            { href: "/dashboard", label: "Home", icon: LayoutDashboard },
            { href: "/customers", label: "Customers", icon: Users },
            { href: "/loans", label: "Loans", icon: Wallet },
            { href: "/collections/today", label: "Due", icon: CalendarClock },
          ].map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium text-muted-foreground"
          >
            <MoreHorizontal className="h-5 w-5" />
            More
          </button>
        </div>
      </nav>
    </>
  );
}
