import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { DryRunProvider } from "@/components/dry-run-provider";
import { Navbar } from "@/components/navbar";
import { Toaster } from "@/components/ui/sonner";
import { GlobalProgress } from "@/components/global-progress";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MediaCentral Dashboard",
  description: "Secure, robust, full-stack local web application that acts as a centralized master dashboard for media auditing, maintenance, and Plex user management.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen bg-background font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <DryRunProvider>
            <div className="relative flex min-h-screen flex-col">
              <Navbar />
              <main className="flex-1 container mx-auto px-4 py-8 max-w-screen-2xl">
                {children}
              </main>
            </div>
            <GlobalProgress />
            <Toaster />
          </DryRunProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
