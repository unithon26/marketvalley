import Link from "next/link";

import { AuthControls } from "@/components/auth-controls";
import { hasCompleteSupabaseConfig } from "@/lib/supabase/config";

export function SiteHeader({ compact = false }: { compact?: boolean }) {
  const authEnabled = hasCompleteSupabaseConfig();

  return (
    <header className={compact ? "site-header site-header-compact" : "site-header"}>
      <div className="header-inner">
        <Link href="/" className="brand" aria-label="marketvalley 홈">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>marketvalley</span>
        </Link>
        <nav className="header-nav" aria-label="주요 메뉴">
          <Link href="/">프로젝트</Link>
          <Link href="/new">광고 만들기</Link>
          <Link href="/campaigns/demo">데모 리포트</Link>
        </nav>
        <div className="header-actions">
          <span className="demo-chip">DEMO</span>
          <AuthControls enabled={authEnabled} />
        </div>
      </div>
    </header>
  );
}
