"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownContentProps {
	content: string;
}

export function MarkdownContent({ content }: MarkdownContentProps) {
	return (
		<div className="prose prose-invert prose-lg max-w-none dark:prose-invert">
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				components={{
					h1: ({ node, ...props }) => (
						<h1
							className="text-4xl font-bold mt-8 mb-4 text-foreground"
							{...props}
						/>
					),
					h2: ({ node, ...props }) => (
						<h2
							className="text-3xl font-bold mt-8 mb-4 text-foreground"
							{...props}
						/>
					),
					h3: ({ node, ...props }) => (
						<h3
							className="text-2xl font-semibold mt-6 mb-3 text-foreground"
							{...props}
						/>
					),
					h4: ({ node, ...props }) => (
						<h4
							className="text-xl font-semibold mt-4 mb-2 text-foreground"
							{...props}
						/>
					),
					p: ({ node, ...props }) => (
						<p className="mb-4 leading-relaxed text-foreground" {...props} />
					),
					a: ({ node, ...props }) => (
						<a
							className="text-[#FDDA24] hover:text-[#FFE55C] underline transition-colors"
							target="_blank"
							rel="noopener noreferrer"
							{...props}
						/>
					),
					ul: ({ node, ...props }) => (
						<ul
							className="list-disc ml-6 mb-4 space-y-2 text-foreground"
							{...props}
						/>
					),
					ol: ({ node, ...props }) => (
						<ol
							className="list-decimal ml-6 mb-4 space-y-2 text-foreground"
							{...props}
						/>
					),
					li: ({ node, ...props }) => (
						<li className="leading-relaxed" {...props} />
					),
					blockquote: ({ node, ...props }) => (
						<blockquote
							className="border-l-4 border-[#FDDA24] pl-4 italic my-4 text-muted-foreground"
							{...props}
						/>
					),
					code: ({ node, inline, ...props }: any) =>
						inline ? (
							<code
								className="bg-card px-1.5 py-0.5 rounded text-sm font-mono text-[#FDDA24]"
								{...props}
							/>
						) : (
							<code
								className="block bg-card p-4 rounded-lg my-4 overflow-x-auto text-sm font-mono text-foreground"
								{...props}
							/>
						),
					pre: ({ node, ...props }) => (
						<pre
							className="bg-card p-4 rounded-lg my-4 overflow-x-auto"
							{...props}
						/>
					),
					hr: ({ node, ...props }) => (
						<hr className="my-8 border-border" {...props} />
					),
					img: ({ node, ...props }) => (
						<img
							className="rounded-lg my-6 max-w-full h-auto"
							alt=""
							{...props}
						/>
					),
					table: ({ node, ...props }) => (
						<div className="overflow-x-auto my-6">
							<table
								className="min-w-full border-collapse border border-border"
								{...props}
							/>
						</div>
					),
					thead: ({ node, ...props }) => (
						<thead className="bg-card" {...props} />
					),
					tbody: ({ node, ...props }) => <tbody {...props} />,
					tr: ({ node, ...props }) => (
						<tr className="border-b border-border" {...props} />
					),
					th: ({ node, ...props }) => (
						<th
							className="border border-border px-4 py-2 text-left font-semibold text-foreground"
							{...props}
						/>
					),
					td: ({ node, ...props }) => (
						<td
							className="border border-border px-4 py-2 text-foreground"
							{...props}
						/>
					),
				}}
			>
				{content}
			</ReactMarkdown>
		</div>
	);
}
