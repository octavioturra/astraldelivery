export default {
	async fetch(request, env) {
		const VERIFY_TOKEN = env.VERIFY_TOKEN;
		const WHATSAPP_TOKEN = env.WHATSAPP_TOKEN;
		const url = new URL(request.url);

		if (request.method === 'GET') {
			const mode = url.searchParams.get('hub.mode');
			const verifyToken = url.searchParams.get('hub.verify_token');
			const challenge = url.searchParams.get('hub.challenge');

			if (mode === 'subscribe' && verifyToken === VERIFY_TOKEN) {
				return new Response(challenge, { status: 200 });
			}
			return new Response('Error, wrong validation token or mode', { status: 403 });
		}

		if (request.method === 'POST') {
			try {
				const body = await request.json();
				const entries = body.entry || [];

				for (const entry of entries) {
					for (const change of entry.changes) {
						const value = change.value;
						if (value && value.messages) {
							const phone_number_id = value.metadata.phone_number_id;
							for (const message of value.messages) {
								if (message.type === 'text') {
									const from = message.from;
									const message_body = message.text.body;
									const reply_message = `Ack from Cloudflare Worker: ${message_body}`;
									await sendReply(phone_number_id, WHATSAPP_TOKEN, from, reply_message);
								}
							}
						}
					}
				}
				return new Response('Done', { status: 200 });
			} catch (error) {
				return new Response('Error processing request', { status: 500 });
			}
		}

		return new Response('Unsupported method', { status: 403 });
	},
};

async function sendReply(phone_number_id, whatsapp_token, to, reply_message) {
	const url = `https://graph.facebook.com/v12.0/${phone_number_id}/messages?access_token=${whatsapp_token}`;
	const payload = {
		messaging_product: 'whatsapp',
		to: to,
		text: { body: reply_message },
	};

	await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload),
	});
}
