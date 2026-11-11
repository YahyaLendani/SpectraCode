import type { Metadata, Viewport } from "next";
import { Overpass, Overpass_Mono } from "next/font/google";
import "@/styles/globals.css";

const sans = Overpass({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = Overpass_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "SpectraCode — answers about code, with checked citations",
    template: "%s | SpectraCode",
  },
  description:
    "SpectraCode indexes a repository and answers questions about it. Each answer cites the exact file and lines it came from, and every citation is checked against the source.",
};

export const viewport: Viewport = {
  themeColor: "#FFD400",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-white font-sans text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
