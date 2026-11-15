import { login } from "@/app/actions";
import { inputClass } from "@/components/ui";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const configured = !!process.env.ADMIN_PASSWORD && !!process.env.SESSION_SECRET;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form action={login} className="w-full max-w-sm rounded-xl bg-white p-6 ring-1 ring-stone-200">
        <h1 className="text-lg font-semibold tracking-tight">CEO Dashboard</h1>
        <p className="mt-1 mb-5 text-sm text-stone-500">Enter your password to continue.</p>
        {!configured ? (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Sign-in isn&apos;t set up yet. Set ADMIN_PASSWORD and SESSION_SECRET in the environment, then redeploy.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-stone-600">Password</span>
          <input name="password" type="password" required autoFocus autoComplete="current-password" className={inputClass} />
        </label>
        <button type="submit" className="mt-4 w-full rounded-lg bg-stone-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-stone-700">
          Sign in
        </button>
      </form>
    </main>
  );
}
