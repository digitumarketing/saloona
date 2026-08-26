/**
 * Legal pages.
 *
 * These exist because a paid SaaS cannot be sold without them — a payment
 * gateway will ask for terms, a refund policy, and a privacy policy during
 * merchant onboarding, and a salon handing over its customer list is entitled to
 * know what happens to it.
 *
 * They are written to be accurate about this specific system rather than copied
 * from a template: the data listed is the data actually stored, and the
 * sub-processors named are the ones actually used. They are not a substitute for
 * review by a Pakistani lawyer before launch.
 */

import type { FC } from "hono/jsx";
import { brand } from "../../shared/brand.js";

/** Shown on every legal page so a reader knows which version they are reading. */
const LAST_UPDATED = "26 August 2026";

const LegalPage: FC<{ title: string; intro: string; children?: unknown }> = ({ title, intro, children }) => (
  <>
    <section class="border-b border-ink-100 bg-ink-50/40">
      <div class="container-narrow py-14">
        <p class="eyebrow">Legal</p>
        <h1 class="mt-2 text-3xl">{title}</h1>
        <p class="mt-3 text-base leading-7 text-ink-600">{intro}</p>
        <p class="mt-4 text-xs text-ink-400">Last updated {LAST_UPDATED}</p>
      </div>
    </section>
    <div class="container-narrow py-14">
      <div class="prose-page">{children}</div>
      <div class="card card-body mt-12 bg-ink-50/60 text-sm">
        <p class="text-ink-600">
          Questions about this document? Email{" "}
          <a class="text-brand-700 underline" href={`mailto:${brand.supportEmail}`}>
            {brand.supportEmail}
          </a>
          .
        </p>
      </div>
    </div>
  </>
);

