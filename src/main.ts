import { handleException, onboardSendingDomain } from "./logistics.js";

const domain = process.env.SENDING_DOMAIN;
const recipient = process.env.DEMO_EMAIL_TO;
if (!domain || !recipient) throw new Error("SENDING_DOMAIN and DEMO_EMAIL_TO are required");

const verification = await onboardSendingDomain(domain);
const result = await handleException({ shipmentId: "SHP-1042", recipient, exception: "Address requires a delivery appointment", proofOfDelivery: "https://files.example.test/pod/SHP-1042" });
console.log({ verification: verification.verification.status, result });
