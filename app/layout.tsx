import type { Metadata } from "next";
import AppShell from "@/app/app-shell";
import AuthProviders from "@/app/auth-providers";
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
        <AuthProviders>
          <AppShell>{children}</AppShell>
        </AuthProviders>
      </body>
    </html>
  );
}
