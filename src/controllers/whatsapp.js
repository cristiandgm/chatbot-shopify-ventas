/**
 * ARCHIVO: src/controllers/whatsapp.js
 * DESCRIPCIÓN: Controlador maestro de mensajería.
 * Coordina la recepción de mensajes, la consulta de perfiles segmentados y la lógica de respuesta.
 * * MEJORAS INCLUIDAS:
 * - Manejo avanzado de errores para evitar cuellos de botella.
 * - Registro de historial optimizado con timestamps de servidor.
 * - Soporte para la nueva estructura de "Memoria Integral" segmentada.
 * - Validación estricta de tokens y seguridad del Webhook.
 */

const axios = require('axios');
const admin = require('firebase-admin');
const { db, obtenerOSetearCliente } = require('../services/database');
const aiService = require('../ai/index');

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

module.exports = {
    /**
     * Manejador central del Webhook de WhatsApp Cloud API.
     * Soporta verificación (GET) y recepción de mensajes (POST).
     */
    handleMessage: async (req, res) => {
        try {
            // 1. VERIFICACIÓN DE SEGURIDAD (Obligatorio para Meta)
            if (req.method === 'GET') {
                const mode = req.query['hub.mode'];
                const token = req.query['hub.verify_token'];
                const challenge = req.query['hub.challenge'];

                // Nota: Asegúrate de que este token coincida con tu configuración en Meta Dashboard
                if (mode === 'subscribe' && token === 'mm_verificacion_123') {
                    console.log("✅ Webhook verificado por Meta.");
                    return res.status(200).send(challenge);
                }
                return res.sendStatus(403);
            }

            // 2. VALIDACIÓN DE ESTRUCTURA DEL PAYLOAD
            const body = req.body;
            const messageData = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

            if (!messageData) {
                return res.sendStatus(200); // No es un mensaje de texto (ej. confirmación de lectura)
            }

            // Extracción de datos contextuales
            const from = messageData.from; // Número del cliente
            const textBody = messageData.text?.body?.trim() || "";
            const phoneID = body.entry[0].changes[0].value.metadata.phone_number_id;
            const nombreWhatsApp = body.entry[0].changes[0].value.contacts?.[0]?.profile?.name;

            // Si el mensaje está vacío (solo envió un emoji o archivo no soportado), ignoramos.
            if (!textBody) return res.sendStatus(200);

            // 3. RECUPERACIÓN DE LA MEMORIA DEL CLIENTE
            // Consultamos Firestore para traer el perfil y las notas de mascotas segmentadas
            const userData = await obtenerOSetearCliente(from, nombreWhatsApp);

            // 4. PROTOCOLO DE ATENCIÓN HUMANA (Handover)
            // Si el modo "Atención Humana" está activo, el bot se retira del flujo
            if (userData.metadata?.necesitaAtencionHumana) {
                console.log(`ℹ️ Canal silenciado: El cliente ${from} está en atención por un asesor.`);
                return res.sendStatus(200);
            }

            // 5. PERSISTENCIA EN EL HISTORIAL (Mensaje Usuario)
            const chatRef = db.collection('clientes').doc(from).collection('historial_chat');
            await chatRef.add({
                rol: 'usuario',
                texto: textBody,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            // 6. OBTENCIÓN DE CONTEXTO RECIENTE
            // Recuperamos los últimos 15 mensajes para que Ana no pierda el hilo
            const snapshot = await chatRef.orderBy('timestamp', 'desc').limit(15).get();
            const historial = snapshot.docs.map(doc => doc.data()).reverse();

            // 7. CONSULTA AL MOTOR DE IA (Ana Gabriela)
            // Pasamos los datos del perfil para que use su "Memoria Integral"
            const aiResponse = await aiService.generarRespuesta(
                textBody,
                historial,
                {
                    nombre: userData.perfil?.nombre || nombreWhatsApp,
                    notas_mascota: userData.notas_mascota || "",
                    whatsappId: from
                }
            );

            // 8. COMUNICACIÓN DE SALIDA (WhatsApp API)
            if (aiResponse.text) {
                try {
                    await axios.post(`https://graph.facebook.com/v17.0/${phoneID}/messages`, {
                        messaging_product: 'whatsapp',
                        to: from,
                        type: 'text',
                        text: { body: aiResponse.text }
                    }, {
                        headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
                    });

                    // Guardamos la respuesta de Ana en el historial
                    await chatRef.add({
                        rol: 'bot',
                        texto: aiResponse.text,
                        timestamp: admin.firestore.FieldValue.serverTimestamp()
                    });
                } catch (sendError) {
                    console.error("❌ Error enviando mensaje a Meta API:", sendError.response?.data || sendError.message);
                }
            }

            // 9. GESTIÓN DE ACCIONES ESPECIALES (Handover a Ventas)
            if (aiResponse.action === "HANDOVER_SALES") {
                await db.collection('clientes').doc(from).update({
                    'metadata.necesitaAtencionHumana': true,
                    'metadata.fechaHandover': admin.firestore.FieldValue.serverTimestamp(),
                    'metadata.ultimaActualización': admin.firestore.FieldValue.serverTimestamp()
                });
                console.log(`📡 Transferencia exitosa: Asesor humano notificado para el cliente ${from}.`);
            }

            return res.sendStatus(200);

        } catch (error) {
            console.error('🔥 Error crítico en el controlador de WhatsApp:', error);
            // Intentamos no dejar al cliente sin respuesta si algo falla internamente
            return res.sendStatus(500);
        }
    }
};