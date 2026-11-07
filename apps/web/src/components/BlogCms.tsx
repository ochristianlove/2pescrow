import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { api, apiBase, apiUpload, mediaUrl } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { BlogPost } from "../lib/types";
import { BlogEditor } from "./BlogEditor";
import { editorIsEmpty, toEditorHtml } from "./blogBody";

const EXCERPT_MAX = 800;
const empty = { title: "", excerpt: "", body: "", coverImageUrl: "", published: false };

function when(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function BlogCms() {
  const { authHeaders } = useAuth();
  const formRef = useRef<HTMLFormElement>(null);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const coverRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setPosts(await api<BlogPost[]>("/v1/admin/blog", { headers: authHeaders() }));
  }, [authHeaders]);

  useEffect(() => {
    load().catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [load]);

  function openEditor(post?: BlogPost) {
    setErr(null);
    setMsg(null);
    if (post) {
      setEditing(post.id);
      setForm({
        title: post.title,
        excerpt: post.excerpt,
        body: toEditorHtml(post.body || ""),
        coverImageUrl: post.coverImageUrl || "",
        published: !!post.published,
      });
    } else {
      setEditing(null);
      setForm(empty);
    }
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    if (form.excerpt.trim().length > EXCERPT_MAX) {
      setErr(`The snippet can be at most ${EXCERPT_MAX} characters.`);
      return;
    }
    if (editorIsEmpty(form.body)) {
      setErr("Write the post, or add an image, before saving.");
      return;
    }
    try {
      if (editing) {
        await api(`/v1/admin/blog/${editing}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify(form),
        });
        setMsg(form.published ? "Post updated and published." : "Post saved as a draft.");
      } else {
        await api("/v1/admin/blog", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify(form),
        });
        setMsg(form.published ? "Post published on the blog." : "Draft saved. Publish it from the list when you are ready.");
      }
      setForm(empty);
      setEditing(null);
      await load();
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
    }
  }

  async function setPublished(post: BlogPost, published: boolean) {
    setErr(null);
    setMsg(null);
    try {
      await api(`/v1/admin/blog/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ published }),
      });
      setMsg(published ? `"${post.title}" is on the blog.` : `"${post.title}" is now a draft.`);
      await load();
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
    }
  }

  async function uploadImage(file: File) {
    if (!file.type.startsWith("image/")) throw new Error("Choose a JPEG, PNG, GIF, or WebP image.");
    const data = new FormData();
    data.append("file", file);
    try {
      const saved = await apiUpload<{ url: string }>("/v1/admin/blog/media", data, authHeaders());
      return `${apiBase()}${saved.url}`;
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      let message = raw || "The image did not upload.";
      try {
        const parsed = JSON.parse(raw) as { error?: string };
        if (parsed.error) message = parsed.error;
      } catch {
        /* the API answered with plain text */
      }
      throw new Error(message);
    }
  }

  async function setCover(file: File) {
    setErr(null);
    setUploading(true);
    try {
      const url = await uploadImage(file);
      setForm((current) => ({ ...current, coverImageUrl: url }));
    } catch (error) {
      setErr(error instanceof Error ? error.message : "The image did not upload.");
    } finally {
      setUploading(false);
    }
  }

  async function remove(post: BlogPost) {
    if (!window.confirm(`Delete “${post.title}”? It will leave the blog.`)) return;
    try {
      await api(`/v1/admin/blog/${post.id}`, { method: "DELETE", headers: authHeaders() });
      if (editing === post.id) {
        setEditing(null);
        setForm(empty);
      }
      setMsg("Post deleted.");
      await load();
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
    }
  }

  const excerptOver = form.excerpt.trim().length > EXCERPT_MAX;

  return (
    <section className="card-surface">
      <h2>Blog posts</h2>
      <p className="muted">
        These are the posts on the blog. Published ones also show as snippets on the home page. Edit, unpublish, or delete them from this list.
      </p>
      {msg && <p className="ok-banner">{msg}</p>}
      {err && <p className="error-banner">{err}</p>}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Post</th>
              <th>Status</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {posts.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">No posts yet.</td>
              </tr>
            )}
            {posts.map((post) => (
              <tr key={post.id}>
                <td>
                  <div className="desk-row-title">
                    {post.coverImageUrl ? <img src={mediaUrl(post.coverImageUrl)} alt="" /> : <span className="desk-row-blank" />}
                    <span>
                      <strong>{post.title}</strong>
                      <span className="muted">/blog/{post.slug}</span>
                    </span>
                  </div>
                </td>
                <td>{post.published ? "Published" : "Draft"}</td>
                <td>{when(post.updatedAt || post.publishedAt || post.createdAt)}</td>
                <td>
                  <div className="blog-cms-actions">
                    <button type="button" className="secondary" onClick={() => openEditor(post)}>Edit</button>
                    <button type="button" className="secondary" onClick={() => setPublished(post, !post.published)}>
                      {post.published ? "Unpublish" : "Publish"}
                    </button>
                    <button type="button" className="secondary" onClick={() => remove(post)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form className="desk" ref={formRef} onSubmit={submit}>
        <div className="desk-main">
          <h3>{editing ? "Edit post" : "New post"}</h3>
          <label>
            Title
            <input className="desk-title" required minLength={3} maxLength={160} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Post title" />
          </label>
          <label>
            Snippet
            <textarea
              required
              minLength={10}
              rows={2}
              value={form.excerpt}
              onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
              placeholder="The short text on the blog list and the home page."
            />
            <span className={excerptOver ? "blog-cms-count over" : "blog-cms-count"}>
              {form.excerpt.trim().length} / {EXCERPT_MAX}
            </span>
          </label>
          <BlogEditor
            key={editing ?? "new"}
            html={form.body}
            busy={uploading}
            onChange={(body) => setForm((current) => ({ ...current, body }))}
            onUpload={async (file) => {
              setUploading(true);
              try {
                return await uploadImage(file);
              } finally {
                setUploading(false);
              }
            }}
          />
        </div>
        <aside className="desk-side">
          <div className="desk-panel">
            <p className="desk-panel-label">Publish</p>
            <div className="desk-switch-row">
              <button
                type="button"
                className={form.published ? "switch on" : "switch"}
                aria-pressed={form.published}
                aria-label={form.published ? "Save as draft instead" : "Publish this post"}
                onClick={() => setForm({ ...form, published: !form.published })}
              >
                <i />
              </button>
              <span>{form.published ? "Will publish" : "Save as draft"}</span>
            </div>
            <button type="submit">{editing ? "Save post" : form.published ? "Publish" : "Save draft"}</button>
            {editing && (
              <button type="button" className="secondary" onClick={() => openEditor()}>
                Cancel
              </button>
            )}
          </div>
          <div className="desk-panel">
            <p className="desk-panel-label">Featured image</p>
            <button
              type="button"
              className="desk-drop"
              onClick={() => coverRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) void setCover(file);
              }}
            >
              {form.coverImageUrl ? <img src={mediaUrl(form.coverImageUrl)} alt="" /> : <span>{uploading ? "Uploading…" : "Choose an image"}</span>}
            </button>
            {form.coverImageUrl && (
              <button type="button" className="secondary" onClick={() => setForm({ ...form, coverImageUrl: "" })}>
                Remove image
              </button>
            )}
            <input
              ref={coverRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void setCover(file);
              }}
            />
          </div>
        </aside>
      </form>
    </section>
  );
}
