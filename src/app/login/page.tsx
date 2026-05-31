import Link from "next/link";
import { GoogleSignInButton } from "@/components/google-sign-in";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center px-6 text-center">
      <h1 className="text-4xl font-black" style={{ color: "var(--ink)" }}>
        APBioFocus
      </h1>
      <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
        Sign in with Google to sync your plan and progress across devices.
      </p>

      <div className="mt-6">
        <GoogleSignInButton />
      </div>

      <Link href="/" className="mt-6 text-sm underline" style={{ color: "var(--muted)" }}>
        Back to app
      </Link>
    </main>
  );
}
