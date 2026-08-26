/**
 * Server-rendered page shell.
 *
 * Marketing pages are rendered on the Worker rather than in the SPA so that
 * search engines and WhatsApp link previews see real HTML. Every page supplies
 * its own title, description and canonical path — the previous build shared one
 * description across the whole site, which is the single most common reason a
 * marketing site fails to rank for anything but its brand name.
 */

import type { FC, PropsWithChildren } from "hono/jsx";
import { brand } from "../../shared/brand.js";
import { assets } from "../../shared/assets.js";

export interface PageMeta {
  /** Shown in the browser tab and as the search result headline. */
  title: string;
  /** The search result snippet. Aim for 140–160 characters. */
  description: string;
  /** Canonical path, always beginning with a slash. */
  path: string;
  /** Set for app and customer surfaces, which must never be indexed. */
  noindex?: boolean;
  /** Structured data objects, serialised into a single JSON-LD block. */
  jsonLd?: unknown[];
  /** Extra classes on <body>, used by the app and customer shells. */
  bodyClass?: string;
  /** Marketing chrome is omitted for the app shell and customer wallet. */
  chrome?: "marketing" | "bare";
  /** Registers the service worker; only the customer PWA needs it. */
  pwa?: boolean;
  /**
   * Overrides the manifest URL. The customer wallet points at a per-salon
   * manifest so the icon on their home screen carries the salon's name, not ours.
   */
  manifest?: string;
  /**
   * A module bundle to boot at the end of the body. Present only for the two
   * client-rendered surfaces; marketing pages ship no JavaScript at all.
   */
  moduleScript?: string;
  /**
   * The request's CSP nonce, from `c.get("secureHeadersNonce")`. Required by any
   * page that emits an inline script — without it the browser silently drops the
   * script, because `script-src` does not allow `'unsafe-inline'`.
   */
  nonce?: string;
}

interface ShellProps extends PageMeta {
  origin: string;
}

const NAV = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/whatsapp", label: "WhatsApp" },
  { href: "/faq", label: "FAQ" }
] as const;

const FOOTER_GROUPS = [
  {
    heading: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/pricing", label: "Pricing" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/whatsapp", label: "WhatsApp reminders" }
    ]
  },
  {
    heading: "Company",
    links: [
      { href: "/about", label: "About Digitum" },
      { href: "/contact", label: "Contact sales" },
      { href: "/faq", label: "FAQ" },
      { href: "/support", label: "Support" }
    ]
  },
  {
    heading: "Legal",
    links: [
      { href: "/terms", label: "Terms of service" },
      { href: "/privacy", label: "Privacy policy" },
      { href: "/refund-policy", label: "Refund policy" },
      { href: "/data-processing", label: "Data processing" }
    ]
  }
] as const;

/** Wordmark used in the header, footer, and auth screens. */
export const Logo: FC<{ className?: string; inverted?: boolean }> = ({ className, inverted }) => (
  <span class={`inline-flex items-center gap-2 ${className ?? ""}`}>
    <svg width="28" height="28" viewBox="0 0 32 32" role="img" aria-label={`${brand.productName} logo`}>
      <rect width="32" height="32" rx="9" fill={inverted ? "#ffffff" : "#0f8078"} />
      <path
        d="M10 21.5c1.9 1.4 4 2 6.2 1.7 2.6-.4 4-1.9 3.8-3.5-.2-1.5-1.7-2.2-4.6-2.8-3.5-.7-5.4-2-5.6-4.5-.2-2.8 2.4-5 6.3-5.2 2-.1 3.9.3 5.5 1.2"
        fill="none"
        stroke={inverted ? "#0f8078" : "#ffffff"}
        stroke-width="2.4"
        stroke-linecap="round"
      />
    </svg>
    <span class={`text-lg font-semibold tracking-tight ${inverted ? "text-white" : "text-ink-900"}`}>
      {brand.productName}
    </span>
  </span>
);

const Header: FC = () => (
  <header class="sticky top-0 z-40 border-b border-ink-100/80 bg-white/90 backdrop-blur">
    <div class="container-page flex h-16 items-center justify-between gap-4">
      <a href="/" class="shrink-0" aria-label={`${brand.productName} home`}>
        <Logo />
      </a>

      <nav class="hidden items-center gap-1 md:flex" aria-label="Main">
        {NAV.map((item) => (
          <a
            href={item.href}
            class="rounded-lg px-3 py-2 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900"
          >
            {item.label}
          </a>
        ))}
      </nav>

      <div class="flex items-center gap-2">
        <a href="/login" class="btn-ghost hidden sm:inline-flex">
          Sign in
        </a>
        <a href="/signup" class="btn-primary">
          Start free trial
        </a>
      </div>
    </div>

    {/* Mobile navigation: a plain scrolling row, because a JS drawer on a
        server-rendered page is a dependency the marketing site does not need. */}
    <nav class="flex gap-1 overflow-x-auto border-t border-ink-100 px-4 py-2 md:hidden" aria-label="Main (mobile)">
      {NAV.map((item) => (
        <a href={item.href} class="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-ink-600">
          {item.label}
        </a>
      ))}
    </nav>
  </header>
);

