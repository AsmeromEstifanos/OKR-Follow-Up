import type { Metadata } from "next";
import AppShell from "@/app/app-shell";
import AuthProviders from "@/app/auth-providers";
import { withBasePath } from "@/lib/base-path";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "OKR Follow-Up",
  description: "Internal OKR follow-up",
  icons: {
    icon: withBasePath("/sol-ventures.png"),
  },
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
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
