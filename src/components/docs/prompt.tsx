/**
 * A thing you literally type at Cursor.
 *
 * Deliberately not a card: the page already has code blocks and callout
 * panels, and making these boxes too turned the whole guide into one grey
 * texture. A left rule plus italics is enough to read as speech.
 */
export function Prompt({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-l-2 border-[color:var(--brand-orange)]/50 py-1 pl-4 text-[15px] italic leading-relaxed text-foreground/90">
      &ldquo;{children}&rdquo;
    </p>
  )
}
