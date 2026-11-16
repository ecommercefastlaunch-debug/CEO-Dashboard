import { login } from "@/app/actions";
import { Mark } from "@/components/mark";
import { Alert, Button, inputClass } from "@/components/ui";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const configured = !!process.env.ADMIN_PASSWORD && !!process.env.SESSION_SECRET;
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Mark className="mb-3 h-10 w-10" />
          <div className="text-lg font-bold tracking-tight text-text">CEO Dashboard</div>
          <div className="text-xs text-text-muted">Brands, Orders &amp; Money</div>
        </div>
        <form action={login} className="rounded-xl border border-border bg-surface p-6 shadow-card">
          <h1 className="text-base font-semibold text-text">Sign in</h1>
          <p className="mt-1 mb-5 text-[13px] text-text-muted">Enter your password to continue.</p>
          {!configured ? (
            <Alert tone="warning" className="mb-4">Sign-in isn&apos;t set up yet. Set ADMIN_PASSWORD and SESSION_SECRET in the environment, then redeploy.</Alert>
          ) : null}
          {error ? <Alert tone="critical" className="mb-4">{error}</Alert> : null}
          <label className="block space-y-1.5">
            <span className="block text-xs font-medium text-text-muted">Password</span>
            <input name="password" type="password" required autoFocus autoComplete="current-password" className={inputClass} />
          </label>
          <Button className="mt-4 w-full">Sign in</Button>
        </form>
      </div>
    </main>
  );
}
