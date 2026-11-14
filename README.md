# 9iceMoney

9iceMoney is a secure digital wallet and financial services application built with Next.js, React and Firebase.

## Development

```bash
npm install
npm run dev
``

Open http://localhost:3000.

## Production build

```bash
npm run build
``

## Branding configuration

- Global application name and default receipt branding: `src/lib/ConfigContext.tsx`
- Browser metadata: `src/app/layout.tsx`
- Installable PWA identity: `src/app/manifest.ts`
- Email and security communication defaults: `src/lib/communication-defaults.ts`
- Admin-configurable logo and receipt branding: Admin Control Panel settings

## Compatibility and migration safety

This rebrand changes customer-facing names and package metadata only. Do not rename Firebase project identifiers, authentication domains, Firestore collections or fields, environment variable names, payment-provider URLs, webhook routes, API contracts, existing user IDs, transaction references, or deployed service URLs without a separately planned migration. Existing logo artwork and verified support contact addresses are intentionally retained until approved replacement assets and contact/domain details are supplied.

## Payment gateway

The backend payment gateway is maintained in the separate `payment-gateway-9ice-money` repository. Provider credentials must remain server-side and must never be exposed in browser configuration.

## Authentication OTP security configuration

Configure a server-only secret in the deployment environment before deploying the OTP hardening changes:

- `OTP_HMAC_SECRET`: a cryptographically random value of at least 32 bytes. Generate one with `openssl rand -hex 32`.
- Keep this value private. Do not prefix it with `NEXT_PUBLIC_`, commit it to Git, or expose it to browser code.
- Configure the same value in every production deployment that serves this application (including preview/staging deployments that need to issue and verify OTPs).
- The application can temporarily use the existing server-side `CPANEL_SESSION_SECRET` or `JWT_SECRET` when `OTP_HMAC_SECRET` is not set, but the dedicated `OTP_HMAC_SECRET` is recommended.

OTP endpoints fail closed if no server secret of sufficient length is configured. Existing outstanding OTPs issued before this change may need to be requested again after deployment because their hashes used the previous scheme.
