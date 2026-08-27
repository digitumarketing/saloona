/**
 * Authentication screens.
 *
 * These are server-rendered rather than part of the dashboard SPA: the sign-in
 * page is the first thing a returning owner sees every morning, and it should
 * paint before a JavaScript bundle downloads. Each form posts JSON to the same
 * `/api/auth/*` endpoints the SPA uses, so there is one code path for
 * authentication and no duplicated validation.
 *
 * The forms are ordinary HTML with a small progressive-enhancement script; if
 * the script fails to load the inputs still render and the browser still submits,
 * which is more than the previous build managed.
 */

import type { FC, PropsWithChildren } from "hono/jsx";
import { brand } from "../../shared/brand.js";
import { PLANS, formatPkr } from "../../shared/plans.js";
import { Logo } from "./layout.js";

/**
 * Shared submit handler for every auth form.
 *
 * Kept as one inline script rather than a bundle so the sign-in page has no
 * network dependency beyond the stylesheet. It reads `data-type` to send numbers
 * and booleans as the API expects, and maps a 422 `fields` map back onto the
 * inputs.
 */
export const AUTH_SCRIPT = `
(function () {
  var forms = document.querySelectorAll('form[data-json-form]');
  Array.prototype.forEach.call(forms, function (form) {
    var banner = form.querySelector('[data-alert]');
    var button = form.querySelector('button[type=submit]');
    var label = button ? button.textContent : '';
    var navigating = false;

    function clearErrors() {
      if (banner) { banner.textContent = ''; banner.hidden = true; banner.className = 'error-text'; }
      Array.prototype.forEach.call(form.querySelectorAll('[data-error-for]'), function (el) {
        el.textContent = ''; el.hidden = true;
      });
      Array.prototype.forEach.call(form.querySelectorAll('.input'), function (el) {
        el.classList.remove('input-error');
        el.removeAttribute('aria-invalid');
      });
    }

    function showBanner(message, kind) {
      if (!banner) return;
      banner.textContent = message;
      banner.hidden = false;
      banner.className = kind === 'ok'
        ? 'rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-800'
        : 'rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700';
      banner.setAttribute('role', kind === 'ok' ? 'status' : 'alert');
    }

    function showFields(fields) {
      Object.keys(fields).forEach(function (key) {
        var slot = form.querySelector('[data-error-for="' + key + '"]');
        var input = form.querySelector('[name="' + key + '"]');
        if (input) { input.classList.add('input-error'); input.setAttribute('aria-invalid', 'true'); }
        if (slot) { slot.textContent = fields[key]; slot.hidden = false; }
        else showBanner(fields[key], 'error');
      });
      var first = form.querySelector('.input-error');
      if (first) first.focus();
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      clearErrors();

      var payload = {};
      Array.prototype.forEach.call(form.elements, function (el) {
        if (!el.name || el.disabled) return;
        if (el.type === 'checkbox') { payload[el.name] = el.checked; return; }
        var value = el.value;
        if (value === '' && el.getAttribute('data-optional') === 'true') return;
        if (el.getAttribute('data-type') === 'number') { payload[el.name] = Number(value); return; }
        payload[el.name] = value;
      });

      if (button) { button.disabled = true; button.textContent = 'Please wait…'; }

      fetch(form.action, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      })
        .then(function (response) {
          return response.json().catch(function () { return {}; }).then(function (body) {
            return { status: response.status, body: body };
          });
        })
        .then(function (result) {
          if (result.status >= 200 && result.status < 300) {
            if (result.body.redirect) {
              // Leaves the button disabled: re-enabling it mid-navigation invites
              // a second submission on a slow connection.
              navigating = true;
              window.location.assign(result.body.redirect);
              return;
            }
            showBanner(result.body.message || 'Done.', 'ok');
            form.reset();
            return;
          }
          if (result.body.fields) { showFields(result.body.fields); }
          else { showBanner(result.body.error || 'Something went wrong. Please try again.', 'error'); }
        })
        .catch(function () {
          showBanner('Could not reach the server. Check your connection and try again.', 'error');
        })
        .then(function () {
          if (button && !navigating) { button.disabled = false; button.textContent = label; }
        });
    });
  });
})();
`;

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

const AuthLayout: FC<PropsWithChildren<{ title: string; subtitle: string; aside?: unknown }>> = ({
  title,
  subtitle,
  aside,
  children
}) => (
  <div class="grid min-h-full lg:grid-cols-[1fr_0.85fr]">
    <div class="flex flex-col justify-center px-5 py-12 sm:px-10">
      <div class="mx-auto w-full max-w-md">
        <a href="/" aria-label={`${brand.productName} home`}>
          <Logo />
        </a>
        <h1 class="mt-8 text-2xl">{title}</h1>
        <p class="mt-2 text-sm leading-6 text-ink-500">{subtitle}</p>
        <div class="mt-8">{children}</div>
      </div>
    </div>

    <aside class="hidden flex-col justify-center bg-ink-900 px-10 py-12 lg:flex">
      <div class="mx-auto max-w-sm text-ink-100">{aside ?? <DefaultAside />}</div>
    </aside>
  </div>
);

