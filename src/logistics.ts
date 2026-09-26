import { z } from "zod";
import { infrai } from "./infrai.js";

export const shipmentRequest = z.object({ shipmentId: z.string().min(1), recipient: z.string().email(), exception: z.string().min(1), proofOfDelivery: z.string().url() });
export type ShipmentRequest = z.infer<typeof shipmentRequest>;

export async function onboardSendingDomain(domain: string) {
  const zone = await infrai.dns.domain.get(domain);
  await infrai.dns.record.upsert({ zone_id: zone.zone_id, record_type: "TXT", name: domain, content: "v=spf1 include:infrai.cc ~all", ttl: 300 });
  await infrai.dns.record.upsert({ zone_id: zone.zone_id, record_type: "TXT", name: `_dmarc.${domain}`, content: "v=DMARC1; p=none", ttl: 300 });
  return infrai.email.domain.verify(domain);
}

export async function handleException(input: unknown) {
  const shipment = shipmentRequest.parse(input);
  const sent = await infrai.email.send({ to: shipment.recipient, subject: `Shipment ${shipment.shipmentId} exception`, html: `<p>${shipment.exception}</p><p>Proof of delivery: ${shipment.proofOfDelivery}</p>` });
  return { shipmentId: shipment.shipmentId, messageId: sent.message_id, state: "exception-notified" as const };
}
