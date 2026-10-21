import Link from "next/link";

interface Props {
  label: string;
  value: string;
  mono?: boolean;
  /** Turns the value into a link, for values that name another record. */
  link?: string;
}

/** One label and value line in a detail card. */
export default function DetailRow({ label, value, mono, link }: Props) {
  return (
    <div className="flex justify-between border-b border-prism-border pb-3 last:border-0 last:pb-0 gap-4">
      <span className="text-prism-muted text-sm shrink-0">{label}</span>
      {link ? (
        <Link
          href={link}
          className={`text-sm text-right break-all text-prism-accent hover:underline ${mono ? "font-mono" : ""}`}
        >
          {value}
        </Link>
      ) : (
        <span className={`text-sm text-right break-all ${mono ? "font-mono" : ""}`}>{value}</span>
      )}
    </div>
  );
}
