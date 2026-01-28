"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check } from "lucide-react";
import { useState } from "react";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className={`prose prose-sm max-w-none dark:prose-invert text-sm ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // 代码块
          code: (props: any) => {
            const { inline, className: codeClassName, children, ...rest } = props;
            const match = (codeClassName || "").match(/language-(\w+)/);
            const language = match ? match[1] : "";
            const code = String(children).replace(/\n$/, "");

            if (inline) {
              return (
                <code
                  className="bg-gray-100 dark:bg-gray-800 rounded px-2 py-1 text-red-600 dark:text-red-400 font-mono text-sm"
                  {...rest}
                >
                  {children}
                </code>
              );
            }

            return (
              <div className="relative bg-gray-900 rounded-lg overflow-hidden mb-4">
                {language && (
                  <div className="absolute top-2 right-2 text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded">
                    {language}
                  </div>
                )}
                <button
                  onClick={() => copyToClipboard(code)}
                  className="absolute top-2 left-2 p-2 bg-gray-700 hover:bg-gray-600 rounded text-white transition-colors z-10"
                  title="Copy code"
                >
                  {copiedCode === code ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
                <pre className="overflow-x-auto pt-10 pb-4 px-4">
                  <code className={`text-sm text-gray-100 font-mono ${codeClassName}`}>
                    {children}
                  </code>
                </pre>
              </div>
            );
          },

          // 标题
          h1: ({ children }) => (
            <h1 className="text-2xl font-bold mt-6 mb-4 text-gray-900 dark:text-white">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl font-bold mt-5 mb-3 text-gray-900 dark:text-white">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-lg font-bold mt-4 mb-2 text-gray-900 dark:text-white">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-base font-bold mt-3 mb-2 text-gray-900 dark:text-white">
              {children}
            </h4>
          ),
          h5: ({ children }) => (
            <h5 className="font-bold text-sm mt-3 mb-2 text-gray-900 dark:text-white">
              {children}
            </h5>
          ),
          h6: ({ children }) => (
            <h6 className="font-bold text-xs mt-3 mb-2 text-gray-700 dark:text-gray-300">
              {children}
            </h6>
          ),

          // 段落
          p: ({ children }) => {
            // 检查子元素是否包含块级元素（如代码块）
            const hasBlockElement = React.Children.toArray(children).some(
              child =>
                React.isValidElement(child) &&
                (child.type === 'div' || child.type === 'pre')
            );

            if (hasBlockElement) {
              // 如果包含块级元素，直接返回子元素，不包装在<p>中
              return <>{children}</>;
            }

            return (
              <p className="text-sm leading-relaxed mb-3 text-gray-700 dark:text-gray-300">
                {children}
              </p>
            );
          },

          // 列表
          ul: ({ children }) => (
            <ul className="list-disc list-inside mb-4 space-y-2 text-sm text-gray-700 dark:text-gray-300">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside mb-4 space-y-2 text-sm text-gray-700 dark:text-gray-300">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="ml-2">{children}</li>,

          // 块引用
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-blue-500 pl-4 py-2 mb-4 italic text-gray-600 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20">
              {children}
            </blockquote>
          ),

          // 链接
          a: (props: any) => (
            <a
              href={props.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
            >
              {props.children}
            </a>
          ),

          // 图片
          img: (props: any) => (
            <img
              src={props.src}
              alt={props.alt}
              className="max-w-full h-auto rounded-lg my-4 border border-gray-200 dark:border-gray-700"
            />
          ),

          // 表格
          table: ({ children }) => (
            <table className="w-full border-collapse mb-4 text-sm">
              {children}
            </table>
          ),
          thead: ({ children }) => (
            <thead className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-gray-300 dark:divide-gray-600">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr className="border border-gray-300 dark:border-gray-600">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="px-4 py-2 text-left font-bold text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">
              {children}
            </td>
          ),

          // 水平线
          hr: () => (
            <hr className="my-6 border-0 border-t border-gray-300 dark:border-gray-600" />
          ),

          // 强调
          strong: ({ children }) => (
            <strong className="font-bold text-gray-900 dark:text-white">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-gray-700 dark:text-gray-300">
              {children}
            </em>
          ),
          del: ({ children }) => (
            <del className="line-through text-gray-500 dark:text-gray-500">
              {children}
            </del>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
