const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

export async function sendWhatsAppText(to: string, body: string) {
  if (!WHATSAPP_TOKEN) {
    throw new Error('Falta WHATSAPP_ACCESS_TOKEN');
  }

  if (!WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error('Falta WHATSAPP_PHONE_NUMBER_ID');
  }

  const res = await fetch(
    `https://graph.facebook.com/v23.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body },
      }),
    }
  );

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(
      data?.error?.message ||
        `No se pudo enviar WhatsApp (status ${res.status})`
    );
  }

  return data;
}