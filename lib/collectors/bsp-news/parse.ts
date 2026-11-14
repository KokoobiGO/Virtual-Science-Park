/**
 * Blue Science Park news (A26): WordPress posts to news items. Posts from the
 * last 45 days, newest first, at most 30. Text stays in its language (Swedish).
 */
import type { CollectedOpportunity } from "../types";
import { clip, htmlToText, publishedDate, titleText, type WpPost } from "../tcl-events/wordpress";

export const NEWS_DAYS = 45;
export const MAX_NEWS = 30;

export function parseBspNews(data: WpPost[], now: Date): CollectedOpportunity[] {
  const since = now.getTime() - NEWS_DAYS * 86_400_000;
  return data
    .map((post) => ({ post, published: publishedDate(post) }))
    .filter(({ published }) => published.getTime() >= since)
    .sort((a, b) => b.published.getTime() - a.published.getTime())
    .slice(0, MAX_NEWS)
    .map(({ post, published }) => ({
      externalId: String(post.id),
      kind: "news" as const,
      title: titleText(post.title.rendered),
      url: post.link,
      publishedAt: published.toISOString(),
      description: clip(htmlToText(post.content.rendered)),
    }))
    .filter((item) => item.title);
}
