import type { Metadata } from "next";
import "~~/styles/globals.css";

export const metadata: Metadata = {
  title: "NFT Studio",
  description: "Browser-based NFT art editor — layers, transforms, background removal, and more.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body>{children}</body>
    </html>
  );
}
