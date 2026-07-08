"use client";

import { RichText } from "@payloadcms/richtext-lexical/react";
import { SocialEmbed } from "./social-embed";

type LexicalRichText = any;

interface LexicalContentProps {
	content: LexicalRichText;
}

export function LexicalContent({ content }: LexicalContentProps) {
	if (!content) {
		return null;
	}

	return (
		<div className="lexical-content prose prose-invert prose-lg max-w-none dark:prose-invert">
			<RichText
				data={content}
				converters={({ defaultConverters }) => ({
					...defaultConverters,
					blocks: {
						...(defaultConverters as any).blocks,
						socialEmbed: ({ node }: { node: any }) => (
							<SocialEmbed key={node.id} url={node.fields?.url ?? ""} />
						),
						htmlSnippet: ({ node }: { node: any }) => (
							<div
								key={node.id}
								dangerouslySetInnerHTML={{ __html: node.fields?.html ?? "" }}
								className="my-4"
							/>
						),
					},
				})}
				className="[&_h1]:text-4xl [&_h1]:font-bold [&_h1]:mt-8 [&_h1]:mb-4 [&_h1]:text-foreground [&_h2]:text-3xl [&_h2]:font-bold [&_h2]:mt-8 [&_h2]:mb-4 [&_h2]:text-foreground [&_h3]:text-2xl [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-3 [&_h3]:text-foreground [&_p]:mb-4 [&_p]:leading-relaxed [&_p]:text-foreground [&_a]:text-[#FDDA24] [&_a]:hover:text-[#FFE55C] [&_a]:underline [&_ul]:list-disc [&_ul]:ml-6 [&_ul]:mb-4 [&_ul]:space-y-2 [&_ul]:text-foreground [&_ol]:list-decimal [&_ol]:ml-6 [&_ol]:mb-4 [&_ol]:space-y-2 [&_ol]:text-foreground [&_blockquote:not(.twitter-tweet):not(.instagram-media)]:border-l-4 [&_blockquote:not(.twitter-tweet):not(.instagram-media)]:border-[#FDDA24] [&_blockquote:not(.twitter-tweet):not(.instagram-media)]:pl-4 [&_blockquote:not(.twitter-tweet):not(.instagram-media)]:italic [&_blockquote:not(.twitter-tweet):not(.instagram-media)]:my-4 [&_blockquote:not(.twitter-tweet):not(.instagram-media)]:text-muted-foreground [&_code]:bg-card [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono [&_code]:text-[#FDDA24] [&_pre]:bg-card [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:my-4 [&_pre]:overflow-x-auto"
			/>
		</div>
	);
}
