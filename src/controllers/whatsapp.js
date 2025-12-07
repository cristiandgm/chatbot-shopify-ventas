const shopifyService = require('../services/shopify');

const BANK_INSTRUCTIONS = process.env.BANK_INSTRUCTIONS || "Por definirse";

module.exports = {
    /**
     * Handle incoming WhatsApp messages
     * Note: This is a simplified handler simulating a conversation flow.
     * In a real scenario, you'd integrate with the WhatsApp Cloud API webhook structure.
     */
    handleMessage: async (req, res) => {
        try {
            // Structure depends on WhatsApp Cloud API webhook payload
            // For this refactor, we assume a standard body payload for testing or direct Webhook integration
            // req.body.entry[0].changes[0].value.messages[0]

            const body = req.body;

            // Basic validation for Webhook verification (GET request)
            if (req.method === 'GET') {
                const mode = req.query['hub.mode'];
                const token = req.query['hub.verify_token'];
                const challenge = req.query['hub.challenge'];

                if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
                    console.log('Webhook verified');
                    return res.status(200).send(challenge);
                } else {
                    return res.sendStatus(403);
                }
            }

            // POST request (Incoming messages)
            console.log('Incoming webhook:', JSON.stringify(body, null, 2));

            // Quick extraction (Simplified for demo purposes)
            // We assume the user sends text.
            // logic:
            // 1. "buscar [keyword]" -> shopify.buscarProductos
            // 2. "comprar [id] [cantidad]" -> shopify.crearPedidoManual (Very simplified)

            // Since the prompt asks for specific Logic:
            // "Cuando se concrete una venta... responder con formato exacto"
            // We need a way to trigger "crearPedidoManual".
            // For this simplified "Architect/Refactor", I will implement a parser.

            // MOCK implementation for the logic flow requested:
            // Real implementation would need a state machine/database to track user session context.

            // Check if it's a message
            if (body.object) {
                // Process message...
                // To avoid complex parsing of deep JSON in this snippet, 
                // we will assume a middleware or helper extracts the 'text' and 'sender'.
                // Here is a dummy response logic based on input keywords if we were to process it.

                // NOTE: The user prompt specifically asks for the "Logic of response".
                // It implies I should write the function that generates the response string.
            }

            // For the purpose of the requirement "Implementa la función...":
            // I will create a helper function that fulfills the business logic to generate the response text.

            return res.sendStatus(200);

        } catch (error) {
            console.error('Error handling message:', error);
            return res.sendStatus(500);
        }
    },

    /**
     * Process logic to create order and return formatted message
     * Call this from your webhook handler when purchase intent is confirmed.
     */
    processPurchase: async (items, customerData) => {
        try {
            const result = await shopifyService.crearPedidoManual(items, customerData);

            // Format: "✅ Pedido Registrado con Éxito: [Número de Orden] 💰 Total a Pagar: [Monto] 🏦 Instrucciones de Pago: [BANK_INSTRUCTIONS] 📸 Por favor, envía una foto..."

            const message = `✅ Pedido Registrado con Éxito: ${result.orderNumber} 💰 Total a Pagar: ${result.totalPrice} 🏦 Instrucciones de Pago: ${BANK_INSTRUCTIONS} 📸 Por favor, envía una foto del comprobante por aquí para despachar tu pedido.`;

            return message;
        } catch (error) {
            // 👇 ESTA ES LA PARTE IMPORTANTE: Imprimimos el error completo
            console.error('🔥 ERROR EN EL SERVIDOR:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));

            let errorDetail = error.message;
            if (error.response && error.response.body) {
                errorDetail = JSON.stringify(error.response.body, null, 2);
            }

            // Y devolvemos el detalle técnico para verlo en la terminal
            return "❌ ERROR DETALLADO: " + errorDetail;
        }
    },

    /**
     * Process search logic
     */
    processSearch: async (keyword) => {
        const products = await shopifyService.buscarProductos(keyword);
        if (products.length === 0) return "No encontramos productos con ese nombre.";

        return products.map(p =>
            `📦 ${p.title}\n🆔 ID: ${p.variantId}\n💰 ${p.price} ${p.currency}\n${p.available ? '✅ Disponible' : '❌ Agotado'}`
        ).join('\n\n');
    }
};
