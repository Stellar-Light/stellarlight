# Testing partner login

There are two sign-in paths for partners. One works **today**; the other needs
one secret set in Vercel.

## 1. Password login — works today (no Resend)

Payload's auth is live at `/api/partner-accounts/*`. Any account that has a
password can sign in immediately — no email delivery involved.

**Make a test account:** run the **Seed test partner** Action
(`.github/workflows/seed-test-partner.yml`) → it creates a dedicated **draft**
partner (`partner-test@stellarlight.xyz`) and prints the password in the run
log. Draft = invisible in the public directory and the `/api/partners`
contract, but the owner can still log in and use the whole dashboard.

**Log in:**

1. Go to `https://stellarlight.xyz/partners/dashboard`.
2. Click **"Have a password?"**.
3. Enter the test email + the password from the Action log → you land on the
   dashboard (profile editor, update-by-chat, leads, freshness, rank).

**Verify without a browser** (proves the whole auth path):

```bash
curl -si https://stellarlight.xyz/api/partner-accounts/login \
  -H 'content-type: application/json' \
  -d '{"email":"partner-test@stellarlight.xyz","password":"<from-log>"}' \
  | grep -iE 'HTTP/|set-cookie'
# 200 + a payload-token Set-Cookie = login works.
```

Re-run the Action any time to reset the password. Anke and any partner can be
given a password the same way (admin sets it in `/admin`, or via this script
with `TEST_PARTNER_EMAIL`).

## 2. Magic-link (passwordless) — needs `RESEND_API_KEY`

The primary path on the login card emails a sign-in link
(`POST /api/partners/magic-link`). The token is minted server-side regardless,
but the **email only sends once `RESEND_API_KEY` is set in Vercel** (without it,
the app falls back to a console adapter that logs instead of delivering).

Once the key is in Vercel:

1. On `/partners/dashboard`, enter a **published** partner's account email →
   "Email me a sign-in link".
2. The email lands on `/partners/reset-password?mode=signin`; following it signs
   you in.

Until then, use the password path above — it exercises the exact same
authenticated dashboard.
