import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "APBioFocus",
  description: "AP Biology focus planner with pomodoro timer and chapter tracking",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
