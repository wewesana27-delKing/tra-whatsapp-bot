// TRA WhatsApp Chatbot
// Inatumia Meta WhatsApp Cloud API + Claude AI (claude-haiku-4-5) kwa majibu
// yenye akili, yaliyofungiwa kwenye mambo ya kodi/TRA Tanzania pekee.
// Kama Claude AI itashindwa (mfano hakuna ANTHROPIC_API_KEY), bot inarudi
// kwenye keyword-matching rahisi (keywordFallback) badala ya kunyamaza kabisa.

const express = require("express");
const axios = require("axios");
const faq = require("./data/faq.json");
const offices = require("./data/offices.json");

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "tra_demo_token";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ======================================================
// CLAUDE AI - JIBU LENYE "AKILI", LIMEFUNGIWA TRA/KODI TU
// ======================================================

const KNOWLEDGE_BASE = JSON.stringify({ faq, offices });

const SYSTEM_PROMPT = `
Wewe ni msaidizi wa kidijitali wa TRA (Tanzania Revenue Authority) kwenye WhatsApp.

MUHIMU - MIPAKA YAKO:
- Jibu MASWALI YA KODI NA TRA TU: TIN, VAT, EFD, kodi ya mapato, tax clearance,
  ofisi za TRA, forodha (customs), na taratibu nyingine za kodi Tanzania.
- Kama swali halihusiani na kodi/TRA kabisa (mfano: mpira, mapenzi, hali ya hewa,
  siasa, nchi nyingine), kataa kwa upole na umkumbushe mtumiaji kuwa wewe ni
  msaidizi wa mambo ya kodi ya TRA pekee.
- Usijibu maswali kuhusu taasisi nyingine za serikali isipokuwa yanahusiana moja
  kwa moja na kodi (mfano BRELA kwa usajili wa biashara unaruhusiwa kwa ufupi).

JINSI YA KUJIBU:
- Tumia taarifa zilizoko kwenye "KNOWLEDGE BASE" hapa chini kama chanzo chako kikuu
  cha ukweli (majibu ya FAQ na namba/anwani za ofisi). Usibuni namba za simu au
  taarifa ambazo hazipo kwenye knowledge base hii.
- Mtumiaji anaweza kuandika kwa makosa ya tahajia, lugha isiyo rasmi, mchanganyiko
  wa Kiswahili na Kiingereza, au kifupisho - elewa nia yake hata kama maneno
  hayajaandikwa sahihi kabisa (mfano "nataka tini", "vat ni ngapi%", "ofisi arsha").
- Jibu kwa Kiswahili cha kawaida, cha heshima, kifupi na wazi - kama afisa mzuri
  wa huduma kwa wateja, si kama roboti inayosoma script.
- Ukiwa na uhakika ni ofisi/mkoa gani analozungumzia licha ya kuandika kwa makosa,
  mpe taarifa za ofisi hiyo moja kwa moja.
- Kama huna uhakika kabisa mtumiaji anataka nini, muulize swali fupi la ufafanuzi
  badala ya kubahatisha.
- Usitumie alama za markdown kama ** au # - andika maandishi ya kawaida tu kwa
  sababu haya yanaenda WhatsApp.

KNOWLEDGE BASE (JSON):
${KNOWLEDGE_BASE}
`.trim();

async function askClaude(userText) {
  const response = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userText }],
    },
    {
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
    }
  );

  const textBlock = response.data.content.find((b) => b.type === "text");
  return textBlock ? textBlock.text.trim() : null;
}

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

    let reply;
    try {
      reply = await askClaude(text);
      if (!reply) throw new Error("Claude hakurudisha maandishi.");
    } catch (aiErr) {
      console.error(
        "Claude AI imeshindwa, tunatumia keyword fallback:",
        aiErr.message
      );
      reply = keywordFallback(text);
    }

    await sendWhatsAppMessage(from, reply);
  } catch (err) {
    console.error("Hitilafu kuchakata ujumbe:", err.message);
  }
});

// --- Fallback ya keyword-matching (inatumika TU kama Claude AI itashindikana,
//     kwa mfano ANTHROPIC_API_KEY haipo au huduma ya Anthropic ipo down) ---
function normalize(str) {
  return str.toLowerCase().trim();
}

function keywordFallback(userText) {
  const text = normalize(userText);

  // 1) Dar es Salaam ina kanda tano tofauti - tuzitofautishe na mikoa mingine
  if (
    text.includes("dar es salaam") ||
    text.includes("dar-es-salaam") ||
    text.includes(" dsm") ||
    text.startsWith("dsm")
  ) {
    const zones = offices.dar_es_salaam_zones
      .map((z) => `${z.kanda}: ${z.simu} (${z.anwani})`)
      .join("\n");
    return (
      `Dar es Salaam ina kanda tano za TRA - piga namba ya kanda iliyo karibu nawe:\n\n${zones}\n\n` +
      `Kama huna uhakika ni kanda gani, piga Call Centre: ${offices.call_centre.namba[0]} (bure).`
    );
  }

  // 2) Angalia kama swali linahusu ofisi/mkoa mwingine (pamoja na majina mbadala)
  const officeMatch = offices.mikoa.find((o) => {
    const names = [o.mkoa, ...(o.aliases || [])];
    return names.some((n) => text.includes(normalize(n)));
  });
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
