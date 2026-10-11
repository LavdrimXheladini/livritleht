import { Fragment, type ReactNode } from 'react';

/**
 * Renders a translated string containing simple tags, e.g. "Can't find it? <link>Contact us</link>".
 * Server-safe alternative to react-i18next's <Trans>. Unknown tags render their text only.
 */
export function richText(text: string, tags: Record<string, (children: string) => ReactNode>): ReactNode {
  const parts = text.split(/(<(\w+)>(.*?)<\/\2>)/g);
  const out: ReactNode[] = [];
  for (let i = 0; i < parts.length; i += 4) {
    const plain = parts[i];
    if (plain) out.push(<Fragment key={`t${i}`}>{plain}</Fragment>);
    const tag = parts[i + 2];
    const inner = parts[i + 3];
    if (tag !== undefined && inner !== undefined) {
      const render = tags[tag];
      out.push(<Fragment key={`k${i}`}>{render ? render(inner) : inner}</Fragment>);
    }
  }
  return out;
}

/** "Line one\nline two" → line breaks (titles keep the designed line breaks per language). */
export function lines(text: string): ReactNode {
  return text.split('\n').map((line, i, all) => (
    <Fragment key={i}>
      {line}
      {i < all.length - 1 ? <br /> : null}
    </Fragment>
  ));
}
