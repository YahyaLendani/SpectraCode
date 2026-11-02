import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "RepoLens - AI-Powered Codebase Intelligence Platform",
  description:
    "Intelligent developer platform for codebase understanding with Tree-sitter AST parsing, hybrid RRF retrieval, and strictly grounded file & line citations.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#090d16] text-slate-100 antialiased selection:bg-indigo-500/30 selection:text-indigo-200">
        {children}
      </body>
    </html>
  );
}

