interface Props { children: React.ReactNode }

/** What a list or a section shows when its data couldn't be loaded. */
export default function ErrorState({ children }: Props) {
  return <p className="text-prism-red text-sm">{children}</p>;
}