export const TermsPage: FC = () => (
  <LegalPage
    title="Terms of service"
    intro={`The agreement between your business and ${brand.legalName} for the use of ${brand.productName}.`}
  >
    <h2>1. Who this agreement is with</h2>
    <p>
      {brand.productName} is operated by {brand.legalName} ("{brand.companyName}", "we"), a company registered
      in {brand.country}. By creating an account you agree to these terms on behalf of the business you
      represent ("you", "your business"). If you are not authorised to bind that business, do not create an
      account.
    </p>

    <h2>2. What we provide</h2>
    <p>
      A hosted software service for recording customer visits, running a loyalty programme, and sending
      messages to your customers through your own WhatsApp Business account. We provide the software; you
      provide the business, the customer relationships, and the content of your messages.
    </p>

    <h2>3. Your account</h2>
    <ul>
      <li>You are responsible for the accuracy of the information you enter and for the actions of every user you invite.</li>
      <li>Keep credentials confidential. Tell us immediately if you believe an account has been compromised.</li>
      <li>One account represents one business. Reselling access, or using one account for unrelated businesses, is not permitted.</li>
      <li>You must be at least 18 years old and legally able to enter into this agreement.</li>
    </ul>

    <h2>4. Subscription, trial, and payment</h2>
    <ul>
      <li>New accounts include a 14-day free trial. No payment details are required to begin.</li>
      <li>After the trial, continued use requires an active paid plan. Plan prices are shown on our pricing page and are exclusive of any applicable taxes.</li>
      <li>Subscriptions are billed monthly in advance and renew automatically until cancelled.</li>
      <li>If a payment fails we will notify you and retry. If it remains unpaid, access is suspended — not deleted — until it is settled.</li>
      <li>You may cancel at any time from Settings. Cancellation stops future charges; it does not refund the current period except as set out in our refund policy.</li>
      <li>We may change prices with at least 30 days' notice by email. Continuing to use the service after that notice period constitutes acceptance.</li>
    </ul>

    <h2>5. Messaging: your number, your responsibility</h2>
    <p>
      Messages are sent through the WhatsApp Business account you connect. That means:
    </p>
    <ul>
      <li>You are the sender. You are responsible for the content of your messages and for complying with WhatsApp's Business Messaging Policy and Meta's Commerce Policies.</li>
      <li>You pay Meta's messaging charges directly. Those charges are not part of your {brand.productName} subscription and we do not resell them.</li>
      <li>You must have a lawful basis to message each customer, and must honour opt-out requests. {brand.productName} records consent and enforces opt-outs, but the underlying obligation is yours.</li>
      <li>If Meta suspends or restricts your WhatsApp Business account, sending will stop. We cannot restore it on your behalf.</li>
      <li>Your plan includes a monthly allowance of automated messages processed by {brand.productName}. Sends beyond that allowance are blocked until the next month or an upgrade.</li>
    </ul>

    <h2>6. Customer payments</h2>
    <p>
      {brand.productName} records payments your customers make to you. It does not process, hold, or transmit
      that money. {brand.companyName} is not a payment institution, is not a party to any transaction between
      you and your customers, and has no liability for any dispute, chargeback, or shortfall arising from one.
    </p>

    <h2>7. Your data</h2>
    <p>
      You own the data you put into {brand.productName}, including your customer records. We process it only to
      provide the service, as described in our <a href="/privacy">privacy policy</a> and{" "}
      <a href="/data-processing">data processing terms</a>. You can export your customers and visits as CSV at
      any time, including after cancellation.
    </p>

    <h2>8. Acceptable use</h2>
    <p>You must not:</p>
    <ul>
      <li>Upload customer data you have no lawful basis to hold, or data obtained from a purchased list.</li>
      <li>Send unsolicited bulk marketing, or content that is unlawful, deceptive, harassing, or obscene.</li>
      <li>Attempt to access another business's data, probe or test our systems without written permission, or interfere with the service's operation.</li>
      <li>Reverse engineer the service, or use automated means to extract data at a scale that degrades it for others.</li>
      <li>Use the service to store payment card numbers, national identity card scans, or health records.</li>
    </ul>
    <p>
      We may suspend an account immediately where continued use presents a legal, security, or platform risk —
      for example a WhatsApp policy violation that endangers other businesses on the platform. We will tell you
      why.
    </p>

    <h2>9. Availability and support</h2>
    <p>
      We aim for high availability but do not guarantee uninterrupted service on any plan without a written
      service level agreement. Planned maintenance is scheduled outside Pakistani business hours where
      practical. Support is provided by email Monday to Saturday, 10am to 7pm PKT.
    </p>

    <h2>10. Changes to the service</h2>
    <p>
      We will keep improving the product, which sometimes means changing how a feature works. We will not remove
      a materially significant feature from your plan without at least 30 days' notice. Beta features are
      labelled as such and may change or be withdrawn.
    </p>

    <h2>11. Intellectual property</h2>
    <p>
      We retain all rights in the {brand.productName} software, brand, and documentation. You retain all rights
      in your data, your brand, and your message content. You grant us only the licence necessary to host,
      process, and display your data in order to run the service for you.
    </p>

    <h2>12. Limitation of liability</h2>
    <p>
      To the maximum extent permitted by law, neither party is liable for indirect, incidental, or consequential
      loss, or for lost profits, revenue, or goodwill. Our total liability arising from this agreement in any
      twelve-month period is limited to the fees you paid us in the twelve months before the claim. Nothing in
      this clause limits liability that cannot lawfully be limited.
    </p>
    <p>
      {brand.productName} is a record-keeping and messaging tool. It is not a substitute for your own accounting
      records, and we are not liable for business decisions taken on the basis of its reports.
    </p>

    <h2>13. Termination</h2>
    <p>
      You may terminate at any time by cancelling in Settings. We may terminate for material breach of these
      terms, or for non-payment, after giving you notice and a reasonable opportunity to fix it. On termination
      your access ends; we retain your data for 90 days so you can export it, then delete it on request or in
      the ordinary course.
    </p>

    <h2>14. Governing law</h2>
    <p>
      These terms are governed by the laws of the Islamic Republic of Pakistan, and the courts of Lahore have
      exclusive jurisdiction. We will try to resolve any dispute by discussion first.
    </p>

    <h2>15. Changes to these terms</h2>
    <p>
      We may update these terms. For material changes we will email account owners at least 30 days before they
      take effect. The date at the top of this page always reflects the current version.
    </p>
  </LegalPage>
);

