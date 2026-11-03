import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: {
    default: "RepoLens — AI-Powered Codebase Intelligence Platform",
    template: "%s | RepoLens",
  },
  description:
    "Executive developer intelligence platform for deep codebase comprehension using Tree-sitter AST parsing, hybrid Reciprocal Rank Fusion (RRF) retrieval, and deterministically verified file & line citations.",
  keywords: [
    "Codebase Intelligence",
    "Tree-sitter AST",
    "Hybrid Search",
    "Reciprocal Rank Fusion",
    "Grounded Citations",
    "RAG for Code",
    "Developer Tools",
  ],
};

export const viewport: Viewport = {
  themeColor: "#060911",
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
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-[#060911] font-sans text-slate-100 antialiased selection:bg-indigo-500/30 selection:text-indigo-200">
        {children}
      </body>
    </html>
  );
}
