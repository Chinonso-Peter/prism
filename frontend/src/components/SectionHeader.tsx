interface Props {
  title: string;
  count: number;
  /** Page size the list is fetched with. A count that reaches it means the list is capped. */
  cap?: number;
  live?: boolean;
}

/** Section heading with its item count, noting when the list is capped at its page size. */
export default function SectionHeader({ title, count, cap, live = false }: Props) {
  const capped = cap !== undefined && count >= cap;
  return (
    <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
      {title}
      <span className="text-sm font-normal text-prism-muted">
        ({capped ? `${count} shown, capped` : count})
      </span>
      {live && (
        <span className="flex items-center gap-1.5 text-xs font-normal text-prism-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-prism-green animate-pulse" />
          auto-updating
        </span>
      )}
    </h2>
  );
}
