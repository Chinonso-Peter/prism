interface Props { children: React.ReactNode }

/** What a list or a section shows when it has nothing to display. */
export default function EmptyState({ children }: Props) {
  return <p className="text-prism-muted text-sm">{children}</p>;
}
