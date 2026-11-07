import { useEffect, useState } from "react";
import { api, mediaUrl } from "../lib/api";
import { Link, useRouter } from "../lib/router";
import { useLanguage } from "../lib/language";
import type { BlogPost } from "../lib/types";
import { BlogRichText } from "../components/BlogRichText";

function formatWhen(iso?: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export function BlogPage() {
  const { t } = useLanguage();
  const { navigate } = useRouter();
  const [posts, setPosts] = useState<BlogPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<BlogPost[]>("/v1/blog")
      .then((rows) => {
        if (!cancelled) setPosts(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load notes");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page blog-page">
      <header className="blog-hero">
        <p className="eyebrow">{t("Field notes")}</p>
        <h1>{t("How people actually settle a trade")}</h1>
        <p className="muted blog-lead">
          {t("Short notes from the 2Pescrow desk: how a code invite works, what stays in the contract, and what we are changing next. No recycled product slogans.")}
        </p>
      </header>

      {error && <p className="error-banner">{error}</p>}
      {posts === null && !error && <p className="muted">{t("Loading notes…")}</p>}
      {posts && posts.length === 0 && (
        <div className="empty card-surface">
          <p>{t("No notes published yet. The admin desk can add the first one.")}</p>
        </div>
      )}
      <ul className="blog-list">
        {(posts || []).map((post) => (
          <li key={post.id}>
            <button type="button" className="blog-card" onClick={() => navigate(`/blog/${post.slug}`)}>
              {post.coverImageUrl ? <img className="blog-card-thumb" src={mediaUrl(post.coverImageUrl)} alt="" /> : null}
              <span className="blog-card-copy">
                <time dateTime={post.publishedAt || post.createdAt}>{formatWhen(post.publishedAt || post.createdAt)}</time>
                <h2>{post.title}</h2>
                <p>{post.excerpt}</p>
                <span className="blog-card-more">{t("Read note")}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="blog-back">
        <Link to="/">{t("Back to home")}</Link>
      </p>
    </div>
  );
}

export function BlogPostPage({ slug }: { slug: string }) {
  const { t } = useLanguage();
  const { navigate } = useRouter();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPost(null);
    setError(null);
    api<BlogPost>(`/v1/blog/${encodeURIComponent(slug)}`)
      .then((row) => {
        if (!cancelled) setPost(row);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Not found");
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (error) {
    return (
      <div className="page blog-page">
        <p className="error-banner">{error}</p>
        <button type="button" className="secondary" onClick={() => navigate("/blog")}>
          {t("All notes")}
        </button>
      </div>
    );
  }
  if (!post) return <p className="muted page">{t("Loading notes…")}</p>;

  return (
    <article className="page blog-page blog-article">
      <button type="button" className="secondary back-btn" onClick={() => navigate("/blog")}>
        {t("All notes")}
      </button>
      <p className="eyebrow">{formatWhen(post.publishedAt || post.createdAt)}</p>
      <h1>{post.title}</h1>
      <p className="blog-lead">{post.excerpt}</p>
      {post.coverImageUrl ? <img className="blog-cover" src={mediaUrl(post.coverImageUrl)} alt="" /> : null}
      <BlogRichText body={post.body || ""} />
    </article>
  );
}
