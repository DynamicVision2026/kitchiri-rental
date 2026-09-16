import Link from "next/link";
import s from "../_screens/screens.module.css";

/**
 * Marks a field this page could not respect fill in honestly — a real business
 * address, phone number, representative name, and so on were never supplied to the
 * session that wrote this page, and fabricating them for a legal disclosure (特定商
 * 取引法に基づく表記) would be actively misleading rather than merely incomplete.
 * Every instance must be replaced with the real value before this page is used to
 * actually sell anything — see LegalPageNotice below, shown once at the top of each
 * page that contains one.
 */
export function NeedsInput({ children }: { children: string }) {
  return (
    <span style={{ border: "1px solid var(--accent)", color: "var(--accent)", padding: "0 .35rem", fontWeight: 700 }}>
      【{children}】
    </span>
  );
}

export function LegalNav({ current }: { current: "tokushoho" | "terms" | "privacy" }) {
  const items: { key: typeof current; href: string; label: string }[] = [
    { key: "tokushoho", href: "/taikyo/legal/tokushoho", label: "特定商取引法に基づく表記" },
    { key: "terms", href: "/taikyo/legal/terms", label: "利用規約" },
    { key: "privacy", href: "/taikyo/legal/privacy", label: "プライバシーポリシー" },
  ];
  return (
    <nav aria-label="法的情報">
      <ul className={s.linkList} style={{ marginBottom: "2rem" }}>
        {items.map((it) => (
          <li key={it.key}>
            {it.key === current ? <strong>{it.label}</strong> : <Link href={it.href}>{it.label}</Link>}
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function LegalPageNotice() {
  return (
    <div className={s.deadEnd} style={{ marginBottom: "2rem" }}>
      <p className={s.h3}>公開前の確認事項</p>
      <p className={s.muted} style={{ margin: 0 }}>
        このページ内の<NeedsInput>括弧つきの項目</NeedsInput>は、実際の事業者情報が未入力のプレースホルダーです。
        特定商取引法に基づく表記に虚偽・不正確な記載があってはならないため、実際の情報に差し替えるまでは、
        このページを一般に公開しないでください。
      </p>
    </div>
  );
}
