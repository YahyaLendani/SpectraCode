"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Repository } from "@/lib/api";
import { cn } from "@/lib/utils";

interface NavbarProps {
  repositories?: Repository[];
  currentRepo?: Repository | null;
  onSelectRepo?: (repo: Repository) => void;
  onOpenSearch?: () => void;
}

/** The mark: an ink station with a yellow centre, standing in for a lens. */
export const BrandMark: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 28 28"
    className={cn("h-7 w-7 shrink-0", className)}
  >
    <circle cx="14" cy="14" r="14" fill="#15171A" />
    <circle cx="14" cy="14" r="6" fill="#FFD400" />
  </svg>
);

export const Navbar: React.FC<NavbarProps> = ({
  repositories = [],
  currentRepo,
  onSelectRepo,
  onOpenSearch,
}) => {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!onOpenSearch) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenSearch();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onOpenSearch]);

  const links = [
    { href: "/", label: "Workspaces", active: pathname === "/" },
    {
      href: "/evaluation",
      label: "Benchmarks",
      active: !!pathname?.startsWith("/evaluation"),
    },
  ];

  return (
    <header className="sticky top-0 z-40 bg-signal text-ink">
      <div className="mx-auto flex h-14 max-w-[84rem] items-stretch gap-3 px-4 sm:gap-6 sm:px-8">
        <Link
          href="/"
          aria-label="SpectraCode home"
          className="flex items-center gap-2.5 text-xl font-extrabold tracking-[-0.01em]"
        >
          <BrandMark />
          <span className="hidden translate-y-px sm:inline">SpectraCode</span>
        </Link>

        <nav aria-label="Main" className="flex items-stretch">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={link.active ? "page" : undefined}
              className={cn(
                "flex items-center border-y-4 border-transparent px-2.5 text-[0.9375rem] font-bold transition-colors duration-150 sm:px-3.5",
                link.active ? "border-b-ink" : "hover:border-b-ink/30"
              )}
            >
              <span className="translate-y-px">{link.label}</span>
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          {repositories.length > 0 && (
            <select
              value={currentRepo?.id || ""}
              onChange={(e) => {
                const r = repositories.find((x) => x.id === e.target.value);
                if (!r) return;
                if (onSelectRepo) onSelectRepo(r);
                else router.push(`/repos/${r.id}`);
              }}
              aria-label="Open a workspace"
              className="hidden h-9 max-w-[15rem] cursor-pointer rounded border-2 border-ink bg-white px-2 text-sm font-semibold text-ink md:block"
            >
              {!currentRepo && (
                <option value="" disabled>
                  Open a workspace
                </option>
              )}
              {repositories.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.github_owner}/{r.github_name}
                  {r.status === "ready" ? "" : " (indexing)"}
                </option>
              ))}
            </select>
          )}

          {onOpenSearch && (
            <button
              type="button"
              onClick={onOpenSearch}
              aria-label="Search code"
              className="flex h-9 cursor-pointer items-center gap-2 rounded border-2 border-ink bg-white px-2.5 text-sm font-semibold text-ink transition-colors duration-150 hover:bg-wash"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Search code</span>
              <kbd className="kbd hidden sm:inline-flex">Ctrl K</kbd>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