const DefaultAside: FC = () => (
  <>
    <p class="text-xs font-semibold uppercase tracking-[0.14em] text-brand-300">Why salons switch</p>
    <p class="mt-4 text-xl font-semibold leading-8 text-white">
      "We had 300 names in a register and no idea who had stopped coming. The first win-back list brought back
      eleven customers in a week."
    </p>
    <ul class="mt-8 space-y-3 text-sm text-ink-200">
      {[
        "See exactly who is overdue for a visit",
        "Messages from your own WhatsApp number",
        "Loyalty points with no plastic cards",
        "Customer payments stay in your account"
      ].map((item) => (
        <li class="flex gap-2.5">
          <span class="mt-2 size-1.5 shrink-0 rounded-full bg-brand-400" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  </>
);

interface FieldProps {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  autocomplete?: string;
  hint?: string;
  required?: boolean;
  inputmode?: "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search";
  optional?: boolean;
  defaultValue?: string;
}

const Field: FC<FieldProps> = ({
  name,
  label,
  type = "text",
  placeholder,
  autocomplete,
  hint,
  required = true,
  inputmode,
  optional,
  defaultValue
}) => (
  <div class="field">
    <label class="label" for={`f-${name}`}>
      {label}
      {optional ? <span class="ml-1 font-normal text-ink-400">(optional)</span> : null}
    </label>
    <input
      class="input"
      id={`f-${name}`}
      name={name}
      type={type}
      placeholder={placeholder}
      autocomplete={autocomplete}
      inputmode={inputmode}
      required={required}
      value={defaultValue}
      data-optional={optional ? "true" : undefined}
      aria-describedby={hint ? `h-${name}` : undefined}
    />
    {hint ? (
      <p class="hint" id={`h-${name}`}>
        {hint}
      </p>
    ) : null}
    <p class="error-text" data-error-for={name} hidden />
  </div>
);

const Alert: FC = () => <p class="error-text" data-alert hidden />;

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

export const LoginPage: FC<{ notice?: string }> = ({ notice }) => (
  <AuthLayout title="Sign in to Saloona" subtitle="Welcome back. Your at-risk list is waiting.">
    {notice ? <p class="mb-5 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-800">{notice}</p> : null}

    <form action="/api/auth/login" method="post" data-json-form class="space-y-5">
      <Alert />
      <Field name="email" label="Email address" type="email" autocomplete="username" placeholder="you@salon.pk" />
      <Field name="password" label="Password" type="password" autocomplete="current-password" />
      <button type="submit" class="btn-primary w-full">
        Sign in
      </button>
    </form>

    <div class="mt-6 flex items-center justify-between text-sm">
      <a href="/forgot-password" class="text-brand-700 hover:underline">
        Forgot your password?
      </a>
      <a href="/signup" class="text-ink-600 hover:text-ink-900">
        Create an account
      </a>
    </div>
  </AuthLayout>
);

export const SignupPage: FC<{ planId?: string }> = ({ planId }) => {
  const selected = PLANS.some((plan) => plan.id === planId) ? planId : "starter";

  return (
    <AuthLayout
      title="Start your 14-day free trial"
      subtitle="No card required. Add your salon, and you can be billing customers in fifteen minutes."
      aside={
        <>
          <p class="text-xs font-semibold uppercase tracking-[0.14em] text-brand-300">What happens next</p>
          <ol class="mt-5 space-y-5 text-sm text-ink-200">
            {[
              { t: "Your salon is created", d: "One branch to start. Add more later if you have them." },
              { t: "Add services and staff", d: "The setup checklist walks you through it." },
              { t: "Bill your first customer", d: "Points, records, and reminders start from that visit." },
              { t: "Connect WhatsApp when Meta verifies you", d: "Everything else works without it." }
            ].map((step, index) => (
              <li class="flex gap-3">
                <span class="tabular flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
                  {index + 1}
                </span>
                <span>
                  <span class="block font-medium text-white">{step.t}</span>
                  <span class="text-ink-300">{step.d}</span>
                </span>
              </li>
            ))}
          </ol>
          <p class="mt-8 text-xs text-ink-400">
            Trial ends automatically. We will email you three days before, and nothing is charged unless you
            choose a plan.
          </p>
        </>
      }
    >
      <form action="/api/auth/signup" method="post" data-json-form class="space-y-5">
        <Alert />

        <Field name="businessName" label="Salon name" placeholder="Glow Salon" autocomplete="organization" />
        <Field name="ownerName" label="Your name" placeholder="Ayesha Khan" autocomplete="name" />
        <Field name="email" label="Email address" type="email" autocomplete="username" placeholder="you@salon.pk" />
        <Field
          name="phone"
          label="Mobile number"
          type="tel"
          inputmode="tel"
          autocomplete="tel"
          placeholder="0300 1234567"
          hint="Pakistani mobile number. Used for account recovery, not marketing."
        />
        <Field name="city" label="City" placeholder="Lahore" optional required={false} />
        <Field
          name="password"
          label="Password"
          type="password"
          autocomplete="new-password"
          hint="At least 10 characters. A short phrase you will remember beats a complicated word."
        />

        <div class="field">
          <label class="label" for="f-planId">
            Plan
          </label>
          <select class="input" id="f-planId" name="planId">
            {PLANS.map((plan) => (
              <option value={plan.id} selected={plan.id === selected}>
                {plan.name} — {formatPkr(plan.pricePkr)}/month
              </option>
            ))}
          </select>
          <p class="hint">You are not charged during the trial and can change plan at any time.</p>
          <p class="error-text" data-error-for="planId" hidden />
        </div>

        <button type="submit" class="btn-primary w-full">
          Create my salon
        </button>

        <p class="text-xs leading-5 text-ink-400">
          By creating an account you agree to our <a class="text-brand-700 underline" href="/terms">terms of service</a>{" "}
          and <a class="text-brand-700 underline" href="/privacy">privacy policy</a>.
        </p>
      </form>

      <p class="mt-6 text-sm text-ink-600">
        Already have an account?{" "}
        <a href="/login" class="text-brand-700 hover:underline">
          Sign in
        </a>
      </p>
    </AuthLayout>
  );
};

export const ForgotPasswordPage: FC = () => (
  <AuthLayout
    title="Reset your password"
    subtitle="Enter the email address you signed up with and we will send you a link."
  >
    <form action="/api/auth/password/forgot" method="post" data-json-form class="space-y-5">
      <Alert />
      <Field name="email" label="Email address" type="email" autocomplete="username" placeholder="you@salon.pk" />
      <button type="submit" class="btn-primary w-full">
        Send reset link
      </button>
      <p class="hint">
        For security we give the same answer whether or not an address is registered. Check your spam folder if
        nothing arrives within a few minutes.
      </p>
    </form>

    <p class="mt-6 text-sm">
      <a href="/login" class="text-brand-700 hover:underline">
        Back to sign in
      </a>
    </p>
  </AuthLayout>
);

export const ResetPasswordPage: FC<{ token: string }> = ({ token }) => (
  <AuthLayout title="Choose a new password" subtitle="This link works once and expires after an hour.">
    {token ? (
      <form action="/api/auth/password/reset" method="post" data-json-form class="space-y-5">
        <Alert />
        <input type="hidden" name="token" value={token} />
        <Field
          name="password"
          label="New password"
          type="password"
          autocomplete="new-password"
          hint="At least 10 characters."
        />
        <button type="submit" class="btn-primary w-full">
          Update password
        </button>
        <p class="hint">Signing in again on your other devices will be required.</p>
      </form>
    ) : (
      <div class="card card-body">
        <p class="text-sm text-ink-600">
          This reset link is missing its token, which usually means the email client trimmed the URL. Request a
          new link and open it directly.
        </p>
        <a href="/forgot-password" class="btn-primary mt-5 self-start">
          Request a new link
        </a>
      </div>
    )}
  </AuthLayout>
);

export const VerifyEmailPage: FC<{ ok: boolean }> = ({ ok }) => (
  <AuthLayout
    title={ok ? "Email confirmed" : "That link did not work"}
    subtitle={
      ok
        ? "Thank you. Your account is verified and every feature is available."
        : "Verification links expire after 24 hours and can only be used once."
    }
  >
    <div class="card card-body">
      {ok ? (
        <>
          <p class="text-sm leading-6 text-ink-600">
            You can head straight to your dashboard. If your salon is new, the setup checklist will show what is
            left to do.
          </p>
          <a href="/app" class="btn-primary mt-5 self-start">
            Go to dashboard
          </a>
        </>
      ) : (
        <>
          <p class="text-sm leading-6 text-ink-600">
            Sign in and we will send a fresh verification email. Everything except email-based recovery works in
            the meantime.
          </p>
          <a href="/login" class="btn-primary mt-5 self-start">
            Sign in
          </a>
        </>
      )}
    </div>
  </AuthLayout>
);
