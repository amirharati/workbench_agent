import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function ItemPeekMarkdown({ markdown }: { markdown: string }) {
  return (
    <div className="ui-item-peek__markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ children, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer">{children}</a>
          ),
          img: ({ alt, ...props }) => (
            <img {...props} alt={alt ?? ''} loading="lazy" referrerPolicy="no-referrer" />
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
