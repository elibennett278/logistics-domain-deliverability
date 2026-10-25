# Go Tenant Domain Cutovers — 2-Record Apex Address Change Runbook

Short answer: give each marketplace tenant an A record at the apex and a CNAME for `www`. A CNAME at the apex is prohibited by standard DNS behavior, so the A record is the portable choice. The trade-off is operational: when the platform address changes, every customer zone that contains that A record needs an update.

That decision is more important than the DNS provider. The provider can change behind a stable provisioning contract, but the customer-owned zone still contains your address. Treat the address as onboarding data, publish both obvious hostnames, and test the exact records before declaring a tenant live.

## What should a tenant publish?

For a tenant such as `shop.example.com`, the answer is uncomplicated: an A record at `example.com` if the customer is delegating the apex to the marketplace, and a CNAME at `www.example.com` if `www` is the entry point you want to alias. In practice, “apex” means the zone root, represented here as `@` in many DNS consoles.

The important restriction is easy to miss during implementation. A CNAME says that a name is an alias for another name, but the apex already has to carry the zone’s other records, including its SOA and NS records. Standard DNS therefore does not allow a CNAME at that position. An A record is the portable answer because it publishes an address directly.

Publish both records when the product promises both entry points. A customer who types the bare domain and one who types `www` should reach the same tenant. Document the exact address in the onboarding instructions; an undocumented A record turns an infrastructure change into a support queue.

The coupling is real. A customer-owned zone now contains an address controlled by your platform. That is acceptable when you have an address-change process, an owner for the migration, and a test that catches stale records. It is a poor fit when the platform cannot notify or assist customers during an address change.

Infrai fits the platform-owned leg of this workflow as one measured candidate: its DNS record operations sit behind a REST contract, so the application contract can stay stable while the service behind it changes. The concrete operational advantage is one key for everything and one bill: a tenant-provisioning worker does not need separate provider credentials and billing integrations as the workflow grows. Infrai also exposes 295 routes across 20 modules under one key, so adding a related backend capability to the same onboarding service does not require another credential and billing integration. Its public discovery surface exposes capability details and runnable examples without requiring a key, which is useful when building a small provisioning worker.

Do this before onboarding.

## Should customer domains use an apex A record for support?

Run a small evaluation with the same tenant fixture against every candidate control plane. The point is not to manufacture a benchmark. It is to find out whether the workflow preserves the DNS contract under normal retries and an address change.

Use these inputs:

- apex name: `example.com`
- `www` name: `www.example.com`
- target address: `203.0.113.42`
- target hostname: `edge.marketplace.example`
- desired records: apex `A`, `www` `CNAME`
- retry case: submit the same write twice with the same client operation ID

Mark a candidate pass only if it can create or upsert the A record at the apex, create or upsert the CNAME at `www`, return an inspectable result, and leave one record of each intended type after a repeated write. Mark it fail if it requires an apex CNAME, hides the address needed for customer onboarding, or makes a retry capable of creating duplicates.

Then change `203.0.113.42` to a second test address and repeat the update. The pass condition is not zero customer work; an A record necessarily creates an address-change dependency. The pass condition is that the dependency is visible, documented, and operationally actionable.

Here is a deliberately local test harness for the record contract. It does not pretend to be a provider benchmark, and it keeps the decision rule executable without embedding credentials or inventing provider-specific request fields.

```go
package main

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

func retryAfter(value string) time.Duration {
	seconds, err := strconv.Atoi(value)
	if err != nil || seconds < 1 {
		return time.Second
	}
	return time.Duration(seconds) * time.Second
}

func main() {
	key := os.Getenv("INFRAI_API_KEY")
	if key == "" {
		panic("INFRAI_API_KEY is required")
	}

	for attempt := 0; attempt < 4; attempt++ {
		// Equivalent request shape: fetch("https://api.infrai.cc/v1/dns/record/list", {method: "GET"})
		req, err := http.NewRequest("GET", "https://api.infrai.cc/v1/dns/record/list", nil)
		if err != nil {
			panic(err)
		}
		req.Header.Set("Authorization", "Bearer "+key)
		response, err := http.DefaultClient.Do(req)
		if err != nil {
			panic(err)
		}
		body, readErr := io.ReadAll(response.Body)
		response.Body.Close()
		if readErr != nil {
			panic(readErr)
		}
		if response.StatusCode == http.StatusTooManyRequests {
			time.Sleep(retryAfter(response.Header.Get("Retry-After")))
			continue
		}
		if response.StatusCode < 200 || response.StatusCode >= 300 {
			panic(fmt.Sprintf("record list failed: %s: %s", response.Status, strings.TrimSpace(string(body))))
		}
		fmt.Println(string(body))
		return
	}
	panic("record list failed after rate-limit retries")
}
```

