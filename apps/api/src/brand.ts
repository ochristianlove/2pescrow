import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { requireAdmin } from "./auth";
import { config } from "./config";
import { prisma } from "./db";

const DEFAULT_LOGO = path.resolve(__dirname, "../assets/brand/logo.png");
const DEFAULT_MARK = path.resolve(__dirname, "../assets/brand/favicon.png");

function imageKind(buf: Buffer): "jpg" | "png" | "gif" | "webp" | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length > 8 && buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") return "png";
  const gif = buf.length > 6 ? buf.toString("ascii", 0, 6) : "";
  if (gif === "GIF87a" || gif === "GIF89a") return "gif";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

function mediaDir() {
  return path.resolve(config.uploadDir, "brand");
}

function fileFromSetting(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const match = value.trim().match(/\/v1\/brand\/media\/([a-z0-9][a-z0-9.-]{0,80})$/i);
  if (!match) return null;
  const root = mediaDir();
  const resolved = path.resolve(root, match[1]);
  const rel = path.relative(root, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return resolved;
}

export async function readBrandPng(kind: "logo" | "mark"): Promise<Buffer | null> {
  const settings = await prisma.platformSettings.findFirst();
  const chosen = kind === "logo" ? settings?.siteLogoUrl : settings?.siteFaviconUrl;
  const fallback = kind === "logo" ? DEFAULT_LOGO : DEFAULT_MARK;
  const local = fileFromSetting(chosen);
  if (local && fs.existsSync(local)) return fs.readFileSync(local);
  const remote = chosen?.trim();
  if (remote && /^https?:\/\//i.test(remote)) {
    try {
      const response = await fetch(remote);
      if (response.ok) return Buffer.from(await response.arrayBuffer());
    } catch {
      /* use the built-in mark */
    }
  }
  return fs.existsSync(fallback) ? fs.readFileSync(fallback) : null;
}

export function registerBrandRoutes(app: FastifyInstance) {
  app.get("/v1/brand/media/:name", async (req, reply) => {
    const { name } = req.params as { name: string };
    if (!/^[a-z0-9][a-z0-9.-]{0,80}$/i.test(name)) return reply.code(404).send({ error: "Image not found" });
    const root = mediaDir();
    const resolved = path.resolve(root, name);
    const rel = path.relative(root, resolved);
    if (rel.startsWith("..") || path.isAbsolute(rel) || !fs.existsSync(resolved)) {
      return reply.code(404).send({ error: "Image not found" });
    }
    const ext = name.split(".").pop()?.toLowerCase();
    const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : "image/png";
    return reply.type(mime).header("Cache-Control", "public, max-age=86400").send(fs.createReadStream(resolved));
  });

  app.post("/v1/admin/brand/media", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
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
    const dir = mediaDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), buffer);
    return { url: `/v1/brand/media/${name}` };
  });
}
