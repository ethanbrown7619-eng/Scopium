import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scopium",
  description: "See the whole picture. Ontology-driven data integration for Aotearoa.",
  icons: { icon: "/logo.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-navy text-chrome-100">{children}</body>
    </html>
  );
}