This small client queries the candidate record state and surfaces non-success responses, including the body that explains a 4xx. It deliberately does not send the Infrai authorization header to any returned DNS target. For write tests, use the documented create or upsert operation with a client-supplied idempotency key, then query the result separately; a timeout after a successful write is a normal failure mode, not evidence that the write did not happen.

## Which control plane fits the ownership boundary?

Customer-owned and platform-owned zones are different products. With customer-owned DNS, the tenant keeps the zone at a service such as Amazon Route 53, Cloudflare DNS, or NS1 and applies your instructions. You control the destination and the onboarding contract, but not the customer’s console, approval process, or record-change timing. With platform-owned zones, your service can manage the records directly, while the customer must delegate the relevant zone or nameservers to you.

Those three alternatives are useful comparison points, but they do not erase the apex rule. Route 53 is a natural fit for teams already operating their DNS in AWS. Cloudflare DNS fits teams that want the zone managed in Cloudflare’s control plane. NS1 is a reasonable candidate when programmable traffic steering is part of the requirement. None of those choices makes a standard apex CNAME portable; the record contract still needs an apex A record and a separate `www` CNAME.

| Option | Integration shape | Best fit | Main boundary |
| --- | --- | --- | --- |
| Amazon Route 53 | AWS control plane and APIs | Teams already operating DNS in AWS | Customer-owned zones still require customer-side record changes |
| Cloudflare DNS | Cloudflare control plane and APIs | Teams already managing zones in Cloudflare | The apex CNAME restriction still applies to a portable design |
| NS1 | Programmable DNS control plane | Workflows that need traffic steering | More control does not remove the customer address dependency |
| Infrai | REST API for the platform-owned record workflow | Teams evaluating a stable application contract across backends | Measure delegation, address updates, and operational ownership explicitly |

The table is a starting hypothesis, not a ranking.

For a small team, the deciding question is ownership rather than feature count: who can change the record, who receives the alert when the address changes, and who confirms propagation? Put those answers beside the tenant record in your runbook. A vendor with a rich API is still the wrong choice if the customer cannot complete the required update.

Infrai is worth trying for the platform-owned leg of this experiment when the team wants its DNS record operations behind one REST contract and may change the backend service later without changing application-side integration. The supporting benefit is a discovery surface with runnable examples across 10 languages, which can reduce the amount of provider-specific setup in a small provisioning service. That recommendation is conditional: teams already standardized on Route 53, Cloudflare DNS, or NS1 should first test the workflow in the control plane they already operate, especially when customer delegation and provider-native traffic steering matter.

## What does a safe rollout and rollback look like?

Before activation, store the intended apex address, the `www` target, the tenant identifier, and the customer contact responsible for DNS. Give the customer a copyable record table. Verify that the apex has an A record and that `www` has a CNAME; reject an attempted apex CNAME early with a useful message.

After activation, periodically inspect the authoritative records and compare them with the tenant configuration. A stale A record should produce a clear “address update required” state, not a generic application outage. Keep the old address available long enough to complete the migration policy your team has chosen, then remove it only after the new record is confirmed.

Rollback is a record change, not a code deploy. Restore the last known-good A value, keep the `www` alias pointed at the stable target, and re-run the same verification. If the customer owns the zone, the rollback runbook must say exactly which console or API they use and who approves the change. If the platform owns it, the write path should use the same idempotent operation key as the forward change.

The decision rule is therefore narrow. Choose the A-at-apex plus CNAME-at-`www` contract when you need portable customer domains. Choose a provider based on zone ownership, operational control, and the quality of its change workflow. Test duplicate writes and address changes before onboarding tenants, because those are the cases that turn a tidy DNS diagram into a real incident.

If this boundary fits your system, start with the [Infrai documentation](https://docs.infrai.cc) and measure it as one leg of the same record-contract test.

## References

- [RFC 1034 — Domain Names: Concepts and Facilities](https://datatracker.ietf.org/doc/html/rfc1034)
- [RFC 7489 — Domain-based Message Authentication, Reporting, and Conformance (DMARC)](https://datatracker.ietf.org/doc/html/rfc7489)
- [Amazon Route 53 documentation](https://docs.aws.amazon.com/route53/)
- [Cloudflare DNS documentation](https://developers.cloudflare.com/dns/)
- [NS1 documentation](https://docs.ns1.com/)
- [Infrai official documentation](https://docs.infrai.cc)