export const PrivacyPage: FC = () => (
  <LegalPage
    title="Privacy policy"
    intro="What we collect, why we collect it, who else touches it, and what you can ask us to do about it."
  >
    <h2>1. Two kinds of people in this policy</h2>
    <p>
      {brand.productName} deals with two different groups, and the rules differ for each.
    </p>
    <ul>
      <li>
        <strong>Business users</strong> — salon owners and staff who log in. For their data we are the{" "}
        <em>controller</em>: we decide what to collect and why.
      </li>
      <li>
        <strong>Salon customers</strong> — the people whose visits are recorded. For their data the salon is the
        controller and we are the <em>processor</em>: we hold it on the salon's instructions and do not decide
        what happens to it. See our <a href="/data-processing">data processing terms</a>.
      </li>
    </ul>

    <h2>2. What we collect about business users</h2>
    <ul>
      <li>Account details: name, email address, phone number, role, and organization.</li>
      <li>Authentication data: a password hash (never the password), session records, and login timestamps.</li>
      <li>Security logs: IP address, browser user agent, and authentication events such as sign-ins, failed attempts, and password resets.</li>
      <li>Billing details: plan, invoices, and payment status. Card details are handled by our payment provider and never reach our servers.</li>
      <li>Support correspondence.</li>
    </ul>

    <h2>3. What salons store about their customers</h2>
    <p>
      A salon typically records a customer's name, phone number, optional birthday, visit history, amounts spent,
      loyalty points, message consent, and any notes staff add. Phone numbers are the customer's identifier
      because that is what a reception desk has.
    </p>
    <p>
      We do not require, and ask salons not to store, national identity numbers, payment card numbers, or health
      information.
    </p>

    <h2>4. Why we process it</h2>
    <ul>
      <li><strong>To provide the service</strong> — performance of our contract with you.</li>
      <li><strong>To keep accounts secure</strong> — rate limiting, session management, and audit logging, on the basis of our legitimate interest in preventing unauthorised access.</li>
      <li><strong>To bill you</strong> — performance of contract and our legal obligation to keep accounting records.</li>
      <li><strong>To support you</strong> — performance of contract.</li>
      <li><strong>To send service notices</strong> — trial expiry, failed payment, security alerts. These are not marketing and cannot be switched off while your account is active.</li>
    </ul>
    <p>
      We do not sell data, we do not share it with advertisers, and we do not use your customer records to train
      machine-learning models.
    </p>

    <h2>5. Who else processes it</h2>
    <ul>
      <li><strong>Cloudflare</strong> — hosting, the application database, and network protection.</li>
      <li><strong>Meta Platforms</strong> — WhatsApp message delivery, using the salon's own WhatsApp Business account. Message content and recipient numbers pass to Meta by necessity.</li>
      <li><strong>Resend</strong> — transactional email such as verification and password reset.</li>
      <li><strong>Our payment provider</strong> — subscription billing and card handling for business subscriptions only.</li>
    </ul>
    <p>
      Each is bound by its own terms and processes data only to deliver its part of the service. We will keep
      this list current; material additions are announced to account owners.
    </p>

    <h2>6. Where data is stored</h2>
    <p>
      Application data is stored on Cloudflare's infrastructure and may be replicated across regions outside
      Pakistan. Where data leaves Pakistan, it is protected by the contractual terms we hold with each provider.
    </p>

    <h2>7. How long we keep it</h2>
    <ul>
      <li>Customer and visit records: for as long as the salon's account is active, and 90 days after termination so the salon can export them.</li>
      <li>Session records: until expiry or sign-out, whichever is sooner.</li>
      <li>Security and authentication logs: 12 months.</li>
      <li>Message delivery logs: 12 months, then pruned automatically.</li>
      <li>Invoices and billing records: as long as Pakistani tax law requires.</li>
    </ul>

    <h2>8. How it is protected</h2>
    <ul>
      <li>Each organization's data is isolated at the data-access layer: a query cannot be issued without a tenant scope, so cross-tenant access is prevented structurally rather than by a filter someone could omit.</li>
      <li>Passwords are stored as PBKDF2 hashes with a per-user salt. We cannot read them.</li>
      <li>Session tokens are stored only as SHA-256 digests, so a database copy does not let anyone resume a session.</li>
      <li>WhatsApp credentials are encrypted with AES-GCM before storage and are never displayed again after entry.</li>
      <li>All traffic is served over HTTPS. Sign-in is rate limited by both address and account.</li>
      <li>Authentication and administrative actions are recorded in an audit log.</li>
    </ul>

    <h2>9. Your rights</h2>
    <p>
      You can ask us to give you a copy of your data, correct it, delete it, or restrict how we use it. Business
      users can email us; a salon's customer should contact the salon, which controls their record — we will
      forward and assist. We respond within 30 days.
    </p>
    <p>
      A salon customer can stop marketing messages immediately by tapping opt out in their points wallet, or by
      asking the salon.
    </p>

    <h2>10. Cookies</h2>
    <p>
      We use two cookies and no analytics or advertising trackers. A session cookie keeps you signed in to the
      dashboard. A wallet cookie remembers a customer's points wallet on their own device. Both are strictly
      necessary to provide what you asked for, which is why there is no consent banner.
    </p>

    <h2>11. Children</h2>
    <p>
      {brand.productName} is not for children. Salons should not create customer records for anyone under 13,
      and should hold a parent's consent before recording a minor's contact details.
    </p>

    <h2>12. Breach notification</h2>
    <p>
      If a breach affects your data we will tell affected account owners without undue delay and in any event
      within 72 hours of becoming aware, describing what happened, what data was involved, and what we are doing
      about it.
    </p>

    <h2>13. Contact</h2>
    <p>
      Privacy questions and requests: <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>,
      addressed to {brand.legalName}, {brand.country}.
    </p>
  </LegalPage>
);

