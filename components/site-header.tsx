import Link from "next/link";

import { AuthControls } from "@/components/auth-controls";
import { BrandLogo } from "@/components/brand-logo";
import { CampaignEntryLink } from "@/components/campaign-entry-link";
import { hasCompleteBundledSupabaseConfig } from "@/lib/supabase/config";

export function SiteHeader({ compact = false }: { compact?: boolean }) {
  const authEnabled = hasCompleteBundledSupabaseConfig();

  return (
    <header className={compact ? "site-header site-header-compact" : "site-header"}>
      <div className="header-inner">
        <Link href="/" className="brand" aria-label="marketvalley 홈">
          <BrandLogo priority />
        </Link>
        <nav className="header-nav" aria-label="주요 메뉴">
          <Link href="/">프로젝트</Link>
          <CampaignEntryLink>광고 만들기</CampaignEntryLink>
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
