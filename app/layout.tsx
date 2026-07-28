import type { Metadata } from "next";
import { headers } from "next/headers";
import { METADATA_TITLE } from "../lib/branding";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const incomingHeaders = await headers();
  const host = incomingHeaders.get("x-forwarded-host") || incomingHeaders.get("host") || "localhost:3000";
  const protocol = incomingHeaders.get("x-forwarded-proto") || "http";
  const title = METADATA_TITLE;
  const description =
    "An offline-ready coding, computer-vision, and quadrotor learning studio for FTW Hopper drones.";

  return {
    metadataBase: new URL(`${protocol}://${host}`),
    title,
    description,
    icons: { icon: "/favicon.png", shortcut: "/favicon.png" },
    openGraph: { title, description, images: [{ url: "/og.png", width: 1731, height: 909 }] },
    twitter: { card: "summary_large_image", title, description, images: ["/og.png"] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
