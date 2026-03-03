import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "OKR Follow-Up (Dummy Data)",
  description: "Internal OKR follow-up MVP running on local in-memory data."
};

export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="topbar">
            <Link href="/" className="brand">
              OKR Follow-Up
            </Link>
          </header>
          <main className="layout">{children}</main>
        </div>
      </body>
    </html>
  );
}
