import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: {
    default: "RepoLens — Codebase Intelligence & AST Navigation",
    template: "%s | RepoLens",
  },
  description:
    "Developer platform for codebase navigation, Tree-sitter AST parsing, hybrid Reciprocal Rank Fusion (RRF) search, and deterministically verified file and line citations.",
  keywords: [
    "Codebase Search",
    "Tree-sitter AST",
    "Hybrid Retrieval",
    "Reciprocal Rank Fusion",
    "Source Citations",
    "Code Navigation",
    "Developer Tools",
  ],
};

export const viewport: Viewport = {
  themeColor: "#090b10",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-[#090b10] font-sans text-zinc-100 antialiased selection:bg-blue-500/25 selection:text-blue-200">
        {children}
      </body>
    </html>
  );
}
