import { useEffect } from "react";
import { usePlatformSettings } from "../lib/platformSettings";
import { brandSrc, DEFAULT_FAVICON } from "../lib/brand";

const DEFAULT_TITLE = "2Pescrow — P2P Escrow";

export function SiteHead() {
  const { settings } = usePlatformSettings();

  useEffect(() => {
    const title = settings?.siteTitle?.trim() || DEFAULT_TITLE;
    document.title = title;

    const setMeta = (name: string, content: string | undefined | null) => {
      if (!content?.trim()) return;
      let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.name = name;
        document.head.appendChild(el);
      }
      el.content = content.trim();
    };

    setMeta("description", settings?.metaDescription);
    setMeta("keywords", settings?.metaKeywords);

    const icon = brandSrc(settings?.siteFaviconUrl, DEFAULT_FAVICON);
    for (const rel of ["icon", "apple-touch-icon"]) {
      let link = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement("link");
        link.rel = rel;
        document.head.appendChild(link);
      }
      link.href = icon;
      if (rel === "icon") link.type = "image/png";
    }
  }, [settings?.siteTitle, settings?.metaDescription, settings?.metaKeywords, settings?.siteFaviconUrl]);

  return null;
}
