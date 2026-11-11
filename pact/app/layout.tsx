import type { Metadata } from "next";
import "./globals.css";
import { CyberneticBackdrop } from "@/components/layout/CyberneticBackdrop";

export const metadata: Metadata = {
  title: "PACT — Transaction Assurance for Custom Commerce",
  description:
    "AI-powered transaction assurance platform helping buyers and sellers create structured agreements, anticipate complications, approve terms, and coordinate milestone payments.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full flex flex-col font-sans bg-zinc-950 text-zinc-100 overflow-x-hidden selection:bg-emerald-500/30 selection:text-emerald-100">
        <CyberneticBackdrop />
        <div className="relative z-10 min-h-full flex flex-col flex-1">
          {children}
        </div>
      </body>
    </html>
  );
}
