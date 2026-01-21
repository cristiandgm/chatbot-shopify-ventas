const axios = require('axios');
const admin = require('firebase-admin');
const path = require('path');
const shopifyService = require('../services/shopify');
const aiService = require('../services/ai'); // Ajusta la ruta si es necesario

// Configuración Firebase (Igual que antes)
const serviceAccount = require(path.join(__dirname, '../../firebase-key.json'));
if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

module.exports = {
    handleMessage: async (req, res) => {
        try {
            // Verificación Webhook (Igual)
            if (req.method === 'GET') {
                if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === 'mm_verificacion_123') {
                    // LOG NUEVO: Confirmación visual de verificación
                    console.log("✅ Webhook verificado correctamente con Facebook.");
                    return res.status(200).send(req.query['hub.challenge']);
                } return res.sendStatus(403);
            }

            const body = req.body;
            if (body.object !== 'whatsapp_business_account' || !body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
                return res.sendStatus(200);
            }

            const message = body.entry[0].changes[0].value.messages[0];
            const from = message.from;
            const textBody = message.text?.body?.trim() || "";
            const phoneID = body.entry[0].changes[0].value.metadata.phone_number_id;

            // --- INICIO DE RASTREO VISUAL ---
            console.log("\n========================================================");
            console.time("⏱️ Tiempo Total de Respuesta"); // Inicia cronómetro
            console.log(`📨 MENSAJE ENTRANTE de ${from}`);
            console.log(`💬 Contenido: "${textBody}"`);
            // --------------------------------

            // 1. Firebase: Referencias
            const userRef = db.collection('clientes').doc(from);
            const chatRef = userRef.collection('historial_chat');

            // 2. Guardar mensaje del USUARIO
            await chatRef.add({
                rol: 'usuario',
                texto: textBody,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            // LOG NUEVO
            console.log("💾 Mensaje del usuario guardado en Firebase.");

            // 3. Obtener o Crear Cliente
            const userDoc = await userRef.get();
            let userData;
            if (!userDoc.exists) {
                // LOG NUEVO
                console.log("🆕 Cliente nuevo detectado. Creando perfil...");
                userData = {
                    perfil: { nombre: message.profile?.name || "Amigo", shopifyCustomerId: "", esRecurrente: false },
                    estado_conversacion: { step: "escuchando", ultimoMensaje: new Date().toISOString() },
                    metadata: { necesitaAtencionHumana: false }
                };
                await userRef.set(userData);
            } else {
                userData = userDoc.data();
                // LOG NUEVO
                console.log(`👤 Perfil cargado: ${userData.perfil.nombre} | Modo Humano: ${userData.metadata.necesitaAtencionHumana ? 'ACTIVO' : 'INACTIVO'}`);
            }

            // 🚨 SI ESTÁ EN MODO HUMANO, IGNORAR AL BOT
            if (userData.metadata.necesitaAtencionHumana) {
                console.log("⏸️ Chat pausado (Modo Humano). Deteniendo ejecución del bot.");
                console.timeEnd("⏱️ Tiempo Total de Respuesta");
                console.log("========================================================\n");
                return res.sendStatus(200);
            }

            // 4. PREPARAR CONTEXTO PARA GEMINI
            // Traemos los últimos 6 mensajes para que tenga memoria reciente
            const historialSnapshot = await chatRef.orderBy('timestamp', 'desc').limit(6).get();
            // Invertimos para que queden en orden cronológico (Viejo -> Nuevo)
            const historialParaAI = historialSnapshot.docs.map(doc => doc.data()).reverse();

            // LOG NUEVO
            console.log(`📜 Historial recuperado: ${historialParaAI.length} mensajes previos para contexto.`);

            // 5. ✨ MAGIA DE IA ✨
            // Aquí Gemini piensa, busca en Shopify si hace falta y decide qué decir
            console.log("🚀 Enviando solicitud a Gemini...");
            const aiResponse = await aiService.generarRespuesta(textBody, historialParaAI, userData.perfil);

            let responseText = aiResponse.text;

            // LOG NUEVO: Ver qué decidió Gemini
            console.log(`🤖 Gemini respondió (Acción: ${aiResponse.action || 'Ninguna'}).`);

            // Si Gemini activó el "Botón de Pánico" (Escalar a Humano)
            if (aiResponse.action === "HANDOVER") {
                console.warn("🚨 ALERTA: Gemini solicitó pasar a humano.");
                userData.metadata.necesitaAtencionHumana = true;
                await userRef.update({ 'metadata.necesitaAtencionHumana': true });
            }

            // 6. Enviar respuesta a WhatsApp
            if (responseText) {
                console.log(`📤 Enviando mensaje a WhatsApp: "${responseText.substring(0, 50)}..."`); // Muestra los primeros 50 caracteres
                await axios({
                    method: 'POST',
                    url: `https://graph.facebook.com/v17.0/${phoneID}/messages`,
                    data: {
                        messaging_product: 'whatsapp',
                        to: from,
                        text: { body: responseText }
                    },
                    headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }
                });

                // Guardar respuesta del BOT
                await chatRef.add({
                    rol: 'bot',
                    texto: responseText,
                    timestamp: admin.firestore.FieldValue.serverTimestamp()
                });
                console.log("💾 Respuesta del bot guardada en Firebase.");
            }

            console.timeEnd("⏱️ Tiempo Total de Respuesta"); // Finaliza cronómetro
            console.log("========================================================\n");

            return res.sendStatus(200);

        } catch (error) {
            console.error('🔥 Error CRÍTICO en whatsapp.js:', error);
            console.timeEnd("⏱️ Tiempo Total de Respuesta"); // Aseguramos cerrar el cronómetro incluso en error
            return res.sendStatus(500);
        }
    }
};