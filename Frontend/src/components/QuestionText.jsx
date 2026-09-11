import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

/**
 * QuestionText - Renders question text with markdown support.
 * 
 * Handles:
 * - Fenced code blocks (```js ... ```) with syntax highlighting
 * - Inline code (`code`) with styled mono text
 * - Bold, italic, lists, and other markdown via remark-gfm
 * - Plain text (no markdown) renders cleanly with whitespace preserved
 * 
 * @param {string} text - The question text (plain or markdown-formatted)
 * @param {string} className - Optional additional CSS classes for the wrapper
 */
const QuestionText = ({ text, className = '' }) => {
  if (!text) return null;

  return (
    <div className={`question-text-renderer ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Fenced code blocks: ```js ... ```
          // In react-markdown v9+/v10, fenced code blocks are rendered as <pre><code>...</code></pre>
          // We handle the block rendering in `pre` and inline code in `code`.
          pre({ node, children, ...props }) {
            // Extract the <code> child element to get language and content
            const codeChild = node?.children?.[0];
            const codeClassName = codeChild?.properties?.className?.[0] || '';
            const match = /language-(\w+)/.exec(codeClassName);
            const language = match ? match[1] : 'javascript';

            // Extract raw text content from the code child
            const codeText = codeChild?.children
              ?.map((c) => c.value || '')
              .join('') || '';

            return (
              <div className="my-3 rounded-xl overflow-hidden border border-slate-600/30">
                <div className="flex items-center justify-between px-4 py-2 bg-slate-800/80 border-b border-slate-600/30">
                  <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                    {language}
                  </span>
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/60"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/60"></div>
                  </div>
                </div>
                <SyntaxHighlighter
                  style={vscDarkPlus}
                  language={language}
                  PreTag="div"
                  customStyle={{
                    margin: 0,
                    padding: '1rem 1.25rem',
                    background: 'rgba(15, 23, 42, 0.7)',
                    fontSize: '0.875rem',
                    lineHeight: '1.6',
                    borderRadius: 0,
                  }}
                  codeTagProps={{
                    style: {
                      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                    }
                  }}
                >
                  {codeText.replace(/\n$/, '')}
                </SyntaxHighlighter>
              </div>
            );
          },

          // Inline code: `code` (single backticks)
          // In react-markdown v10, this only fires for inline code since
          // fenced blocks are handled by the `pre` component above.
          code({ node, children, ...props }) {
            return (
              <code
                className="px-1.5 py-0.5 mx-0.5 rounded-md bg-slate-700/60 text-emerald-300 text-[0.9em] font-mono border border-slate-600/30"
                {...props}
              >
                {children}
              </code>
            );
          },

          // Paragraphs
          p({ children }) {
            return (
              <p className="mb-2 last:mb-0 leading-relaxed">
                {children}
              </p>
            );
          },

          // Strong/bold
          strong({ children }) {
            return <strong className="font-bold text-white">{children}</strong>;
          },

          // Emphasis/italic  
          em({ children }) {
            return <em className="italic text-slate-200">{children}</em>;
          },

          // Unordered list
          ul({ children }) {
            return <ul className="list-disc list-inside ml-2 mb-2 space-y-1">{children}</ul>;
          },

          // Ordered list
          ol({ children }) {
            return <ol className="list-decimal list-inside ml-2 mb-2 space-y-1">{children}</ol>;
          },

          // List item
          li({ children }) {
            return <li className="text-slate-200">{children}</li>;
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
};

export default QuestionText;
