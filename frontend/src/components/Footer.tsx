export default function Footer() {
  return (
    <footer className="border-t border-prism-border px-4 py-6 text-center text-prism-muted text-xs mt-16">
      <p>
        Prism is open-source software built for the Stellar community.{" "}
        <a
          href="https://github.com/prism-explorer/prism"
          className="underline hover:text-prism-strong transition"
          target="_blank"
          rel="noopener noreferrer"
        >
          View on GitHub
        </a>
      </p>
    </footer>
  );
}
