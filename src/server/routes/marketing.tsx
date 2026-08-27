/**
 * Marketing, legal, and authentication pages — server-rendered HTML.
 *
 * Each route supplies its own title, description, canonical path and structured
 * data. That is the difference between a site that ranks for "salon software
 * Pakistan" and one that ranks only for its own brand name, and it is why these
 * pages are not part of the SPA.
 */

import { Hono } from "hono";
import {
  Shell,
  breadcrumbJsonLd,
  faqJsonLd,
  organizationJsonLd,
  productJsonLd,
  type PageMeta
} from "../views/layout.js";
import {
  AboutPage,
  ContactPage,
  FAQ_ENTRIES,
  FaqPage,
  FeaturesPage,
  HomePage,
  HowItWorksPage,
  NotFoundPage,
  PricingPage,
  SupportPage,
  WhatsappPage,
  pricingFaqEntries
} from "../views/marketing.js";
import { DataProcessingPage, PrivacyPage, RefundPage, TermsPage } from "../views/legal.js";
import {
  AUTH_SCRIPT,
  ForgotPasswordPage,
  LoginPage,
  ResetPasswordPage,
  SignupPage,
  VerifyEmailPage
} from "../views/auth.js";
import { authService, withSession } from "../middleware/auth.js";
import { baseUrl } from "../lib/url.js";
import { brand } from "../../shared/brand.js";
import { PLANS } from "../../shared/plans.js";
import type { AppEnv } from "../types.js";
import type { Context } from "hono";
import type { Child } from "hono/jsx";

export const marketingRoutes = new Hono<AppEnv>();

/**
 * Marketing HTML is safe to cache at the edge; it contains nothing
 * user-specific. Auth pages opt out via `renderPrivate`, because a cached
 * sign-in page behind a shared proxy is how one person's session notice ends up
 * on someone else's screen.
 */
const PUBLIC_CACHE = "public, max-age=0, s-maxage=600, stale-while-revalidate=86400";

type RenderOptions = PageMeta & { children?: Child };

/**
 * A cached page is deliberately given no nonce. Every visitor served from the
 * edge cache would otherwise share one, and a nonce that thousands of people
 * know is not a nonce. Marketing pages emit no inline script, so there is nothing
 * for it to authorise.
 */
function renderPage(c: Context<AppEnv>, options: RenderOptions) {
  c.header("cache-control", PUBLIC_CACHE);
  return c.html(<Shell {...options} origin={baseUrl(c)} />);
}

function renderPrivate(c: Context<AppEnv>, options: RenderOptions, status: 200 | 404 = 200) {
  c.header("cache-control", "private, no-store");
  return c.html(<Shell {...options} origin={baseUrl(c)} nonce={c.get("secureHeadersNonce")} />, status);
}

/** Every marketing page carries the organization graph plus its own breadcrumb. */
function marketingJsonLd(c: Context<AppEnv>, trail: Array<{ name: string; path: string }>): unknown[] {
  const origin = baseUrl(c);
  const graph: unknown[] = [organizationJsonLd(origin)];
  if (trail.length > 0) graph.push(breadcrumbJsonLd(origin, [{ name: "Home", path: "/" }, ...trail]));
  return graph;
}

// ---------------------------------------------------------------------------
// Marketing
// ---------------------------------------------------------------------------

marketingRoutes.get("/", (c) => {
  const origin = baseUrl(c);
  const lowest = Math.min(...PLANS.map((plan) => plan.pricePkr));
  return renderPage(c, {
    title: brand.tagline,
    description: brand.description,
    path: "/",
    jsonLd: [
      organizationJsonLd(origin),
      productJsonLd(origin, lowest),
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: brand.productName,
        url: origin,
        potentialAction: {
          "@type": "SearchAction",
          target: `${origin}/faq?q={search_term_string}`,
          "query-input": "required name=search_term_string"
        }
      }
    ],
    children: <HomePage />
  });
});

marketingRoutes.get("/features", (c) =>
  renderPage(c, {
    title: "Features — customer records, loyalty, and WhatsApp win-backs",
    description:
      "See who stopped coming, reward regulars, bill multi-service visits at reception, and send win-back campaigns from your own WhatsApp number. Every Saloona feature, explained.",
    path: "/features",
    jsonLd: marketingJsonLd(c, [{ name: "Features", path: "/features" }]),
    children: <FeaturesPage />
  })
);

