/**
 * Marketing site content.
 *
 * The audience is a salon owner in Lahore, Karachi, or Islamabad who is deciding
 * whether this is worth PKR 3,999 a month. The copy therefore leads with the
 * money they are losing to customers who quietly stopped coming, not with a
 * feature list — and every page names the two things owners ask first: whose
 * WhatsApp number the messages come from, and who receives customer payments.
 */

import type { FC } from "hono/jsx";
import { brand } from "../../shared/brand.js";
import { PLANS, formatPkr } from "../../shared/plans.js";

// ---------------------------------------------------------------------------
// Reusable sections
// ---------------------------------------------------------------------------

const Hero: FC<{ eyebrow?: string; title: string; body: string; primary?: { href: string; label: string } }> = ({
  eyebrow,
  title,
  body,
  primary
}) => (
  <section class="bg-grid border-b border-ink-100 bg-ink-50/40">
    <div class="container-page py-16 sm:py-20">
      {eyebrow ? <p class="eyebrow mb-3">{eyebrow}</p> : null}
      <h1 class="max-w-3xl text-3xl leading-tight sm:text-4xl">{title}</h1>
      <p class="mt-4 max-w-2xl text-base leading-7 text-ink-600">{body}</p>
      {primary ? (
        <a href={primary.href} class="btn-primary btn-lg mt-7">
          {primary.label}
        </a>
      ) : null}
    </div>
  </section>
);