export const RefundPage: FC = () => (
  <LegalPage
    title="Refund policy"
    intro="When we refund, when we do not, and how to ask."
  >
    <h2>Try before you pay</h2>
    <p>
      Every account starts with a 14-day free trial that requires no payment details. The trial is the intended
      way to decide whether {brand.productName} suits your salon, which is why our refund policy is
      straightforward rather than generous.
    </p>

    <h2>First paid month</h2>
    <p>
      If you pay for your first month and decide within 14 days that it is not for you, email us and we will
      refund that month in full. No explanation required. This applies once per business.
    </p>

    <h2>Later months</h2>
    <p>
      Subscriptions are billed monthly in advance. Cancelling stops the next charge and you keep access until
      the end of the period you have paid for. We do not refund part-months, and we do not refund a month you
      simply did not use.
    </p>

    <h2>When we will refund outside that</h2>
    <ul>
      <li>You were charged after cancelling.</li>
      <li>You were charged twice for the same period.</li>
      <li>A fault on our side made the service materially unusable for a sustained period and we could not fix it. We will refund pro rata for the affected days.</li>
    </ul>

    <h2>When we will not</h2>
    <ul>
      <li>Meta suspended or restricted your WhatsApp Business account, or refused your message templates. Your WhatsApp account is yours, and its standing is outside our control.</li>
      <li>Messaging charges billed to you by Meta. Those are never ours to refund.</li>
      <li>An account suspended for breach of our <a href="/terms">terms of service</a>.</li>
      <li>Downgrades. A downgrade takes effect at the end of the current month rather than generating a credit.</li>
    </ul>

    <h2>Annual and chain agreements</h2>
    <p>
      Multi-branch and annual arrangements are governed by the specific agreement signed with them, which
      overrides this page where the two differ.
    </p>

    <h2>How to request one</h2>
    <p>
      Email <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a> from the account owner's address
      with your salon name and the invoice concerned. We reply within two working days and approved refunds
      reach your original payment method within 7 to 10 working days, depending on your bank.
    </p>
  </LegalPage>
);

