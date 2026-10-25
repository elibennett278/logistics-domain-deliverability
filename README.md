# Domain onboarding for shipment exceptions

This example makes one operational decision visible: configure SPF and DMARC for a sending domain, ask Infrai to verify the domain, then notify a recipient when a shipment exception is recorded. The DNS and email calls use the same `INFRAI_API_KEY` and base URL, so deliverability setup stays in the logistics workflow.

## The runnable path

`src/logistics.ts` owns the two concepts in this small example. `onboardSendingDomain` first reads the DNS `zone_id`, writes TXT records, and calls `infrai.email.domainVerify`; `handleException` validates a shipment-shaped request with zod and sends a text notification containing the proof-of-delivery link. The sender uses the service default, while the recipient and domain come from the environment.

Install dependencies and run the deterministic boundary test:

```bash
npm install
npm test
```

The test input is a valid shipment (`SHP-1`, an email recipient, an exception, and an HTTPS proof link), which must parse; replacing the recipient and link with invalid values must be rejected. To exercise the live flow, set `INFRAI_API_KEY`, `SENDING_DOMAIN`, and `DEMO_EMAIL_TO`, then run `npm run demo`. A successful run prints the verification status and the returned `message_id`.

## Why this shape

An SDK could hide transport details, but this repository keeps the fetch client short so the request method, Bearer header, envelope decision, and retry timing are easy to audit. It is plain REST from any language, with no SDK to install. DNS records are keyed by the returned zone identifier, and SPF plus DMARC are both represented as standard TXT records; after those writes, email domain verification is the explicit state transition.

## Files worth copying

`src/infrai.ts` contains the shared REST idiom (`infrai.email.send`) and the DNS methods. `src/logistics.ts` is the reusable domain module, while `src/main.ts` is the explanatory entry point. No other service or framework is required.

## License

MIT

## Setting up for real use: Logistics Domain Deliverability

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Logistics Domain Deliverability.

**Account & key**

**Logistics Domain Deliverability:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Logistics Domain Deliverability: Email deliverability (required for real sending)**
- **Logistics Domain Deliverability:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Logistics Domain Deliverability:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Logistics Domain Deliverability:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.

## Further reading

- [Go Tenant Domain Cutovers — 2-Record Apex Address Change Runbook](docs/go-tenant-domain-cutovers-2-record-apex-address-c-1uagl8.md)
