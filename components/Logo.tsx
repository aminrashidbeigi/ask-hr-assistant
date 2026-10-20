/** Small bolt-in-a-rounded-square mark; inherits the accent colour. */
export function Logo({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <path
        d="M18.2 5.5 9.5 17.6c-.4.5 0 1.2.6 1.2h4.6l-1.4 7.1c-.1.6.7.9 1.1.4l8.6-12.1c.4-.5 0-1.2-.6-1.2h-4.5l1.4-7c.1-.6-.7-.9-1.1-.5Z"
        className="fill-primary-foreground"
      />
    </svg>
  );
}
