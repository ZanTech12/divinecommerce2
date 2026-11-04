const getWhatsAppConfig = () => {
  const {
    WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_PHONE_NUMBER_ID,
    WHATSAPP_API_VERSION
  } = process.env;

  if (
    !WHATSAPP_ACCESS_TOKEN ||
    !WHATSAPP_PHONE_NUMBER_ID ||
    !WHATSAPP_API_VERSION
  ) {
    throw new Error(
      'WhatsApp API environment variables are incomplete.'
    );
  }

  if (!/^v\d+\.\d+$/.test(WHATSAPP_API_VERSION)) {
    throw new Error(
      'WHATSAPP_API_VERSION must be a supported Meta version, e.g. vXX.X.'
    );
  }

  return {
    accessToken: WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: WHATSAPP_PHONE_NUMBER_ID,
    apiVersion: WHATSAPP_API_VERSION
  };
};

export const sendWhatsAppText = async (to, message) => {
  const config = getWhatsAppConfig();

  const url =
    `https://graph.facebook.com/${config.apiVersion}/` +
    `${config.phoneNumberId}/messages`;

  const response = await fetch(url, {
    method: 'POST',

    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json'
    },

    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',

      text: {
        preview_url: false,
        body: message
      }
    })
  });

  const result = await response.json();

  if (!response.ok) {
    console.error('WhatsApp API error:', result);

    throw new Error(
      result?.error?.message ||
      'Unable to send WhatsApp message.'
    );
  }

  return result;
};

export const sendWhatsAppWelcome = async (phoneNumber) => {
  const message =
    'Welcome to Divine Solar Hub! ☀️\n\n' +
    'Thank you for contacting us.\n\n' +
    'I am your virtual shopping assistant. I can help you with:\n\n' +
    '1. Product information\n' +
    '2. Product prices\n' +
    '3. Product availability\n' +
    '4. Orders and enquiries\n\n' +
    'What product are you looking for?';

  return sendWhatsAppText(phoneNumber, message);
};