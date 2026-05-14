import { Fragment } from "react";

type Props = {
  text: string;
  query: string;
};

// Renders `text` with every case-insensitive occurrence of `query` wrapped in
// a <mark> for search highlighting. Falls back to plain text when query is empty.
export default function HighlightText({ text, query }: Props): JSX.Element {
  const trimmed = query.trim();
  if (!trimmed) {
    return <>{text}</>;
  }

  const haystack = text.toLowerCase();
  const needle = trimmed.toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let matchIndex = haystack.indexOf(needle);
  let key = 0;

  while (matchIndex !== -1) {
    if (matchIndex > cursor) {
      parts.push(<Fragment key={key++}>{text.slice(cursor, matchIndex)}</Fragment>);
    }
    parts.push(
      <mark key={key++} className="search-highlight">
        {text.slice(matchIndex, matchIndex + trimmed.length)}
      </mark>
    );
    cursor = matchIndex + trimmed.length;
    matchIndex = haystack.indexOf(needle, cursor);
  }

  if (cursor < text.length) {
    parts.push(<Fragment key={key++}>{text.slice(cursor)}</Fragment>);
  }

  return <>{parts}</>;
}
