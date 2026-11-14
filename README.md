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