marketingRoutes.get("/pricing", (c) => {
  const origin = baseUrl(c);
  return renderPage(c, {
    title: `Pricing — from ${PLANS[0]!.pricePkr.toLocaleString("en-US")} PKR/month`,
    description:
      "Simple monthly pricing for Pakistani salons, starting at PKR 3,999. No commission on your takings, no per-user fees, and a 14-day free trial with no card required.",
    path: "/pricing",
    jsonLd: [
      ...marketingJsonLd(c, [{ name: "Pricing", path: "/pricing" }]),
      productJsonLd(origin, Math.min(...PLANS.map((plan) => plan.pricePkr))),
      faqJsonLd(pricingFaqEntries)
    ],
    children: <PricingPage />
  });
});

marketingRoutes.get("/how-it-works", (c) =>
  renderPage(c, {
    title: "How it works — set up in an afternoon",
    description:
      "Add your services and staff, connect your WhatsApp Business number, bill visits at reception, and work the at-risk list every week. Here is exactly what each step involves.",
    path: "/how-it-works",
    jsonLd: marketingJsonLd(c, [{ name: "How it works", path: "/how-it-works" }]),
    children: <HowItWorksPage />
  })
);

marketingRoutes.get("/whatsapp", (c) =>
  renderPage(c, {
    title: "WhatsApp reminders from your own salon number",
    description:
      "Saloona sends reminders and win-back offers through your own WhatsApp Business number, so customers recognise the sender. What you need from Meta, what it costs, and the six message types.",
    path: "/whatsapp",
    jsonLd: marketingJsonLd(c, [{ name: "WhatsApp", path: "/whatsapp" }]),
    children: <WhatsappPage />
  })
);

marketingRoutes.get("/about", (c) =>
  renderPage(c, {
    title: `About ${brand.companyName}`,
    description: `Why ${brand.companyName} built ${brand.productName} for Pakistani salons, the decisions we deliberately took, and where the platform goes after salons.`,
    path: "/about",
    jsonLd: marketingJsonLd(c, [{ name: "About", path: "/about" }]),
    children: <AboutPage />
  })
);

marketingRoutes.get("/contact", (c) =>
  renderPage(c, {
    title: "Contact sales and support",
    description: `Email ${brand.supportEmail} or call ${brand.salesPhone}. Questions about pricing, WhatsApp setup, or multi-branch quotes answered the same working day.`,
    path: "/contact",
    jsonLd: marketingJsonLd(c, [{ name: "Contact", path: "/contact" }]),
    children: <ContactPage />
  })
);

marketingRoutes.get("/support", (c) =>
  renderPage(c, {
    title: "Support and help",
    description:
      "Common answers for setting up Saloona, fixing WhatsApp sending, correcting a bill, exporting your data, and managing billing.",
    path: "/support",
    jsonLd: marketingJsonLd(c, [{ name: "Support", path: "/support" }]),
    children: <SupportPage />
  })
);

marketingRoutes.get("/faq", (c) =>
  renderPage(c, {
    title: "Frequently asked questions",
    description:
      "Whose WhatsApp number sends the messages, who receives customer payments, whether customers need an app, and how Saloona decides a customer is overdue.",
    path: "/faq",
    jsonLd: [...marketingJsonLd(c, [{ name: "FAQ", path: "/faq" }]), faqJsonLd(FAQ_ENTRIES)],
    children: <FaqPage />
  })
);

// ---------------------------------------------------------------------------
// Legal
// ---------------------------------------------------------------------------

marketingRoutes.get("/terms", (c) =>
  renderPage(c, {
    title: "Terms of service",
    description: `The agreement between your business and ${brand.legalName} for using ${brand.productName}, including subscription terms, messaging responsibilities, and liability.`,
    path: "/terms",
    jsonLd: marketingJsonLd(c, [{ name: "Terms", path: "/terms" }]),
    children: <TermsPage />
  })
);

marketingRoutes.get("/privacy", (c) =>
  renderPage(c, {
    title: "Privacy policy",
    description:
      "What Saloona collects about business users, what salons store about their customers, which sub-processors are involved, how long data is kept, and how it is protected.",
    path: "/privacy",
    jsonLd: marketingJsonLd(c, [{ name: "Privacy", path: "/privacy" }]),
    children: <PrivacyPage />
  })
);

marketingRoutes.get("/refund-policy", (c) =>
  renderPage(c, {
    title: "Refund policy",
    description:
      "A full refund of your first paid month within 14 days, no questions asked. What else we refund, what we do not, and how to request one.",
    path: "/refund-policy",
    jsonLd: marketingJsonLd(c, [{ name: "Refund policy", path: "/refund-policy" }]),
    children: <RefundPage />
  })
);

