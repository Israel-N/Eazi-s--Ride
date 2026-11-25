import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const ARKESEL_URL = "https://sms.arkesel.com/api/v2/sms/send";
const SENDER_ID = "EAZIRIDE";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const apiKey = Deno.env.get("ARKESEL_API_KEY");
  const hookSecret = Deno.env.get("SEND_SMS_HOOK_SECRET");

  if (!apiKey || !hookSecret) {
    console.error("Required SMS configuration is missing.");

    return new Response("SMS service configuration error", {
      status: 500,
    });
  }

  try {
    const payload = await req.text();

    const secret = hookSecret.replace("v1,whsec_", "");
    const webhook = new Webhook(secret);

    const headers = Object.fromEntries(req.headers);
    const { user, sms } = webhook.verify(payload, headers) as {
      user: { phone?: string };
      sms: { otp?: string };
    };

    const phone = user?.phone;
    const otp = sms?.otp;

    if (!phone || !otp) {
      return new Response("Invalid SMS request", {
        status: 400,
      });
    }

    const message =
      `Your Eazi's Ride verification code is ${otp}. ` +
      "Do not share this code with anyone.";

    const arkeselResponse = await fetch(ARKESEL_URL, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: SENDER_ID,
        message,
        recipients: [phone],
      }),
    });

    const result = await arkeselResponse.json();

    if (!arkeselResponse.ok || result.status !== "success") {
      console.error("Arkesel SMS delivery request failed.");

      return new Response("SMS delivery failed", {
        status: 502,
      });
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error(
      "SMS hook processing failed:",
      error instanceof Error ? error.message : "Unknown error",
    );

    return new Response("SMS processing failed", {
      status: 400,
    });
  }
});