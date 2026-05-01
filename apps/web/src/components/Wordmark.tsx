export function Wordmark({ size = 24 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
        <defs>
          <radialGradient id="ap" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#3DD9D6" />
            <stop offset="100%" stopColor="#0B1220" />
          </radialGradient>
        </defs>
        <circle cx="16" cy="16" r="14" fill="none" stroke="#3DD9D6" strokeWidth="1.5" />
        <circle cx="16" cy="16" r="9" fill="url(#ap)" />
        <circle cx="16" cy="16" r="3" fill="#0B1220" stroke="#3DD9D6" strokeWidth="1" />
      </svg>
      <span className="scopium-wordmark text-chrome-50 lowercase">scopium</span>
    </span>
  );
}
