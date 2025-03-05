import { DurableObject } from "cloudflare:workers";

/**
 * Welcome to Cloudflare Workers! This is your first Durable Objects application.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your Durable Object in action
 * - Run `npm run deploy` to publish your application
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/durable-objects
 */

/** A Durable Object's behavior is defined in an exported Javascript class */
export class WhatsappDurableObject extends DurableObject<Env> {
	/**
	 * The constructor is invoked once upon creation of the Durable Object, i.e. the first call to
	 * 	`DurableObjectStub::get` for a given identifier (no-op constructors can be omitted)
	 *
	 * @param ctx - The interface for interacting with Durable Object state
	 * @param env - The interface to reference bindings declared in wrangler.jsonc
	 */
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
	}

	async fetch(request: Request): Promise<Response> {
		let url = new URL(request.url);
		if (request.method === 'GET') {
			return this.handleVerification(url);
		} else if (request.method === 'POST') {
			return this.handleIncomingMessage(request);
		}
		return new Response('Unsupported method', { status: 403 });
	}

	async handleVerification(url: URL) {
		const VERIFY_TOKEN = this.env.VERIFY_TOKEN;
		const mode = url.searchParams.get('hub.mode');
		const token = url.searchParams.get('hub.verify_token');
		const challenge = url.searchParams.get('hub.challenge');

		if (mode === 'subscribe' && token === VERIFY_TOKEN) {
			return new Response(challenge, { status: 200 });
		}
		return new Response('Error, wrong validation token', { status: 403 });
	}

	async handleIncomingMessage(request: Request) {
		const WHATSAPP_TOKEN = this.env.WHATSAPP_TOKEN;
		const body: any = await request.json();
		const entries = body.entry || [];

		for (let entry of entries) {
			for (let change of entry.changes) {
				let value = change.value;
				if (value && value.messages) {
					for (let message of value.messages) {
						if (message.type === 'text') {
							let from = message.from;
							let messageBody = message.text.body;
							let replyMessage = 'Ack from Cloudflare Worker: ' + messageBody;
							await this.sendReply(value.metadata.phone_number_id, WHATSAPP_TOKEN, from, replyMessage);
						}
					}
				}
			}
		}

		return new Response('Done', { status: 200 });
	}

	async sendReply(phoneNumberId: string, whatsappToken: string, to: any, replyMessage: string) {
		const url = `https://graph.facebook.com/v12.0/${phoneNumberId}/messages?access_token=${whatsappToken}`;
		const payload = JSON.stringify({
			messaging_product: 'whatsapp',
			to: to,
			text: { body: replyMessage },
		});

		await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: payload,
		});
	}
}

export default {
	/**
	 * This is the standard fetch handler for a Cloudflare Worker
	 *
	 * @param request - The request submitted to the Worker from the client
	 * @param env - The interface to reference bindings declared in wrangler.jsonc
	 * @param ctx - The execution context of the Worker
	 * @returns The response to be sent back to the client
	 */
	async fetch(request, env, ctx): Promise<Response> {
		console.log("BODY", request.url);
		// We will create a `DurableObjectId` using the pathname from the Worker request
		// This id refers to a unique instance of our 'MyDurableObject' class above
		let id: DurableObjectId = env.WHATSAPP_DURABLE_OBJECT.idFromName(new URL(request.url).pathname);

		// This stub creates a communication channel with the Durable Object instance
		// The Durable Object constructor will be invoked upon the first call for a given id
		let stub = env.WHATSAPP_DURABLE_OBJECT.get(id);

		// We call the `handle()` RPC method on the stub to invoke the method on the remote
		// Durable Object instance
		const response = await stub.fetch(request);

		return response;
	},
} satisfies ExportedHandler<Env>;


