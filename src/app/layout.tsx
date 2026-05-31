import type { Metadata } from "next";
import { Bricolage_Grotesque, Permanent_Marker } from "next/font/google";
import "./globals.css";

const bricolageGrotesque = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
  variable: "--font-bricolage"
});

const permanentMarker = Permanent_Marker({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-marker"
});

export const metadata: Metadata = {
  title: "APBioFocus",
  description: "AP Biology focus planner with pomodoro timer and chapter tracking",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${bricolageGrotesque.variable} ${permanentMarker.variable}`}>{children}</body>
    </html>
  );
}