const SectionHead: FC<{ eyebrow?: string; title: string; body?: string; center?: boolean }> = ({
  eyebrow,
  title,
  body,
  center
}) => (
  <div class={center ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
    {eyebrow ? <p class="eyebrow mb-2">{eyebrow}</p> : null}
    <h2 class="text-2xl sm:text-3xl">{title}</h2>
    {body ? <p class="mt-3 text-base leading-7 text-ink-600">{body}</p> : null}
  </div>
);

const Check: FC = () => (
  <svg class="mt-0.5 size-5 shrink-0 text-brand-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <path
      fill-rule="evenodd"
      d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.3 3.3 6.8-6.8a1 1 0 0 1 1.9.5Z"
      clip-rule="evenodd"
    />
  </svg>
);

const CtaBand: FC<{ title?: string; body?: string }> = ({ title, body }) => (
  <section class="bg-ink-900">
    <div class="container-page py-16 text-center">
      <h2 class="text-2xl text-white sm:text-3xl">{title ?? "See who stopped coming to your salon"}</h2>
      <p class="mx-auto mt-3 max-w-xl text-base leading-7 text-ink-200">
        {body ??
          "Start a 14-day free trial. No card required, no setup fee, and you can export your data at any time."}
      </p>
      <div class="mt-7 flex flex-wrap items-center justify-center gap-3">
        <a href="/signup" class="btn-gold btn-lg">
          Start free trial
        </a>
        <a href="/contact" class="btn-lg inline-flex items-center justify-center rounded-xl border border-ink-600 px-6 text-base font-semibold text-white hover:bg-ink-800">
          Talk to us
        </a>
      </div>
      <p class="mt-5 text-xs text-ink-400">
        Messages are sent from your own WhatsApp Business number. Customer payments go straight to your
        account — {brand.companyName} never touches them.
      </p>
    </div>
  </section>
);

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

const PROBLEMS = [
  {
    stat: "6 in 10",
    label: "first-time customers never come back",
    body: "They were happy. They simply forgot, and nobody reminded them. A salon with 400 new faces a year loses most of them by default."
  },
  {
    stat: "5×",
    label: "cheaper to bring one back",
    body: "Winning a lapsed customer costs a WhatsApp message. Winning a new one costs advertising, discounts, and time."
  },
  {
    stat: "0",
    label: "records in most salons",
    body: "A register with names and amounts cannot tell you who is missing. So nobody finds out until the chair is empty."
  }
];

const FEATURE_CARDS = [
  {
    title: "Lost customers, listed by name",
    body: "Saloona learns how often each customer normally visits and flags them the moment they are overdue — with the rupees you stand to recover next to each name.",
    tag: "The headline feature"
  },
  {
    title: "One button to bring them back",
    body: "Pick the list, choose an offer, and send. Every message goes from your own WhatsApp Business number, and returning visits are matched back to the campaign that caused them.",
    tag: "Win-back campaigns"
  },
  {
    title: "Reception checkout in 15 seconds",
    body: "Search by phone number, tick the services, take the payment. Points are awarded, the visit is recorded, and the thank-you message queues itself.",
    tag: "Daily use"
  },
  {
    title: "Loyalty your customers can see",
    body: "A QR code at the desk opens a points wallet on the customer's phone. No app to download, no card to lose, no plastic to print.",
    tag: "Customer PWA"
  },
  {
    title: "Reminders timed per customer",
    body: "Someone who comes every two weeks is reminded on a different schedule to someone who comes every two months. One blanket reminder trains people to ignore you.",
    tag: "Visit cadence"
  },
  {
    title: "Numbers that answer real questions",
    body: "Which stylist earns the most. Which service actually sells. How much revenue came back from campaigns. Reports you would otherwise build in a notebook.",
    tag: "Reports"
  }
];

const STEPS = [
  {
    n: "1",
    title: "Add your services and staff",
    body: "Ten minutes at the desk. Prices, durations, and who works which chair."
  },
  {
    n: "2",
    title: "Connect your WhatsApp number",
    body: "Your own WhatsApp Business number, connected once. Every message your customers receive shows your salon's name."
  },
  {
    n: "3",
    title: "Bill every visit through Saloona",
    body: "Reception takes payment as normal. The customer record, points, and reminder schedule build themselves."
  },
  {
    n: "4",
    title: "Send the win-back list every Monday",
    body: "Saloona shows who is overdue. You decide the offer. The messages go out from your number."
  }
];

export const HomePage: FC = () => (
  <>
    <section class="bg-grid relative overflow-hidden border-b border-ink-100">
      <div class="container-page grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <span class="badge-brand">Built in Pakistan for Pakistani salons</span>
          <h1 class="mt-5 text-4xl leading-[1.1] sm:text-5xl">
            Bring your customers <span class="text-brand-600">back.</span> Automatically.
          </h1>
          <p class="mt-5 max-w-xl text-lg leading-8 text-ink-600">
            Most salons do not lose customers to a competitor. They lose them to being forgotten. Saloona
            tracks every visit, learns when each customer is due, and brings the missing ones back with a
            WhatsApp message from your own number.
          </p>

          <div class="mt-8 flex flex-wrap gap-3">
            <a href="/signup" class="btn-primary btn-lg">
              Start 14-day free trial
            </a>
            <a href="/how-it-works" class="btn-secondary btn-lg">
              See how it works
            </a>
          </div>

          <ul class="mt-8 grid gap-2 text-sm text-ink-600 sm:grid-cols-2">
            {[
              "No card required to start",
              "Works on the reception phone",
              "Your WhatsApp number, your brand",
              "Cash, Raast, JazzCash, Easypaisa"
            ].map((item) => (
              <li class="flex gap-2">
                <Check />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* A representative dashboard panel rather than a screenshot, so it never
            goes stale against the real product. */}
        <div class="card shadow-[--shadow-lift]">
          <div class="flex items-center justify-between border-b border-ink-100 px-5 py-4">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wider text-ink-400">Lost customers</p>
              <p class="text-sm text-ink-500">28 people are overdue for a visit</p>
            </div>
            <span class="badge-gold tabular">{formatPkr(94_500)} recoverable</span>
          </div>

          <ul class="divide-y divide-ink-50">
            {[
              { name: "Ayesha Khan", gap: "Visits every 26 days", overdue: "41 days overdue", value: 3200 },
              { name: "Hina Siddiqui", gap: "Visits every 31 days", overdue: "38 days overdue", value: 4500 },
              { name: "Fatima Raza", gap: "Visits every 19 days", overdue: "33 days overdue", value: 2100 },
              { name: "Sana Malik", gap: "Visits every 45 days", overdue: "29 days overdue", value: 6800 }
            ].map((row) => (
              <li class="flex items-center justify-between gap-3 px-5 py-3">
                <div>
                  <p class="text-sm font-medium text-ink-900">{row.name}</p>
                  <p class="text-xs text-ink-400">{row.gap}</p>
                </div>
                <div class="text-right">
                  <p class="text-xs font-medium text-orange-700">{row.overdue}</p>
                  <p class="tabular text-xs text-ink-500">{formatPkr(row.value)} avg</p>
                </div>
              </li>
            ))}
          </ul>

          <div class="border-t border-ink-100 p-4">
            <span class="btn-primary w-full" role="img" aria-label="Send win-back campaign button">
              Send win-back campaign
            </span>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container-page">
        <SectionHead
          center
          eyebrow="The problem"
          title="Your busiest chair is the one that stayed empty"
          body="Every salon has a quiet list of people who used to come and then stopped. Without records, that list is invisible."
        />
        <div class="mt-12 grid gap-5 md:grid-cols-3">
          {PROBLEMS.map((item) => (
            <div class="card card-body">
              <p class="tabular text-3xl font-semibold text-brand-600">{item.stat}</p>
              <p class="mt-1 text-sm font-semibold text-ink-900">{item.label}</p>
              <p class="mt-3 text-sm leading-6 text-ink-600">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    <section class="section border-y border-ink-100 bg-ink-50/50">
      <div class="container-page">
        <SectionHead
          center
          eyebrow="What you get"
          title="Everything a salon actually uses, and nothing it does not"
          body="Built around one question: is this customer coming back, and what will you do about it if they are not?"
        />
        <div class="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {FEATURE_CARDS.map((card) => (
            <div class="card-hover card-body">
              <p class="eyebrow">{card.tag}</p>
              <h3 class="mt-2 text-base">{card.title}</h3>
              <p class="mt-2 text-sm leading-6 text-ink-600">{card.body}</p>
            </div>
          ))}
        </div>
        <div class="mt-10 text-center">
          <a href="/features" class="btn-secondary">
            See all features
          </a>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container-page">
        <SectionHead
          eyebrow="Getting started"
          title="Running by the end of the afternoon"
          body="No consultant, no data migration project, no training week."
        />
        <ol class="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <li class="card card-body">
              <span class="flex size-9 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
                {step.n}
              </span>
              <h3 class="mt-4 text-base">{step.title}</h3>
              <p class="mt-2 text-sm leading-6 text-ink-600">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>

    <section class="section border-t border-ink-100 bg-ink-50/50">
      <div class="container-page grid gap-10 lg:grid-cols-2">
        <div>
          <SectionHead
            eyebrow="Two questions everyone asks"
            title="Whose WhatsApp number, and who gets the money?"
          />
          <div class="mt-8 space-y-6">
            <div>
              <h3 class="text-base">Your number, not ours</h3>
              <p class="mt-2 text-sm leading-6 text-ink-600">
                You connect your own WhatsApp Business number. Customers see your salon's name when a reminder
                arrives, replies come to you, and the relationship stays yours. You pay Meta's messaging
                charges directly, which is why our subscription price does not change with your message
                volume.
              </p>
            </div>
            <div>
              <h3 class="text-base">Customer payments never pass through us</h3>
              <p class="mt-2 text-sm leading-6 text-ink-600">
                Saloona records what a customer paid — cash, Raast, JazzCash, Easypaisa, or card. The money
                goes to your account exactly as it does today. The only payment {brand.companyName} collects
                is your monthly subscription.
              </p>
            </div>
          </div>
        </div>

        <div class="card card-body">
          <h3 class="text-base">Plain pricing</h3>
          <p class="mt-2 text-sm leading-6 text-ink-600">
            One monthly fee per salon. Every plan includes the customer wallet, loyalty points, and WhatsApp
            reminders.
          </p>
          <ul class="mt-6 space-y-4">
            {PLANS.map((plan) => (
              <li class="flex items-baseline justify-between gap-4 border-b border-ink-50 pb-3 last:border-0 last:pb-0">
                <div>
                  <p class="text-sm font-semibold text-ink-900">
                    {plan.name}
                    {plan.highlighted ? <span class="badge-brand ml-2">Most popular</span> : null}
                  </p>
                  <p class="text-xs text-ink-500">{plan.summary}</p>
                </div>
                <p class="tabular shrink-0 text-sm font-semibold text-ink-900">
                  {formatPkr(plan.pricePkr)}
                  <span class="font-normal text-ink-400">/mo</span>
                </p>
              </li>
            ))}
          </ul>
          <a href="/pricing" class="btn-secondary mt-6 w-full">
            Compare plans
          </a>
        </div>
      </div>
    </section>

    <CtaBand />
  </>
);

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

const FEATURE_GROUPS = [
  {
    heading: "Retention — the reason Saloona exists",
    items: [
      {
        title: "Per-customer visit cadence",
        body: "Saloona measures the typical gap between each customer's visits and uses the middle of that range, not the average. One long holiday absence should not push a fortnightly customer's reminder out by weeks."
      },
      {
        title: "The at-risk list",
        body: "Everyone who has passed their expected return date, sorted by how much they normally spend. This is the first thing you see when you open Saloona, because it is the only screen that makes you money."
      },
      {
        title: "Win-back campaigns",
        body: "Choose a segment, write the offer, preview the audience, and send. Saloona blocks the send if it would exceed your monthly message allowance rather than stopping halfway through your list."
      },
      {
        title: "Revenue attribution",
        body: "When a customer who received a campaign comes back within 30 days, the visit and its value are recorded against that campaign. You find out what the discount actually earned."
      }
    ]
  },
  {
    heading: "Reception and daily operations",
    items: [
      {
        title: "Checkout with multi-service bills",
        body: "A cut, a beard trim, and a threading on one bill, each line attributed to the staff member who performed it — so per-stylist revenue is right even when two people work on the same customer."
      },
      {
        title: "Search by phone number",
        body: "The phone number is the customer's identity. Type it in any format — 0300, +92300, 92 300 — and Saloona finds the right person or offers to add them."
      },
      {
        title: "Payment recording",
        body: "Cash, Raast, JazzCash, Easypaisa, card, or bank transfer. Recorded for your books; the money never routes through us."
      },
      {
        title: "Void without deleting",
        body: "A mistaken bill is voided by a manager: points are reversed, revenue is corrected, and the record of what happened stays intact."
      },
      {
        title: "Roles",
        body: "Receptionists take payment. Managers change prices and send campaigns. Owners handle billing and the WhatsApp connection."
      }
    ]
  },
  {
    heading: "Loyalty your customers can see",
    items: [
      {
        title: "Points on every rupee",
        body: "Set how many points a hundred rupees earns. Points are awarded on complete hundreds, so a bill never produces a fractional balance nobody can explain."
      },
      {
        title: "Rewards you define",
        body: "A free blow-dry at 500 points, 20% off at 1,000 — whatever suits your margins. Redemption is checked against the live balance, so the same points cannot be spent twice at two tills."
      },
      {
        title: "QR wallet, no app store",
        body: "A code at the desk opens the customer's points balance, next reward, and visit history in their browser. They can add it to their home screen; there is nothing to download and nothing to approve."
      }
    ]
  },
  {
    heading: "WhatsApp, from your own number",
    items: [
      {
        title: "Six message types",
        body: "Thank you after a visit, a return reminder when they are due, a win-back when they are overdue, a reward unlocked, a birthday greeting, and a review request."
      },
      {
        title: "Sent at a sensible hour",
        body: "Automated messages go out mid-morning in your salon's own timezone. Nobody is woken at 4am by a reminder about a haircut."
      },
      {
        title: "Consent and opt-out honoured",
        body: "Marketing messages only go to customers who agreed to receive them, and one tap in the wallet stops them for good. Reminders about a service they booked are treated separately, as Meta's rules require."
      },
      {
        title: "Delivery you can inspect",
        body: "Every message, its status, and any error from Meta is listed. Failed sends are retried with a widening gap; permanent failures stop rather than burning your allowance."
      }
    ]
  },
  {
    heading: "Reports",
    items: [
      {
        title: "Today and this month",
        body: "Revenue, visits, average bill, new customers, and how much came back from campaigns."
      },
      {
        title: "Staff performance",
        body: "Revenue and visit counts per staff member, built from bill line items rather than a single stylist per visit."
      },
      {
        title: "Service mix",
        body: "Which services sell, which ones only appear as add-ons, and what each contributes."
      },
      {
        title: "Retention breakdown",
        body: "How many of your customers are active, due, at risk, or lost — the number that decides whether the business is growing or leaking."
      }
    ]
  }
];

export const FeaturesPage: FC = () => (
  <>
    <Hero
      eyebrow="Features"
      title="Salon software that is judged on one number: how many customers came back"
      body="Everything below exists to move that number. Booking and referrals are on the roadmap; what is here today is what a salon uses every hour it is open."
      primary={{ href: "/signup", label: "Start free trial" }}
    />

    <div class="container-page py-16">
      {FEATURE_GROUPS.map((group) => (
        <section class="mb-14 last:mb-0">
          <h2 class="text-2xl">{group.heading}</h2>
          <div class="mt-6 grid gap-5 md:grid-cols-2">
            {group.items.map((item) => (
              <div class="card card-body">
                <h3 class="text-base">{item.title}</h3>
                <p class="mt-2 text-sm leading-6 text-ink-600">{item.body}</p>
              </div>
            ))}
          </div>
        </section>
      ))}

      <div class="card card-body bg-ink-50/60">
        <h2 class="text-xl">Coming in the next release</h2>
        <p class="mt-2 text-sm leading-6 text-ink-600">
          Appointment booking with staff calendars, and a referral programme where an existing customer's code
          earns both sides points. We are shipping retention properly first — a booking calendar that nobody
          fills is not worth having.
        </p>
      </div>
    </div>

    <CtaBand />
  </>
);

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

const PRICING_FAQ = [
  {
    question: "Do I pay for the WhatsApp messages?",
    answer:
      "You pay Meta directly for messaging, on your own WhatsApp Business account. Meta's charges in Pakistan are a fraction of a rupee to a few rupees per conversation depending on the type. Your plan's message allowance is Saloona's own processing limit, not a resale of Meta's charges."
  },
  {
    question: "What happens after the 14-day trial?",
    answer:
      "You pick a plan and pay by card or bank transfer. If you do nothing, your account pauses — your data stays intact and nothing is deleted. You can export your customers to CSV at any time, including after cancelling."
  },
  {
    question: "Can I change plan later?",
    answer:
      "Yes, up or down, from Settings. An upgrade takes effect immediately; a downgrade takes effect at the end of the current month so you do not lose paid-for allowance."
  },
  {
    question: "Is there a setup or per-user fee?",
    answer:
      "No. The monthly price covers the whole salon, including every staff member up to your plan's limit. Onboarding help is included."
  }
];

export const PricingPage: FC = () => (
  <>
    <Hero
      eyebrow="Pricing"
      title="One monthly price per salon. No commission on your takings."
      body="Every plan includes the customer wallet, loyalty points, and WhatsApp reminders from your own number. Start with 14 days free — no card required."
    />

    <section class="container-page py-16">
      <div class="grid gap-6 lg:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            class={
              plan.highlighted
                ? "card card-body relative border-brand-300 shadow-[--shadow-lift] ring-1 ring-brand-200"
                : "card card-body"
            }
          >
            {plan.highlighted ? (
              <span class="badge-brand absolute -top-3 left-6">Most popular</span>
            ) : null}
            <h2 class="text-lg">{plan.name}</h2>
            <p class="mt-1 min-h-10 text-sm leading-6 text-ink-500">{plan.summary}</p>
            <p class="mt-5">
              <span class="tabular text-3xl font-semibold text-ink-900">{formatPkr(plan.pricePkr)}</span>
              <span class="text-sm text-ink-400"> /month</span>
            </p>
            <a href="/signup" class={plan.highlighted ? "btn-primary mt-6 w-full" : "btn-secondary mt-6 w-full"}>
              Start free trial
            </a>

            <ul class="mt-6 space-y-2.5">
              {plan.features.map((feature) => (
                <li class="flex gap-2 text-sm leading-6 text-ink-700">
                  <Check />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <dl class="mt-6 space-y-1.5 border-t border-ink-50 pt-5 text-xs text-ink-500">
              <div class="flex justify-between">
                <dt>Branches</dt>
                <dd class="tabular font-medium text-ink-700">{plan.limits.locations}</dd>
              </div>
              <div class="flex justify-between">
                <dt>Staff members</dt>
                <dd class="tabular font-medium text-ink-700">{plan.limits.staff}</dd>
              </div>
              <div class="flex justify-between">
                <dt>Customer records</dt>
                <dd class="tabular font-medium text-ink-700">{plan.limits.customers.toLocaleString("en-US")}</dd>
              </div>
              <div class="flex justify-between">
                <dt>Automated messages/month</dt>
                <dd class="tabular font-medium text-ink-700">
                  {plan.limits.monthlyMessages.toLocaleString("en-US")}
                </dd>
              </div>
              <div class="flex justify-between">
                <dt>Campaigns/month</dt>
                <dd class="tabular font-medium text-ink-700">{plan.limits.campaignsPerMonth}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      <div class="card card-body mt-10 bg-ink-50/60">
        <h2 class="text-lg">More than ten branches?</h2>
        <p class="mt-2 max-w-2xl text-sm leading-6 text-ink-600">
          Chains and franchise groups are priced per branch with central reporting and a single invoice. Tell us
          how many locations you run and we will send a quote the same day.
        </p>
        <a href="/contact" class="btn-secondary mt-5 self-start">
          Request a quote
        </a>
      </div>

      <div class="mt-16">
        <SectionHead title="Pricing questions" />
        <dl class="mt-6 divide-y divide-ink-100 border-y border-ink-100">
          {PRICING_FAQ.map((item) => (
            <div class="py-5">
              <dt class="text-base font-semibold text-ink-900">{item.question}</dt>
              <dd class="mt-2 text-sm leading-6 text-ink-600">{item.answer}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>

    <CtaBand title="Try it on this month's customers" body="Fourteen days free. Cancel from Settings in two clicks." />
  </>
);

export const pricingFaqEntries = PRICING_FAQ;

// ---------------------------------------------------------------------------
// How it works
// ---------------------------------------------------------------------------

export const HowItWorksPage: FC = () => (
  <>
    <Hero
      eyebrow="How it works"
      title="From an empty account to a full win-back list"
      body="Four things happen: you set up the salon, reception bills through Saloona, Saloona learns each customer's rhythm, and overdue customers get a message from your number."
    />

    <div class="container-page py-16">
      <ol class="space-y-10">
        {[
          {
            n: "1",
            title: "Set up the salon (about 15 minutes)",
            body: "Add your branch, your services with prices, and your staff. Set how many loyalty points a hundred rupees earns and what the rewards are. The setup checklist on your dashboard walks through it in order and tells you what is still missing.",
            detail: [
              "Services can be deactivated later but never disappear, so old bills always show what was actually sold.",
              "Staff get a role: owner, manager, or receptionist.",
              "Loyalty defaults to 1 point per PKR 100 — change it if your margins are tighter."
            ]
          },
          {
            n: "2",
            title: "Connect your WhatsApp Business number",
            body: "In Settings, paste the phone number ID, WhatsApp Business Account ID, and access token from your Meta Business account. Saloona checks them against Meta before saving, so you find out immediately if something is wrong instead of hours later when a reminder fails silently.",
            detail: [
              "Your credentials are encrypted before they are stored and are never shown again.",
              "Message templates must be approved by Meta once; we provide the six templates and the exact text to submit.",
              "If Meta revokes your token, Saloona pauses sending and tells you rather than retrying into a wall."
            ]
          },
          {
            n: "3",
            title: "Bill every visit at reception",
            body: "Search the customer by phone number, or add them in one line. Tick the services, apply any discount, choose how they paid, and save. The visit is recorded, points are awarded, and a thank-you message is queued.",
            detail: [
              "A new customer is created from just a name and a number — anything more and people abandon the form at the desk.",
              "Print or WhatsApp the receipt, or skip it entirely.",
              "The customer's expected return date is recalculated on every visit."
            ]
          },
          {
            n: "4",
            title: "Work the at-risk list",
            body: "After a few weeks Saloona knows each customer's normal gap. Anyone past it appears on the Lost Customers list with how overdue they are and what they typically spend. Choose the list, pick an offer, and send from your own number.",
            detail: [
              "Only customers who consented to marketing are included, and anyone who opted out is filtered out before you see the count.",
              "Saloona checks the whole audience against your monthly allowance before queuing anything.",
              "Returning visits within 30 days are attributed to the campaign, so you see the rupees it recovered."
            ]
          },
          {
            n: "5",
            title: "Put the QR code on the desk",
            body: "Saloona generates a code for your salon. A customer scans it, enters their name and number, and their points wallet opens in their browser. No app store, no password, nothing to install.",
            detail: [
              "Scanning again on a new phone finds their existing record instead of starting them at zero.",
              "The wallet shows points, the next reward, and their recent visits.",
              "Opting out of messages is one tap, which keeps you on the right side of Meta's policy."
            ]
          }
        ].map((step) => (
          <li class="grid gap-5 border-b border-ink-100 pb-10 last:border-0 md:grid-cols-[3rem_1fr]">
            <span class="flex size-11 items-center justify-center rounded-full bg-brand-600 text-base font-semibold text-white">
              {step.n}
            </span>
            <div>
              <h2 class="text-xl">{step.title}</h2>
              <p class="mt-2 max-w-2xl text-base leading-7 text-ink-600">{step.body}</p>
              <ul class="mt-4 space-y-2">
                {step.detail.map((line) => (
                  <li class="flex gap-2 text-sm leading-6 text-ink-600">
                    <Check />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ol>
    </div>

    <CtaBand />
  </>
);

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

export const WhatsappPage: FC = () => (
  <>
    <Hero
      eyebrow="WhatsApp"
      title="Messages from your salon's own number — not a shared shortcode"
      body="Customers in Pakistan read WhatsApp and ignore SMS. That only works if the message clearly comes from the salon they know."
    />

    <div class="container-page py-16">
      <div class="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <h2 class="text-2xl">Why your own number matters</h2>
          <div class="prose-page mt-4">
            <p>
              If reminders arrive from an unknown business number, they get ignored or reported. If they arrive
              from the number your customers already have saved, they get read and replied to. That is the whole
              argument, and it is why Saloona does not send on your behalf from a pooled number.
            </p>
            <p>
              It also settles the commercial question. You hold the WhatsApp Business account, you pay Meta's
              conversation charges directly, and your subscription to us does not move when your message volume
              does. Nobody is marking up your messaging.
            </p>

            <h2>What you need from Meta</h2>
            <ul>
              <li>A Meta Business account with your salon verified as a business.</li>
              <li>A WhatsApp Business Account (WABA) with a phone number that is not already on the consumer WhatsApp app.</li>
              <li>A permanent access token for a system user with WhatsApp permissions.</li>
              <li>The six message templates approved once. We give you the exact text to submit.</li>
            </ul>
            <p>
              Business verification with Meta typically takes a few days. Start it while you are setting up the
              rest of Saloona — everything except sending works without it, and we will help you through the
              submission.
            </p>

            <h2>The six messages</h2>
            <ul>
              <li>
                <strong>Thank you</strong> — sent after a visit, with the points earned and the new balance.
              </li>
              <li>
                <strong>Return reminder</strong> — sent when the customer is due, based on their own visit rhythm.
              </li>
              <li>
                <strong>Win-back</strong> — sent when they are overdue, with whatever offer you choose.
              </li>
              <li>
                <strong>Reward unlocked</strong> — sent when their points reach a reward.
              </li>
              <li>
                <strong>Birthday</strong> — sent on the day, if they gave you the date.
              </li>
              <li>
                <strong>Review request</strong> — sent after a visit with a link to your Google listing.
              </li>
            </ul>

            <h2>Rules we enforce for you</h2>
            <ul>
              <li>Marketing messages go only to customers who agreed to receive them.</li>
              <li>An opt-out is permanent and takes effect immediately across every message type except transactional receipts.</li>
              <li>Automated sends happen mid-morning in your salon's timezone.</li>
              <li>Failed sends retry with a widening gap; a permanent rejection from Meta stops rather than repeating.</li>
              <li>Every send is logged with its status, so you can prove what was sent and when.</li>
            </ul>
          </div>
        </div>

        <aside class="space-y-5">
          <div class="card card-body">
            <p class="eyebrow">Example</p>
            <h3 class="mt-1 text-base">Win-back message</h3>
            <div class="mt-4 rounded-2xl bg-[#e7f6ea] p-4 text-sm leading-6 text-ink-800">
              <p class="font-medium">Glow Salon, Gulberg</p>
              <p class="mt-2">
                Hi Ayesha, we have not seen you in a while and we miss you! Come back this week and enjoy 20%
                off any service. Your 340 loyalty points are still waiting.
              </p>
              <p class="mt-2 text-xs text-ink-500">Reply STOP to opt out</p>
            </div>
            <p class="mt-4 text-xs text-ink-500">
              Your salon name, your number, your offer. Saloona fills in the customer's name and points.
            </p>
          </div>

          <div class="card card-body">
            <h3 class="text-base">What it costs</h3>
            <p class="mt-2 text-sm leading-6 text-ink-600">
              Meta charges per 24-hour conversation, and rates differ between utility messages (reminders,
              receipts) and marketing messages (win-backs, offers). Pakistani rates are among the lowest in the
              world. A salon messaging 400 customers a month typically spends less than the cost of one
              haircut.
            </p>
            <a href="/contact" class="btn-secondary mt-5 w-full">
              Ask us to estimate yours
            </a>
          </div>
        </aside>
      </div>
    </div>

    <CtaBand
      title="Connect your number and start sending"
      body="Set up the salon today; add WhatsApp as soon as Meta verifies you."
    />
  </>
);

// ---------------------------------------------------------------------------
// About
// ---------------------------------------------------------------------------

export const AboutPage: FC = () => (
  <>
    <Hero
      eyebrow="About"
      title={`${brand.productName} is built by ${brand.companyName}, in Pakistan`}
      body="We build software for businesses that see the same customers again and again — and we started with salons because that is where the leak is widest."
    />

    <div class="container-narrow py-16">
      <div class="prose-page">
        <h2>Why we built this</h2>
        <p>
          Walk into most salons in Pakistan and the customer record is a register: a name, an amount, a date.
          It is enough to close the till and nothing more. It cannot tell the owner that the woman who came
          every three weeks for a year has not been in since March, or that she used to spend PKR 4,000 a
          visit.
        </p>
        <p>
          Meanwhile the same owner spends real money on Instagram ads for new customers. Bringing back somebody
          who already likes the place costs one WhatsApp message. The gap between those two numbers is the
          business we are in.
        </p>

        <h2>What we decided not to do</h2>
        <p>
          We did not build a shared sending number, because a reminder from an unfamiliar business number gets
          ignored. We did not route customer payments through ourselves, because a salon's takings should never
          sit in someone else's account. We did not put the customer wallet in an app store, because nobody is
          installing an app for a haircut.
        </p>
        <p>
          We also did not start with a booking calendar. Booking is the feature every competitor leads with and
          the one salons here use least — walk-ins and WhatsApp still rule. It is coming, but after the part
          that makes money.
        </p>

        <h2>Beyond salons</h2>
        <p>
          Everything inside Saloona is built in generic terms — organizations, locations, staff, customers,
          services, visits, rewards. A dental clinic, a spa, a pet groomer, and a car detailing service all
          have the same problem: customers who should come back on a rhythm and quietly stop. Salons are the
          first market, not the last.
        </p>

        <h2>Talk to us</h2>
        <p>
          We are a small team and you will speak to the people who build the product. Email{" "}
          <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a> or use the{" "}
          <a href="/contact">contact form</a>.
        </p>
      </div>
    </div>

    <CtaBand />
  </>
);

// ---------------------------------------------------------------------------
// Contact and support
// ---------------------------------------------------------------------------

export const ContactPage: FC = () => (
  <>
    <Hero
      eyebrow="Contact"
      title="Talk to a person"
      body="Questions about pricing, WhatsApp setup, or whether Saloona fits your salon — we answer the same working day."
    />

    <div class="container-page py-16">
      <div class="grid gap-8 md:grid-cols-2">
        <div class="card card-body">
          <h2 class="text-lg">Email us</h2>
          <p class="mt-2 text-sm leading-6 text-ink-600">
            The fastest route. Tell us how many branches you run and what you use today.
          </p>
          <a href={`mailto:${brand.supportEmail}`} class="btn-primary mt-5 self-start">
            {brand.supportEmail}
          </a>
        </div>

        <div class="card card-body">
          <h2 class="text-lg">WhatsApp or call</h2>
          <p class="mt-2 text-sm leading-6 text-ink-600">
            Sales and onboarding, Monday to Saturday, 10am to 7pm Pakistan Standard Time.
          </p>
          <p class="tabular mt-5 text-lg font-semibold text-ink-900">{brand.salesPhone}</p>
        </div>

        <div class="card card-body md:col-span-2">
          <h2 class="text-lg">Just want to see it?</h2>
          <p class="mt-2 max-w-2xl text-sm leading-6 text-ink-600">
            You do not need a demo call. Start a free trial, add three services, and bill one customer — you
            will know within ten minutes whether this is for you. No card, and you can delete the account from
            Settings.
          </p>
          <a href="/signup" class="btn-primary mt-5 self-start">
            Start free trial
          </a>
        </div>
      </div>
    </div>
  </>
);

const SUPPORT_TOPICS = [
  {
    title: "Getting set up",
    body: "The setup checklist on your dashboard lists what is still missing. Work top to bottom: branch, services, staff, loyalty rules, then WhatsApp."
  },
  {
    title: "WhatsApp is not sending",
    body: "Check Settings → WhatsApp. If the status is anything other than connected, the reason is shown along with Meta's error. The most common causes are an expired token and a template that is still pending approval."
  },
  {
    title: "A customer says they get too many messages",
    body: "Open their record and switch off WhatsApp messages, or ask them to tap opt out in their wallet. Either takes effect immediately."
  },
  {
    title: "A bill was wrong",
    body: "A manager or owner can void the visit from its detail page. Points are reversed and revenue is corrected; the record stays for your audit trail."
  },
  {
    title: "Exporting your data",
    body: "Settings → Data lets you export customers and visits as CSV. This works during the trial, on a paid plan, and after cancellation."
  },
  {
    title: "Billing and invoices",
    body: "Settings → Billing shows your plan, next charge, and every past invoice. Owners can change plan or cancel without contacting us."
  }
];

export const SupportPage: FC = () => (
  <>
    <Hero
      eyebrow="Support"
      title="Help, and how to reach us"
      body="Most questions have a one-paragraph answer. If yours does not, email us — you will get a person, not a ticket queue."
    />

    <div class="container-page py-16">
      <div class="grid gap-5 md:grid-cols-2">
        {SUPPORT_TOPICS.map((topic) => (
          <div class="card card-body">
            <h2 class="text-base">{topic.title}</h2>
            <p class="mt-2 text-sm leading-6 text-ink-600">{topic.body}</p>
          </div>
        ))}
      </div>

      <div class="card card-body mt-10 bg-ink-50/60">
        <h2 class="text-lg">Still stuck?</h2>
        <p class="mt-2 text-sm leading-6 text-ink-600">
          Email <a class="text-brand-700 underline" href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>{" "}
          with your salon name and what you were doing when it went wrong. Support hours are Monday to Saturday,
          10am to 7pm PKT.
        </p>
      </div>
    </div>
  </>
);

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------

export const FAQ_ENTRIES = [
  {
    question: "Does Saloona send WhatsApp messages from its own number?",
    answer:
      "No. You connect your salon's own WhatsApp Business number, and every message shows your salon's name. Replies come to you. You pay Meta's messaging charges directly on your own account."
  },
  {
    question: "Does Digitum receive money my customers pay me?",
    answer:
      "Never. Saloona records what a customer paid — cash, Raast, JazzCash, Easypaisa, card, or transfer — so your reports are right. The money goes to your account exactly as it does today. The only payment we collect is your monthly subscription."
  },
  {
    question: "Do my customers have to install an app?",
    answer:
      "No. They scan the QR code on your reception desk and their points wallet opens in their phone's browser. They can add it to the home screen if they want, but there is nothing to download and no password to remember."
  },
  {
    question: "How does Saloona know when a customer is due back?",
    answer:
      "It measures the gaps between that customer's own visits and takes the middle value, then adds it to their last visit. Someone who comes fortnightly and someone who comes quarterly are treated differently. Until a customer has three visits, Saloona uses the default interval you set."
  },
  {
    question: "What counts as an at-risk customer?",
    answer:
      "Someone who has passed their expected return date by a margin you control — by default, once they are half again past their normal gap. You can widen or tighten it in Settings."
  },
  {
    question: "Can I use it on a phone?",
    answer:
      "Yes. Reception checkout, customer search, and the at-risk list are all built for a phone first, because that is what is actually on the desk. It works on a tablet or laptop equally well."
  },
  {
    question: "Do I need internet?",
    answer:
      "Yes, Saloona is a web application. The customer wallet keeps working offline once opened, but taking payment needs a connection. A mobile hotspot is enough."
  },
  {
    question: "Can I import my existing customer list?",
    answer:
      "Yes — a CSV with names and phone numbers is enough to get started, and Saloona will match duplicates by number. Send us the file during onboarding and we will do the first import with you."
  },
  {
    question: "What happens to my data if I cancel?",
    answer:
      "You can export customers and visits as CSV at any time, including after cancelling. Your account pauses rather than being wiped; ask us to delete it permanently and we will, in writing, within 30 days."
  },
  {
    question: "Is my customers' data safe?",
    answer:
      "Each salon's data is isolated at the database layer, not by a filter someone could forget to apply. Passwords are hashed, session tokens are stored only as digests, and your WhatsApp credentials are encrypted before storage. See the privacy policy for the detail."
  },
  {
    question: "Can I run more than one branch?",
    answer:
      "Yes, on the Growth plan and above. Each branch has its own staff and reporting, with a combined view for the owner."
  },
  {
    question: "Does it support Urdu?",
    answer:
      "Message templates can be written in Urdu or Roman Urdu today, and the interface is in English. A full Urdu interface is on the roadmap."
  },
  {
    question: "Is there appointment booking?",
    answer:
      "Not in this release. Booking with staff calendars and a referral programme are next. We built retention first because that is where the money is being lost."
  }
];

export const FaqPage: FC = () => (
  <>
    <Hero
      eyebrow="FAQ"
      title="Questions salon owners actually ask"
      body="If yours is not here, email us and we will answer it — and add it to this page."
    />

    <div class="container-narrow py-16">
      <dl class="divide-y divide-ink-100 border-y border-ink-100">
        {FAQ_ENTRIES.map((entry) => (
          <div class="py-6">
            <dt class="text-base font-semibold text-ink-900">{entry.question}</dt>
            <dd class="mt-2 text-sm leading-6 text-ink-600">{entry.answer}</dd>
          </div>
        ))}
      </dl>
    </div>

    <CtaBand />
  </>
);

// ---------------------------------------------------------------------------
// 404
// ---------------------------------------------------------------------------

export const NotFoundPage: FC = () => (
  <div class="container-narrow py-24 text-center">
    <p class="eyebrow">404</p>
    <h1 class="mt-2 text-3xl">This page does not exist</h1>
    <p class="mt-3 text-base leading-7 text-ink-600">
      The link may be out of date. Try the homepage, or tell us where you found it.
    </p>
    <div class="mt-8 flex flex-wrap justify-center gap-3">
      <a href="/" class="btn-primary">
        Go to homepage
      </a>
      <a href="/contact" class="btn-secondary">
        Report a broken link
      </a>
    </div>
  </div>
);
