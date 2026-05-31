import Link from "next/link";
import { GoogleSignInButton } from "@/components/google-sign-in";

export default function LoginPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        fontFamily: "var(--font-body)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          margin: "0 auto",
          padding: "48px 32px",
          background: "var(--card)",
          borderRadius: 16,
          border: "1px solid var(--line)",
          textAlign: "center",
        }}
      >
        {/* Logo / brand */}
        <div
          style={{
            fontSize: 14,
            fontWeight: 800,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: "var(--accent)",
            marginBottom: 8,
          }}
        >
          🧬
        </div>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 900,
            color: "var(--ink)",
            margin: "0 0 8px",
            fontFamily: "var(--font-head)",
          }}
        >
          APBioFocus
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "var(--muted)",
            margin: "0 0 32px",
            lineHeight: 1.5,
          }}
        >
          Sign in to sync your study plan and progress across devices.
        </p>

        {/* Divider */}
        <div
          style={{
            width: "100%",
            height: 1,
            background: "var(--line)",
            margin: "0 0 32px",
          }}
        />

        {/* Google button */}
        <GoogleSignInButton />

        {/* Back link */}
        <Link
          href="/"
          style={{
            display: "inline-block",
            marginTop: 24,
            fontSize: 13,
            color: "var(--muted)",
            textDecoration: "none",
            transition: "color .2s",
          }}
        >
          ← Continue without signing in
        </Link>
      </div>
    </main>
  );
}
