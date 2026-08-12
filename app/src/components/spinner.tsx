/// A small currentColor spinner. Sizes/colors via className (e.g. "h-5 w-5 text-wheat").
export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={
        "inline-block animate-spin rounded-full border-2 border-current border-t-transparent align-[-0.125em] " +
        className
      }
    />
  );
}
