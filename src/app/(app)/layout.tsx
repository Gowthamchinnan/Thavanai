import { requireAdmin } from "@/lib/auth-guard";
import { getSettings } from "@/lib/services/settings";
import { AppNav } from "@/components/layout/app-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const settings = await getSettings();

  return (
    <div className="min-h-screen">
      <AppNav admin={{ name: admin.name, email: admin.email }} businessName={settings.businessName} />
      <div className="lg:pl-64">
        <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-5 sm:px-6 sm:pt-6 lg:px-8 lg:pb-12">
          {children}
        </main>
      </div>
    </div>
  );
}
