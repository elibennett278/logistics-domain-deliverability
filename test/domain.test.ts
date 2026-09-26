import assert from "node:assert/strict";
import { shipmentRequest } from "../src/logistics.js";

const parsed = shipmentRequest.safeParse({ shipmentId: "SHP-1", recipient: "ops@example.com", exception: "Dock closed", proofOfDelivery: "https://files.example.test/pod/SHP-1" });
assert.equal(parsed.success, true);
assert.equal(shipmentRequest.safeParse({ shipmentId: "SHP-1", recipient: "bad", exception: "Dock closed", proofOfDelivery: "x" }).success, false);
console.log("shipment boundary test passed");
