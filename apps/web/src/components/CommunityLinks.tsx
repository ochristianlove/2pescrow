import type { PlatformSettings } from "../lib/types";

export type SocialLink = { id: "telegram" | "x" | "discord"; label: string; href: string; hint: string };

export function socialLinks(settings: PlatformSettings | null | undefined): SocialLink[] {
  return [
    {
      id: "telegram",
      label: "Telegram",
      href: settings?.telegramUrl?.trim() || "https://t.me/",
      hint: "Short questions and trade-day updates",
    },
    {
      id: "x",
      label: "X",
      href: settings?.xUrl?.trim() || "https://x.com/",
      hint: "What just shipped",
    },
    {
      id: "discord",
      label: "Discord",
      href: settings?.discordUrl?.trim() || "https://discord.com/",
      hint: "Longer threads with other traders",
    },
  ];
}

export function SocialMark({ id }: { id: SocialLink["id"] }) {
  if (id === "telegram") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
        <path fill="currentColor" d="M9.4 15.6 9.2 19c.4 0 .6-.2.8-.4l2-1.9 4.1 3c.8.4 1.3.2 1.5-.7l2.7-12.7c.2-.9-.3-1.3-1-1L3.6 10.2c-.9.3-.9.8-.2 1l4.2 1.3 9.8-6.2c.5-.3.9-.1.5.2L9.4 15.6Z" />
      </svg>
    );
  }
  if (id === "x") {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
        <path fill="currentColor" d="M14.7 10.3 21.4 3h-1.6l-5.8 6.4L9.2 3H3.5l7 10-7 7.7h1.6l6.1-6.8 4.9 6.8h5.7l-7.1-10.4Zm-2.2 2.4-.7-1-5.6-7.7h2.4l4.5 6.2.7 1 5.9 8.1h-2.4l-4.8-6.6Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path fill="currentColor" d="M19.3 5.2A17 17 0 0 0 15 4l-.4.8a15.2 15.2 0 0 1 4 1.9 16.4 16.4 0 0 0-13.2 0A14 14 0 0 1 9.4 4.8L9 4a17 17 0 0 0-4.3 1.2C2.2 8.8 1.4 12.3 1.6 15.7A17.2 17.2 0 0 0 7 18l.8-1.1a11.2 11.2 0 0 1-1.8-.9l.4-.3c3.4 1.6 7.1 1.6 10.4 0l.4.3c-.6.4-1.2.7-1.8.9l.8 1.1a17.2 17.2 0 0 0 5.4-2.3c.4-4-.7-7.4-2.3-10.5ZM9.2 14.2c-1 0-1.9-.9-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1Zm5.6 0c-1 0-1.9-.9-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.9 2.1-1.9 2.1Z" />
    </svg>
  );
}
