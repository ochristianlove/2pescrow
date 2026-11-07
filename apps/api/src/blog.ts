import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { prisma } from "./db";
import { requirePermission } from "./auth";
import { config } from "./config";

function slugify(title: string) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return base || "note";
}

async function uniqueSlug(title: string, ignoreId?: string) {
  const base = slugify(title);
  let slug = base;
  for (let n = 2; n < 50; n++) {
    const existing = await prisma.blogPost.findUnique({ where: { slug } });
    if (!existing || existing.id === ignoreId) return slug;
    slug = `${base}-${n}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => value === "" || /^https?:\/\//i.test(value), "Use an http or https link")
  .nullable()
  .optional();

const writeSchema = z.object({
  title: z.string().trim().min(3).max(160),
  excerpt: z.string().trim().min(10).max(800),
  body: z.string().trim().min(20).max(60000),
  coverImageUrl: httpUrl,
  published: z.boolean().optional(),
});

const fieldLabel: Record<string, string> = {
  title: "Title",
  excerpt: "Snippet",
  body: "Post",
  coverImageUrl: "Featured image",
};

function imageKind(buf: Buffer): "jpg" | "png" | "gif" | "webp" | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length > 8 && buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") return "png";
  const gif = buf.length > 6 ? buf.toString("ascii", 0, 6) : "";
  if (gif === "GIF87a" || gif === "GIF89a") return "gif";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

function blogMediaDir() {
  return path.resolve(config.uploadDir, "blog");
}

function parseWrite<T>(schema: z.ZodType<T>, raw: unknown, reply: FastifyReply): T | null {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const key = String(issue?.path[0] ?? "");
  const label = fieldLabel[key] || "A field";
  let error = issue?.message || "Check the form and try again.";
  if (issue?.code === "too_big" && "maximum" in issue) error = `${label} can be at most ${issue.maximum} characters.`;
  else if (issue?.code === "too_small" && "minimum" in issue) error = `${label} needs at least ${issue.minimum} characters.`;
  else if (key === "coverImageUrl") error = "Thumbnail link needs to start with http:// or https://.";
  reply.code(400).send({ error });
  return null;
}

function coverValue(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function registerBlogRoutes(app: FastifyInstance) {
  app.get("/v1/blog/media/:name", async (req, reply) => {
    const { name } = req.params as { name: string };
    if (!/^[a-z0-9][a-z0-9.-]{0,80}$/i.test(name)) return reply.code(400).send({ error: "Image not found" });
    const root = blogMediaDir();
    const resolved = path.resolve(root, name);
    const rel = path.relative(root, resolved);
    if (rel.startsWith("..") || path.isAbsolute(rel) || !fs.existsSync(resolved)) {
      return reply.code(404).send({ error: "Image not found" });
    }
    const ext = name.split(".").pop()?.toLowerCase();
    const mime = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : "image/jpeg";
    return reply.type(mime).header("Cache-Control", "public, max-age=86400").send(fs.createReadStream(resolved));
  });

  app.post("/v1/admin/blog/media", async (req, reply) => {
    if (!(await requirePermission(req, reply, "blog"))) return;
    let buffer: Buffer | undefined;
    for await (const part of req.parts()) {
      if (part.type === "file") {
        buffer = await part.toBuffer();
        break;
      }
    }
    if (!buffer?.length) return reply.code(400).send({ error: "Choose an image from your computer." });
    if (buffer.length > 8 * 1024 * 1024) return reply.code(400).send({ error: "That image is over 8 MB. Use a smaller one." });
    const ext = imageKind(buffer);
    if (!ext) return reply.code(400).send({ error: "Use a JPEG, PNG, GIF, or WebP image." });
    const name = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
    const dir = blogMediaDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), buffer);
    return { url: `/v1/blog/media/${name}` };
  });

  app.get("/v1/blog", async (req) => {
    const q = req.query as { limit?: string };
    const limit = Math.min(24, Math.max(1, Number(q.limit) || 12));
    return prisma.blogPost.findMany({
      where: { published: true },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: limit,
      select: { id: true, slug: true, title: true, excerpt: true, coverImageUrl: true, publishedAt: true, createdAt: true },
    });
  });

  app.get("/v1/blog/:slug", async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const post = await prisma.blogPost.findFirst({ where: { slug, published: true } });
    if (!post) return reply.code(404).send({ error: "Post not found" });
    return post;
  });

  app.get("/v1/admin/blog", async (req, reply) => {
    if (!(await requirePermission(req, reply, "blog"))) return;
    return prisma.blogPost.findMany({ orderBy: { updatedAt: "desc" } });
  });

  app.post("/v1/admin/blog", async (req, reply) => {
    if (!(await requirePermission(req, reply, "blog"))) return;
    const body = parseWrite(writeSchema, req.body, reply);
    if (!body) return;
    const slug = await uniqueSlug(body.title);
    const published = body.published ?? false;
    return prisma.blogPost.create({
      data: {
        slug,
        title: body.title,
        excerpt: body.excerpt,
        body: body.body,
        coverImageUrl: coverValue(body.coverImageUrl),
        published,
        publishedAt: published ? new Date() : null,
      },
    });
  });

  app.patch("/v1/admin/blog/:id", async (req, reply) => {
    if (!(await requirePermission(req, reply, "blog"))) return;
    const { id } = req.params as { id: string };
    const existing = await prisma.blogPost.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Post not found" });
    const body = parseWrite(writeSchema.partial(), req.body ?? {}, reply);
    if (!body) return;
    const published = body.published ?? existing.published;
    const title = body.title ?? existing.title;
    const slug = body.title && body.title !== existing.title ? await uniqueSlug(title, id) : existing.slug;
    return prisma.blogPost.update({
      where: { id },
      data: {
        title,
        slug,
        excerpt: body.excerpt ?? existing.excerpt,
        body: body.body ?? existing.body,
        coverImageUrl: body.coverImageUrl === undefined ? existing.coverImageUrl : coverValue(body.coverImageUrl),
        published,
        publishedAt: published ? existing.publishedAt ?? new Date() : null,
      },
    });
  });

  app.delete("/v1/admin/blog/:id", async (req, reply) => {
    if (!(await requirePermission(req, reply, "blog"))) return;
    const { id } = req.params as { id: string };
    await prisma.blogPost.delete({ where: { id } });
    return { ok: true };
  });
}
