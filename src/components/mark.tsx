// Логотип: вентилятор в круге, чернильно-синий градиент.
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="markGrad" gradientUnits="userSpaceOnUse" x1="6" y1="6" x2="42" y2="42">
          <stop offset="0" stopColor="#93b4f5" /><stop offset=".55" stopColor="#3b64c4" /><stop offset="1" stopColor="#1e3a8a" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#markGrad)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="24" cy="24" r="19" /><circle cx="24" cy="24" r="2.6" />
        {[0, 120, 240].map((a) => <path key={a} d="M24 21.4C24 14.6 27.2 9.6 33.4 7.4" transform={`rotate(${a} 24 24)`} />)}
      </g>
    </svg>
  );
}
