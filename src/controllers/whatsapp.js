const axios = require('axios');
const shopifyService = require('../services/shopify');

const BANK_INSTRUCTIONS = process.env.BANK_INSTRUCTIONS || "Por definirse";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

module.exports = {
    handleMessage: async (req, res) => {
        try {
            // 1. Verificación del Webhook (Lo que ya funcionaba)
            if (req.method === 'GET') {
                if (req.query['hub.mode'] === 'subscribe' &&
                    req.query['hub.verify_token'] === 'mm_verificacion_123') {
                    return res.status(200).send(req.query['hub.challenge']);
                }
                return res.sendStatus(403);
            }

            // 2. Procesar Mensaje Entrante (POST)
            const body = req.body;
            console.log('📨 Mensaje recibido:', JSON.stringify(body, null, 2));

            // Verificar si es un mensaje de texto de WhatsApp
            if (body.object === 'whatsapp_business_account' &&
                body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {

                const message = body.entry[0].changes[0].value.messages[0];
                const from = message.from; // Número del cliente
                const messageId = message.id;
                const textBody = message.text?.body || "";

                // Extraemos el ID del teléfono del negocio para saber a quién responder
                const phoneID = body.entry[0].changes[0].value.metadata.phone_number_id;

                // --- CEREBRO DEL BOT ---
                let responseText = "";

                // Lógica simple: Si dice "comprar" y trae un ID largo, compra. Si no, busca.
                // Ejemplo de compra: "comprar gid://shopify/ProductVariant/123456789"
                if (textBody.toLowerCase().startsWith('comprar') && textBody.includes('gid://')) {
                    // Intento de compra
                    const variantId = textBody.split(' ')[1]; // Tomamos lo que sigue a "comprar"
                    if (variantId) {
                        // Simulamos datos del cliente (En un bot real, se pedirían antes)
                        const customer = {
                            firstName: "Cliente",
                            lastName: "WhatsApp",
                            email: "pedido@whatsapp.com"
                        };

                        try {
                            const result = await shopifyService.crearPedidoManual([{ variantId, quantity: 1 }], customer);
                            responseText = `✅ *¡Pedido Creado!* \n\n📄 Orden: ${result.orderNumber}\n💰 Total: ${result.totalPrice}\n\n${BANK_INSTRUCTIONS}`;
                        } catch (error) {
                            console.error(error);
                            responseText = "❌ Hubo un error creando el pedido. Verifica que el ID sea correcto.";
                        }
                    } else {
                        responseText = "⚠️ Para comprar, envía: comprar [ID_DEL_PRODUCTO]";
                    }
                } else {
                    // Búsqueda de producto (Cualquier otro texto)
                    responseText = `🔎 Buscando "${textBody}" en la tienda...`;
                    // Enviamos mensaje de "escribiendo..." (opcional, pero buena UX)
                    // ...

                    const products = await shopifyService.buscarProductos(textBody);
                    if (products.length > 0) {
                        responseText = products.map(p =>
                            `📦 *${p.title}*\n💰 ${p.price} ${p.currency}\n🆔 ID para comprar: \`${p.variantId}\``
                        ).join('\n\n----------------\n\n');
                        responseText += "\n\n👇 *Para comprar, copia y pega el ID así:*\ncomprar gid://shopify/..."
                    } else {
                        responseText = `❌ No encontramos productos relacionados con "${textBody}". Intenta con otra palabra (ej: Collar, Alimento).`;
                    }
                }

                // 3. RESPONDER A WHATSAPP (La parte que faltaba)
                await axios({
                    method: 'POST',
                    url: `https://graph.facebook.com/v17.0/${phoneID}/messages`,
                    data: {
                        messaging_product: 'whatsapp',
                        to: from,
                        text: { body: responseText },
                        // Respondemos al mensaje específico (Reply)
                        context: { message_id: messageId }
                    },
                    headers: {
                        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                        'Content-Type': 'application/json'
                    }
                });
            }

            return res.sendStatus(200);

        } catch (error) {
            console.error('🔥 Error General:', error.response ? error.response.data : error.message);
            return res.sendStatus(500);
        }
    },

    // Mantenemos estas funciones por si las usas en los tests manuales
    processPurchase: async (items, customerData) => { /* ... lo mismo de antes ... */ },
    processSearch: async (keyword) => { /* ... lo mismo de antes ... */ }
};