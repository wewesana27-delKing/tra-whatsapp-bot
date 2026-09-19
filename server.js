// TRA WhatsApp Chatbot - Demo MVP
// Meta WhatsApp Cloud API + keyword matching

const express = require("express");
const axios = require("axios");
const faq = require("./data/faq.json");
const offices = require("./data/offices.json");

const app = express();

app.use(express.json());

// ======================================================
// ENVIRONMENT VARIABLES
// ======================================================

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "tra_demo_token";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// ======================================================
// WEBHOOK VERIFICATION - GET
// ======================================================

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("Webhook verification request imefika.");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook imethibitishwa.");
    return res.status(200).send(challenge);
  }

  console.log("Webhook verification imekataliwa.");
  return res.sendStatus(403);
});

// ======================================================
// INCOMING WHATSAPP MESSAGE - POST
// ======================================================

app.post("/webhook", async (req, res) => {
  // Jibu Meta haraka
  res.sendStatus(200);

  try {
    console.log("WhatsApp webhook imepokelewa.");

    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    // Kama hakuna message, usiendelee
    if (!message) {
      console.log("Webhook imefika lakini hakuna message.");
      return;
    }

    // Kwa sasa bot inashughulikia text tu
    if (message.type !== "text") {
      console.log("Message sio text:", message.type);
      return;
    }

    const from = message.from;
    const text = message.text.body;

    console.log(`Ujumbe kutoka ${from}: ${text}`);

    const reply = buildReply(text);

    console.log("Jibu la bot:", reply);

    await sendWhatsAppMessage(from, reply);

    console.log("Jibu limetumwa WhatsApp kikamilifu.");

  } catch (err) {
    console.error(
      "Hitilafu kuchakata ujumbe:",
      err.message
    );

    // Hii itaonyesha sababu halisi kutoka Meta
    if (err.response) {
      console.error(
        "Meta API status:",
        err.response.status
      );

      console.error(
        "Meta API error:",
        JSON.stringify(err.response.data, null, 2)
      );
    } else {
      console.error(
        "Error details:",
        err
      );
    }
  }
});

// ======================================================
// NORMALIZE TEXT
// ======================================================

function normalize(str) {
  return str.toLowerCase().trim();
}

// ======================================================
// BUILD BOT REPLY
// ======================================================

function buildReply(userText) {
  const text = normalize(userText);

  // ----------------------------------------------------
  // 1. OFISI / MKOA
  // ----------------------------------------------------

  const officeMatch = offices.mikoa.find((o) =>
    text.includes(normalize(o.mkoa))
  );

  if (officeMatch) {
    return (
      `Ofisi ya TRA - ${officeMatch.mkoa}\n` +
      `${officeMatch.sanduku_posta}\n` +
      `Simu: ${officeMatch.simu.join(", ")}`
    );
  }

  // ----------------------------------------------------
  // 2. CALL CENTRE
  // ----------------------------------------------------

  if (
    text.includes("call centre") ||
    text.includes("huduma kwa wateja")
  ) {
    return (
      `${offices.call_centre.jina}\n` +
      `Namba: ${offices.call_centre.namba.join(", ")}\n` +
      `Masaa: ${offices.call_centre.masaa}`
    );
  }

  // ----------------------------------------------------
  // 3. FAQ KEYWORD MATCHING
  // ----------------------------------------------------

  let bestMatch = null;
  let bestScore = 0;

  for (const item of faq) {
    const score = item.keywords.reduce(
      (acc, kw) =>
        acc + (text.includes(normalize(kw)) ? 1 : 0),
      0
    );

    if (score > bestScore) {
      bestScore = score;
      bestMatch = item;
    }
  }

  if (bestMatch && bestScore > 0) {
    return bestMatch.jibu;
  }

  // ----------------------------------------------------
  // 4. DEFAULT REPLY
  // ----------------------------------------------------

  return (
    "Samahani, sijaelewa swali lako vizuri. " +
    "Unaweza kuuliza kuhusu TIN, VAT, EFD, kodi ya mapato, " +
    "tax clearance, au jina la mkoa kupata namba ya ofisi ya TRA. " +
    `Vinginevyo piga simu ${offices.call_centre.namba[0]} (bure).`
  );
}

// ======================================================
// SEND WHATSAPP MESSAGE
// ======================================================

async function sendWhatsAppMessage(to, body) {

  const url =
    `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`;

  console.log("Tunatuma ujumbe kwenda:", to);

  try {

    const response = await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        to: to,
        type: "text",
        text: {
          body: body
        }
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log(
      "Meta API response:",
      JSON.stringify(response.data, null, 2)
    );

    return response.data;

  } catch (err) {

    console.error(
      "SEND WHATSAPP MESSAGE IMESHINDWA."
    );

    console.error(
      "HTTP status:",
      err.response?.status
    );

    console.error(
      "Meta response:",
      JSON.stringify(
        err.response?.data,
        null,
        2
      )
    );

    throw err;
  }
}

// ======================================================
// START SERVER
// ======================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(
    `Server inaendesha kwenye port ${PORT}`
  );
});
