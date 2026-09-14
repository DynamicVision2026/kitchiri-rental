import type { ReactNode } from "react";

/** Chrome for the authenticated multi-step audit flows. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <div data-surface="app">{children}</div>;
}
