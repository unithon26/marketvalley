import Link from "next/link";

import { AuthControls } from "@/components/auth-controls";
import { BrandLogo } from "@/components/brand-logo";
import { CampaignEntryLink } from "@/components/campaign-entry-link";
import { hasBundledAuthMode } from "@/lib/auth/mode";

export function SiteHeader({ compact = false }: { compact?: boolean }) {
  const authEnabled = hasBundledAuthMode();

  return (
    <header className={compact ? "site-header site-header-compact" : "site-header"}>
      <div className="header-inner">
        <Link href="/" className="brand" aria-label="marketvalley 홈">
          <BrandLogo priority />
        </Link>
        {!compact ? (
          <nav className="header-nav" aria-label="주요 메뉴">
            <Link href="/">프로젝트</Link>
            <CampaignEntryLink>광고 만들기</CampaignEntryLink>
          </nav>
        ) : null}
        <div className="header-actions">
          <AuthControls enabled={authEnabled} />
        </div>
      </div>
    </header>
  );
}
