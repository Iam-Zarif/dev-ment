# Dev-ment API — Postman

API documentation synchronized against the backend routes and validation schemas in `src/app/routes` and `src/app/modules`.

## Import

1. In Postman, import **`Dev-ment.postman_collection.json`** to access all API modules in one collection. The individual module files (`auth.json`, `assessment.json`, etc.) can alternatively be imported separately.
2. Import **`Dev-ment.postman_globals.json`** for shared IDs, credentials and role tokens. Alternatively select `OPTIONAL_Dev-ment.postman_environment.json` for a local `baseUrl`.
3. Set `baseUrl` to `http://localhost:5001/api/v1` (local) or `https://dev-ment.vercel.app/api/v1` (deployed), using a Postman environment to override the collection default.
4. Supply valid test-account credentials. Call `Auth → Login`, `Login Recruiter`, or `Login Admin`; copy `data.accessToken` from the response into `candidateToken`, `recruiterToken`, or `adminToken` respectively. `Get Me` uses the candidate token by default. Password values in versioned globals are examples, **not live account credentials**.
5. Copy UUIDs and tokens returned by APIs into the appropriate variables before running subsequent requests.

### Authentication

- Authenticated endpoints send `Authorization: Bearer {{candidateToken}}`, `{{recruiterToken}}`, or `{{adminToken}}` according to their required role.
- Login and OTP verification create an **HttpOnly `devment_refresh_token` cookie**. `POST /auth/refresh` and `GET /auth/session` consume the cookie automatically from Postman's cookie jar; **do not send refreshToken in JSON**. Refresh rotates the session; the session-check endpoint does not.
- Logout requires both a Bearer access token and the refresh cookie. Since the cookie jar is shared per host, logging in as another role can replace the active refresh cookie; re-login as the relevant role before testing refresh/logout.
- Password reset OTP verification sets a separate HttpOnly reset cookie used by the bodyless-token `POST /auth/reset-password` flow (body contains only new password and confirmation).
- Variables and cookies containing real access tokens or passwords are sensitive. Do not commit exported collections with live values.

### Workflows

**Recruiter:** Login → create a question → create/sync assessment draft → attach questions → publish → review applications → shortlist → invite → evaluate and release submitted results.

**Candidate:** Login → browse published assessments → apply → wait for invitation → accept by email token or owned invitation ID → start attempt → save MCQ/text/coding answers → submit → view released result.

**Billing:** Recruiter fetches plans and starts Stripe Checkout. The success redirect is *not* proof of payment: the signed Stripe webhook updates the payment and grants credits. Verify `GET /payments/checkout-session/{{stripeSessionId}}` (owner-only) and `GET /payments/credits`. The Postman webhook entry documents the route; use Stripe's legitimate webhook tooling rather than manually sending unsigned webhooks.

## API conventions

- Base prefix: `/api/v1`. Service health check: `GET /health` (outside the API prefix).
- Successful responses follow `{ "success": true, "message": "...", "data": ... }`.
- Error responses follow `{ "success": false, "message": "...", "errors": [...] }`. Expected failures may include 400 (validation), 401 (authentication), 403 (permissions), 404 (not found), 409 (conflict), 429 (rate limit).
- Query pagination typically uses `page` and `limit`; available filters differ by module and are defined by the matching backend Zod validation schema.
- The sample URLs and request bodies show accepted fields. Optional fields may be omitted; schemas using `.strict()` reject unexpected properties.
- Some requests update or remove data. Run against disposable test records.

## Documentation consistency check

Run from the **backend repository root**:

```bash
node docs/postman/check-coverage.mjs
```

The check compares registered Express route methods and paths with the individual collections and with the combined collection; validates example JSON bodies; and checks unresolved Postman variable names. It is a **static documentation check**, not an authenticated live API integration test.

Backend repository: https://github.com/Iam-Zarif/dev-ment