export const DataProcessingPage: FC = () => (
  <LegalPage
    title="Data processing terms"
    intro="The terms on which we process your customers' personal data on your behalf. These form part of our agreement with you."
  >
    <h2>1. Roles</h2>
    <p>
      For personal data about your customers, you are the controller and {brand.legalName} is the processor. You
      decide what to collect and why; we process it only to provide {brand.productName} to you and only on your
      documented instructions, which include your use of the product's features.
    </p>

    <h2>2. Subject matter and duration</h2>
    <p>
      Processing lasts for the term of your subscription plus the 90-day export window afterwards. The subject
      matter is the operation of customer records, loyalty, and messaging for your business.
    </p>

    <h2>3. Categories of data and data subjects</h2>
    <ul>
      <li><strong>Data subjects:</strong> your customers, and your staff members who use the product.</li>
      <li><strong>Data:</strong> names, phone numbers, optional dates of birth, visit and purchase history, amounts paid, loyalty balances, messaging consent and opt-out state, message delivery records, and free-text notes entered by your staff.</li>
      <li><strong>Special category data:</strong> none is required and none should be entered. Do not use notes fields for health information.</li>
    </ul>

    <h2>4. Our obligations</h2>
    <ul>
      <li>Process only on your instructions and for no independent purpose of our own.</li>
      <li>Keep the data confidential and limit internal access to personnel who need it to operate or support the service.</li>
      <li>Maintain the technical measures described in our <a href="/privacy">privacy policy</a>, including tenant isolation at the data-access layer, hashed credentials, and encryption of connected provider secrets.</li>
      <li>Assist you in responding to a data subject's request, and in any assessment you must carry out.</li>
      <li>Notify you without undue delay, and within 72 hours of becoming aware, of any breach affecting your data.</li>
      <li>On termination, delete or return the data at your choice, subject to any retention the law requires of us.</li>
    </ul>

    <h2>5. Your obligations</h2>
    <ul>
      <li>Have a lawful basis for every customer record you enter, and for every message you send.</li>
      <li>Obtain marketing consent before sending marketing messages, and tell customers who you are and how to stop.</li>
      <li>Keep records accurate, and act on opt-out and deletion requests you receive directly.</li>
      <li>Do not enter data you are not entitled to hold, including purchased or scraped lists.</li>
      <li>Configure staff roles so that access matches what each person needs.</li>
    </ul>

    <h2>6. Sub-processors</h2>
    <p>
      You authorise the sub-processors listed in section 5 of our <a href="/privacy">privacy policy</a>:
      Cloudflare (hosting and database), Meta Platforms (WhatsApp delivery through your own account), Resend
      (transactional email), and our subscription payment provider. We remain responsible for their performance.
      We will give you at least 30 days' notice before adding a sub-processor that handles your customer data,
      and you may terminate without penalty if you object.
    </p>

    <h2>7. International transfers</h2>
    <p>
      Data may be processed outside Pakistan by the sub-processors above. Each is bound by contractual terms
      requiring protection equivalent to that described here.
    </p>

    <h2>8. Audit</h2>
    <p>
      On reasonable written request, and no more than once a year, we will provide the information necessary to
      demonstrate compliance with these terms. Where an on-site audit is required by law we will cooperate,
      subject to confidentiality and the security of other customers' data.
    </p>

    <h2>9. Messaging specifically</h2>
    <p>
      When you connect your WhatsApp Business account, message content and recipient phone numbers are
      transmitted to Meta in order to be delivered. Meta processes that data under its own terms with you as the
      WhatsApp Business account holder — not under these terms. You are the sender of record.
    </p>

    <h2>10. Order of precedence</h2>
    <p>
      Where these terms conflict with our <a href="/terms">terms of service</a>, these terms prevail in respect
      of the processing of your customers' personal data.
    </p>
  </LegalPage>
);
