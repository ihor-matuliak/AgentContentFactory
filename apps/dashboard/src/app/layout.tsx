import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { Sidebar } from "@/components/Sidebar";
import { AuthGate } from "@/components/AuthGate";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Agent Content Factory — Командний центр",
  description: "Командний центр рою ШІ-агентів, що веде соціальні мережі.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uk">
      <body
        className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrains.variable}`}
      >
        <AuthGate>
          <div className="relative z-[1] flex min-h-dvh">
            <Sidebar />
            <main className="min-w-0 flex-1">{children}</main>
          </div>
        </AuthGate>
      </body>
    </html>
  );
}