marketingRoutes.get("/data-processing", (c) =>
  renderPage(c, {
    title: "Data processing terms",
    description:
      "The processor terms on which Saloona handles your customers' personal data: roles, categories, sub-processors, breach notification, and audit rights.",
    path: "/data-processing",
    jsonLd: marketingJsonLd(c, [{ name: "Data processing", path: "/data-processing" }]),
    children: <DataProcessingPage />
  })
);

// ---------------------------------------------------------------------------
// Authentication screens
// ---------------------------------------------------------------------------

/** A signed-in owner who lands on /login or /signup wants the dashboard. */
marketingRoutes.use("/login", withSession);
marketingRoutes.use("/signup", withSession);

/**
 * The auth screens are plain HTML forms posted with `fetch` by one small script,
 * rather than a slice of the React bundle: signing in should not require
 * downloading the dashboard first. The script is inline and therefore needs the
 * request's nonce — hence a function of the nonce rather than a constant.
 */
const authScript = (nonce: string | undefined) => (
  <script nonce={nonce} dangerouslySetInnerHTML={{ __html: AUTH_SCRIPT }} />
);

marketingRoutes.get("/login", (c) => {
  if (c.get("session")) return c.redirect("/app", 302);
  return renderPrivate(c, {
    title: "Sign in",
    description: "Sign in to your Saloona dashboard.",
    path: "/login",
    noindex: true,
    chrome: "bare",
    bodyClass: "bg-white",
    children: (
      <>
        <LoginPage notice={c.req.query("reset") === "1" ? "Password updated. Please sign in." : undefined} />
        {authScript(c.get("secureHeadersNonce"))}
      </>
    )
  });
});

marketingRoutes.get("/signup", (c) => {
  if (c.get("session")) return c.redirect("/app", 302);
  return renderPrivate(c, {
    title: "Start your free trial",
    description: "Create a Saloona account for your salon. 14 days free, no card required.",
    path: "/signup",
    // Deliberately indexable: this is a conversion page people search for.
    chrome: "bare",
    children: (
      <>
        <SignupPage planId={c.req.query("plan")} />
        {authScript(c.get("secureHeadersNonce"))}
      </>
    )
  });
});

marketingRoutes.get("/forgot-password", (c) =>
  renderPrivate(c, {
    title: "Reset your password",
    description: "Request a password reset link for your Saloona account.",
    path: "/forgot-password",
    noindex: true,
    chrome: "bare",
    children: (
      <>
        <ForgotPasswordPage />
        {authScript(c.get("secureHeadersNonce"))}
      </>
    )
  })
);

marketingRoutes.get("/reset-password", (c) =>
  renderPrivate(c, {
    title: "Choose a new password",
    description: "Set a new password for your Saloona account.",
    path: "/reset-password",
    noindex: true,
    chrome: "bare",
    children: (
      <>
        <ResetPasswordPage token={c.req.query("token") ?? ""} />
        {authScript(c.get("secureHeadersNonce"))}
      </>
    )
  })
);

/**
 * Email verification is a GET because it is followed from an email client, so it
 * is consumed here rather than in the JSON API.
 */
marketingRoutes.get("/verify-email", async (c) => {
  const token = c.req.query("token");
  let verified = false;
  if (token) {
    try {
      verified = await authService(c).verifyEmail(token);
    } catch (error) {
      console.error("Email verification failed", error);
    }
  }
  return renderPrivate(c, {
    title: verified ? "Email confirmed" : "Verification link expired",
    description: "Confirm your Saloona account email address.",
    path: "/verify-email",
    noindex: true,
    chrome: "bare",
    children: <VerifyEmailPage ok={verified} />
  });
});

// ---------------------------------------------------------------------------
// Redirects for URLs that people and old links guess at
// ---------------------------------------------------------------------------

const ALIASES: Record<string, string> = {
  "/plans": "/pricing",
  "/price": "/pricing",
  "/register": "/signup",
  "/sign-up": "/signup",
  "/sign-in": "/login",
  "/signin": "/login",
  "/help": "/support",
  "/privacy-policy": "/privacy",
  "/terms-of-service": "/terms",
  "/refunds": "/refund-policy",
  "/dpa": "/data-processing"
};

for (const [from, to] of Object.entries(ALIASES)) {
  marketingRoutes.get(from, (c) => c.redirect(to, 301));
}

/**
 * The real 404.
 *
 * The previous build answered unknown paths with HTTP 200 and a page that said
 * "not found", which tells a search engine that every typo is a valid page worth
 * indexing.
 */
export function renderNotFound(c: Context<AppEnv>) {
  return renderPrivate(
    c,
    {
      title: "Page not found",
      description: "This page does not exist.",
      path: new URL(c.req.url).pathname,
      noindex: true,
      children: <NotFoundPage />
    },
    404
  );
}
