/**
 * ARCHIVO: controllers/whatsapp.js
 * DESCRIPCIÓN: Controlador principal de mensajería. 
 * Gestiona la recepción de mensajes, consulta de perfiles y envío de respuestas de IA.
 */

const axios = require('axios');
const admin = require('firebase-admin');
const { db, obtenerOSetearCliente } = require('../services/database');
const aiService = require('../ai/index');

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

module.exports = {
    /**
     * Manejador principal de eventos de WhatsApp (Webhook).
     */
    handleMessage: async (req, res) => {
        try {
            // 1. VERIFICACIÓN DEL WEBHOOK (Requerido por Meta para validar el servidor)
            if (req.method === 'GET') {
                if (req.query['hub.verify_token'] === 'mm_verificacion_123') {
                    return res.status(200).send(req.query['hub.challenge']);
                }
                return res.sendStatus(403);
            }

            // 2. VALIDACIÓN DE ESTRUCTURA DEL MENSAJE
            const body = req.body;
            if (body.object !== 'whatsapp_business_account' || !body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
                return res.sendStatus(200);
            }

            // Extracción de datos básicos del mensaje entrante
            const message = body.entry[0].changes[0].value.messages[0];
            const from = message.from; // Número de teléfono del cliente
            const textBody = message.text?.body?.trim() || "";
            const phoneID = body.entry[0].changes[0].value.metadata.phone_number_id;
            const nombreWhatsApp = body.entry[0].changes[0].value.contacts?.[0]?.profile?.name;

            // 3. RECUPERACIÓN DEL PERFIL DEL CLIENTE
            // Consultamos Firebase para obtener el nombre y la memoria (notas_mascota)
            const userData = await obtenerOSetearCliente(from, nombreWhatsApp);

            // 4. CONTROL DE ESTADO (Handover)
            // Si un humano ya tomó el control del chat, el bot se mantiene en silencio
            if (userData.metadata?.necesitaAtencionHumana) {
                console.log(`ℹ️ Bot silenciado: El cliente ${from} está bajo atención humana.`);
                return res.sendStatus(200);
            }

            // 5. REGISTRO EN EL HISTORIAL (Mensaje del Usuario)
            const chatRef = db.collection('clientes').doc(from).collection('historial_chat');
            await chatRef.add({
                rol: 'usuario',
                texto: textBody,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            // 6. OBTENCIÓN DE CONTEXTO RECIENTE
            // Recuperamos los últimos 15 mensajes para que la IA entienda el hilo de la charla
            const snapshot = await chatRef.orderBy('timestamp', 'desc').limit(15).get();
            const historial = snapshot.docs.map(doc => doc.data()).reverse();

            // 7. GENERACIÓN DE RESPUESTA CON LA IA
            // Pasamos el mensaje, el historial y los datos del perfil (incluyendo memoria integral)
            const aiResponse = await aiService.generarRespuesta(
                textBody,
                historial,
                {
                    nombre: userData.perfil?.nombre || nombreWhatsApp,
                    notas_mascota: userData.notas_mascota || "",
                    whatsappId: from // Necesario para que la IA sepa a quién actualizarle las notas
                }
            );

            // 8. ENVÍO DE RESPUESTA A WHATSAPP
            if (aiResponse.text) {
                await axios.post(`https://graph.facebook.com/v17.0/${phoneID}/messages`, {
                    messaging_product: 'whatsapp',
                    to: from,
                    text: { body: aiResponse.text }
                }, { headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` } });

                // Guardamos la respuesta del bot en Firebase para mantener el historial completo
                await chatRef.add({
                    rol: 'bot',
                    texto: aiResponse.text,
                    timestamp: admin.firestore.FieldValue.serverTimestamp()
                });
            }

            // 9. GESTIÓN DE TRANSFERENCIA A VENTAS (Si la IA lo decide)
            if (aiResponse.action === "HANDOVER_SALES") {
                await db.collection('clientes').doc(from).update({
                    'metadata.necesitaAtencionHumana': true,
                    'metadata.fechaHandover': admin.firestore.FieldValue.serverTimestamp()
                });
                console.log(`📡 Cliente ${from} marcado para atención humana de ventas.`);
            }

            return res.sendStatus(200);

        } catch (error) {
            console.error('🔥 Error crítico en whatsapp.js:', error);
            return res.sendStatus(500);
        }
    }
};