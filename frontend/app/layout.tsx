import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KaliMCP — AI Security Assistant",
  description: "AI-powered Kali Linux assistant for penetration testing and security research",
  viewport: "width=device-width, initial-scale=1",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-background text-text font-sans">{children}</body>
    </html>
  );
}
