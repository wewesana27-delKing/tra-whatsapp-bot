// TRA WhatsApp Chatbot - Demo MVP
// Inatumia Meta WhatsApp Cloud API + keyword matching (hakuna gharama ya AI kwa demo hii)

const express = require("express");
const axios = require("axios");
const faq = require("./data/faq.json");
const offices = require("./data/offices.json");

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "tra_demo_token";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// --- Hatua 1: Meta inathibitisha webhook yako (GET) ---
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook imethibitishwa.");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// --- Hatua 2: Ujumbe unaoingia kutoka kwa mtumiaji (POST) ---
app.post("/webhook", async (req, res) => {
  // Jibu haraka Meta ili isirudie kutuma tena ujumbe huo
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];
    if (!message || message.type !== "text") return;

    const from = message.from; // namba ya mtumiaji
    const text = message.text.body;

    const reply = buildReply(text);
    await sendWhatsAppMessage(from, reply);
  } catch (err) {
    console.error("Hitilafu kuchakata ujumbe:", err.message);
  }
});

// --- Logic ya kutafuta jibu sahihi (FAQ au Ofisi) ---
function normalize(str) {
  return str.toLowerCase().trim();
}

function buildReply(userText) {
  const text = normalize(userText);

  // 1) Angalia kama swali linahusu ofisi/mkoa
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
  if (text.includes("call centre") || text.includes("huduma kwa wateja")) {
    return (
      `${offices.call_centre.jina}\n` +
      `Namba: ${offices.call_centre.namba.join(", ")}\n` +
      `Masaa: ${offices.call_centre.masaa}`
    );
  }

  // 2) Angalia FAQ kwa kulinganisha keywords
  let bestMatch = null;
  let bestScore = 0;
  for (const item of faq) {
    const score = item.keywords.reduce(
      (acc, kw) => acc + (text.includes(normalize(kw)) ? 1 : 0),
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

  // 3) Hakuna mfanano - jibu la default
  return (
    "Samahani, sijaelewa swali lako vizuri. Unaweza kuuliza kuhusu TIN, VAT, " +
    "EFD, kodi ya mapato, tax clearance, au jina la mkoa kupata namba ya ofisi ya TRA. " +
    `Vinginevyo piga simu ${offices.call_centre.namba[0]} (bure).`
  );
}

// --- Kutuma jibu kurudi WhatsApp kupitia Meta Cloud API ---
async function sendWhatsAppMessage(to, body) {
  const url = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;
  await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to,
      text: { body },
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server inaendesha kwenye port ${PORT}`));
