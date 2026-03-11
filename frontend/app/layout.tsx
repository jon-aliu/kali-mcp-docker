import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KaliMCP — AI Security Assistant",
  description: "AI-powered Kali Linux assistant for penetration testing and security research",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased bg-background text-text">{children}</body>
    </html>
  );
}
