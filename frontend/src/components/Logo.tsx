export default function Logo({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="SmartPetition emblem">
      <rect width="64" height="64" rx="14" fill="#141923" />
      <path d="M20 16h24a4 4 0 0 1 4 4v24a4 4 0 0 1-4 4H20a4 4 0 0 1-4-4V20a4 4 0 0 1 4-4z" fill="#0066F5" />
      <path d="M24 26h16M24 32h16M24 38h10" stroke="#F4F8FE" strokeWidth="3" strokeLinecap="round" />
      <circle cx="44" cy="42" r="9" fill="#059669" />
      <path d="M40 42.5l3 3 5.5-6" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
