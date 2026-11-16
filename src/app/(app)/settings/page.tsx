import type { Metadata } from "next";
import { DatabaseBackup, History, KeyRound, Settings2, UserRound } from "lucide-react";
import { requireAdmin } from "@/lib/auth-guard";
import { getRecentAuditLogs, getSettings } from "@/lib/services/settings";
import { formatDateTimeIndia } from "@/lib/dates";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BusinessSettingsForm, PasswordForm, ProfileForm } from "@/components/forms/settings-forms";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const admin = await requireAdmin();
  const settings = await getSettings();
  const logs = await getRecentAuditLogs(30);

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Business identity, administrator access, audit history and backup guidance for this single-admin installation."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-primary" /> Business & receipt identity
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              The business name appears on receipts, statements and Excel exports. Receipt header and footer are printed on PDFs.
            </p>
          </CardHeader>
          <CardContent>
            <BusinessSettingsForm
              businessName={settings.businessName}
              receiptHeader={settings.receiptHeader ?? ""}
              receiptFooter={settings.receiptFooter ?? ""}
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserRound className="h-4 w-4 text-primary" /> Administrator profile
              </CardTitle>
              <p className="text-xs text-muted-foreground">Contact identity for this installation. Email changes apply on next sign-in.</p>
            </CardHeader>
            <CardContent>
              <ProfileForm name={admin.name} email={admin.email} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-primary" /> Change password
              </CardTitle>
              <p className="text-xs text-muted-foreground">Passwords are hashed with Argon2id. Use a long, unique passphrase.</p>
            </CardHeader>
            <CardContent>
              <PasswordForm />
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DatabaseBackup className="h-4 w-4 text-primary" /> Backup guidance
            </CardTitle>
            <p className="text-xs text-muted-foreground">No automated backup is built in. Create and store encrypted backups regularly.</p>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              Keep backups off this machine and outside the project folder. Never commit <code>.env</code> or database dumps to git.
            </div>
            <div>
              <p className="font-medium text-foreground">PostgreSQL custom-format dump</p>
              <pre className="mt-1 overflow-x-auto rounded-lg bg-muted p-3 text-[11px]">
                {`pg_dump --format=custom --no-owner \\
  --file=thavanai-$(Get-Date -Format yyyyMMdd).dump \\
  "postgresql://postgres@127.0.0.1:5544/thavanai"`}
              </pre>
            </div>
            <div>
              <p className="font-medium text-foreground">Restore into an empty database</p>
              <pre className="mt-1 overflow-x-auto rounded-lg bg-muted p-3 text-[11px]">
                {`pg_restore --no-owner --clean --if-exists \\
  --dbname "postgresql://postgres@127.0.0.1:5544/thavanai" \\
  thavanai-YYYYMMDD.dump`}
              </pre>
            </div>
            <p className="text-muted-foreground">
              Test a restore on a separate database before relying on a backup. Application-level PDFs and Excel exports are generated
              from database records, so the database dump is the primary backup.
            </p>
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Current connection:</span>{" "}
              {settings.currency} · {settings.timezone} · PostgreSQL.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <History className="h-4 w-4 text-primary" /> Recent audit history
              </CardTitle>
              <p className="text-xs text-muted-foreground">Last 30 recorded actions. Audit entries are append-only.</p>
            </div>
            <Badge variant="outline">{logs.length} entries</Badge>
          </CardHeader>
          <CardContent>
            {logs.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No audit entries yet.</p>
            ) : (
              <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                {logs.map((log) => (
                  <div key={log.id} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        {log.action}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">{formatDateTimeIndia(log.createdAt)}</span>
                    </div>
                    <p className="mt-1.5 text-xs">{log.summary}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {log.actor?.name ?? "System"} · {log.entityType}
                      {log.ipAddress ? ` · ${log.ipAddress}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
