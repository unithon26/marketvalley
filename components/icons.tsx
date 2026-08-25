type IconProps = { size?: number; className?: string };

function Svg({ size = 20, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {children}
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return <Svg {...props}><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></Svg>;
}

export function ArrowRightIcon(props: IconProps) {
  return <Svg {...props}><path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}

export function ExternalIcon(props: IconProps) {
  return <Svg {...props}><path d="M14 5h5v5M19 5l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></Svg>;
}

export function DownloadIcon(props: IconProps) {
  return <Svg {...props}><path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}

export function CopyIcon(props: IconProps) {
  return <Svg {...props}><rect x="8" y="8" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.7" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke="currentColor" strokeWidth="1.7" /></Svg>;
}

export function CheckIcon(props: IconProps) {
  return <Svg {...props}><path d="m6 12 4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}

export function ChartIcon(props: IconProps) {
  return <Svg {...props}><path d="M5 19V9m7 10V5m7 14v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></Svg>;
}

export function CardFlowIcon(props: IconProps) {
  const size = props.size ?? 20;
  return (
    <svg className={props.className} width={size * 2.3} height={size} viewBox="0 0 62 24" fill="none" aria-hidden="true">
      <rect x="1" y="2" width="16" height="20" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 8h8M5 12h8M5 16h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M22 12h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="m28 8 4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="38" y="2" width="20" height="20" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="45" cy="9" r="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="m41 18 5-5 4 3 4-5 3 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M56 3v3M54.5 4.5h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
