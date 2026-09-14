import type { ReactNode } from "react";

/** Chrome for public, SEO-indexed marketing pages. */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <div data-surface="marketing">{children}</div>;
}