const Footer: FC = () => (
  <footer class="border-t border-ink-100 bg-ink-50/60">
    <div class="container-page py-14">
      <div class="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo />
          <p class="mt-3 max-w-xs text-sm leading-6 text-ink-500">
            Salon software built in Pakistan. Track every visit, reward regulars, and win back the customers
            who stopped coming.
          </p>
          <p class="mt-4 text-sm text-ink-500">
            <a href={`mailto:${brand.supportEmail}`} class="hover:text-ink-800">
              {brand.supportEmail}
            </a>
          </p>
        </div>

        {FOOTER_GROUPS.map((group) => (
          <div>
            <h2 class="text-xs font-semibold uppercase tracking-wider text-ink-400">{group.heading}</h2>
            <ul class="mt-3 space-y-2">
              {group.links.map((link) => (
                <li>
                  <a href={link.href} class="text-sm text-ink-600 hover:text-ink-900">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div class="mt-12 flex flex-col gap-2 border-t border-ink-200/70 pt-6 text-xs text-ink-400 sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {new Date().getUTCFullYear()} {brand.legalName}. All rights reserved.
        </p>
        <p>
          {brand.productName} sends messages from your own WhatsApp Business number. Customer payments go
          directly to you.
        </p>
      </div>
    </div>
  </footer>
);

/**
 * The full HTML document.
 *
 * `chrome="bare"` is used by the login, dashboard, and customer wallet pages,
 * which share the stylesheet but none of the marketing navigation.
 */
export const Shell: FC<PropsWithChildren<ShellProps>> = ({
  title,
  description,
  path,
  origin,
  noindex,
  jsonLd,
  bodyClass,
  chrome = "marketing",
  pwa,
  manifest,
  moduleScript,
  nonce,
  children
}) => {
  const canonical = `${origin}${path}`;
  const fullTitle = path === "/" ? `${brand.productName} — ${brand.tagline}` : `${title} | ${brand.productName}`;

  return (
    <html lang="en" class="h-full">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>{fullTitle}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonical} />
        {noindex ? <meta name="robots" content="noindex, nofollow" /> : <meta name="robots" content="index, follow" />}

        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={brand.productName} />
        <meta property="og:title" content={fullTitle} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:image" content={`${origin}${assets.ogImage}`} />
        <meta property="og:locale" content="en_PK" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content={brand.social.twitter} />
        <meta name="twitter:title" content={fullTitle} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={`${origin}${assets.ogImage}`} />

        <link rel="icon" href={assets.favicon} type="image/svg+xml" />
        <link rel="apple-touch-icon" href={assets.appleTouchIcon} />
        <link rel="manifest" href={manifest ?? assets.manifest} />
        <meta name="theme-color" content={brand.colors.teal} />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content={brand.productName} />
        <meta name="format-detection" content="telephone=no" />

        <link rel="preconnect" href="https://fonts.bunny.net" crossorigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.bunny.net/css?family=inter:400,500,600,700&display=swap"
        />
        <link rel="stylesheet" href={assets.css} />

        {jsonLd && jsonLd.length > 0 ? (
          /* No nonce here, and none needed: a script whose type is neither
             classic nor module is a data block. The HTML parser hands it to
             nobody, so CSP never evaluates it. The `<` escape is what actually
             matters — it stops a salon name containing "</script>" from ending
             the block early and running as markup. */
          <script
            type="application/ld+json"
            /* eslint-disable-next-line */
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(jsonLd.length === 1 ? jsonLd[0] : jsonLd).replace(/</g, "\\u003c")
            }}
          />
        ) : null}
      </head>

      <body class={`flex min-h-full flex-col ${bodyClass ?? ""}`}>
        <a href="#main" class="sr-only-focusable btn-primary absolute left-4 top-4 z-50">
          Skip to content
        </a>

        {chrome === "marketing" ? <Header /> : null}

        <main id="main" class="flex-1">
          {children}
        </main>

        {chrome === "marketing" ? <Footer /> : null}

        {/* Module scripts are deferred by the spec, so the mount point below is
            always in the document before this runs. No nonce: it is loaded from
            `src`, which `script-src 'self'` already allows. */}
        {moduleScript ? <script type="module" src={moduleScript} /> : null}

        {pwa ? (
          <script
            nonce={nonce}
            dangerouslySetInnerHTML={{
              __html: `if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('${assets.serviceWorker}').catch(function(){})})}`
            }}
          />
        ) : null}
      </body>
    </html>
  );
};

/** Organization-level structured data, included on every marketing page. */
export function organizationJsonLd(origin: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: brand.companyName,
    legalName: brand.legalName,
    url: origin,
    logo: `${origin}${assets.icon512}`,
    email: brand.supportEmail,
    address: { "@type": "PostalAddress", addressCountry: "PK" },
    sameAs: [brand.social.linkedin]
  };
}

/** SoftwareApplication data, so the product can appear as a rich result. */
export function productJsonLd(origin: string, lowestPricePkr: number): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: brand.productName,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: origin,
    description: brand.description,
    offers: {
      "@type": "Offer",
      price: lowestPricePkr,
      priceCurrency: "PKR",
      url: `${origin}/pricing`
    },
    provider: { "@type": "Organization", name: brand.companyName, url: origin }
  };
}

export function breadcrumbJsonLd(origin: string, trail: Array<{ name: string; path: string }>): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${origin}${item.path}`
    }))
  };
}

export function faqJsonLd(entries: Array<{ question: string; answer: string }>): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: { "@type": "Answer", text: entry.answer }
    }))
  };
}
