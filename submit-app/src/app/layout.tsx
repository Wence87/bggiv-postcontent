import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { startCleanupScheduler } from "@/lib/cleanupScheduler";

export const metadata: Metadata = {
  title: "BoardGameGiveaways Availability",
  description: "Scheduling availability app for BoardGameGiveaways",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  startCleanupScheduler();

  return (
    <html lang="en">
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
