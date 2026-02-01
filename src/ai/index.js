/**
 * ARCHIVO: ai/index.js
 * DESCRIPCIÓN: Motor de IA de Ana Gabriela. 
 * Optimizado para capturar detalles importantes en cualquier momento de la charla.
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const toolsDefinition = require('./tools');
const prompts = require('./prompts');
const dbService = require('../services/database');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

module.exports = {
    generarRespuesta: async (mensajeUsuario, historialChat, perfilCliente) => {
        try {
            const model = genAI.getGenerativeModel({
                model: "gemini-2.0-flash",
                tools: toolsDefinition
            });

            // 1. LIMPIEZA DE HISTORIAL (Mantenemos 15 mensajes para contexto real)
            let historyFiltrado = historialChat
                .filter(m => m.texto && m.rol)
                .map(m => ({
                    role: m.rol === 'usuario' ? 'user' : 'model',
                    parts: [{ text: m.texto }]
                }))
                .slice(-15);

            while (historyFiltrado.length > 0 && historyFiltrado[0].role === 'model') {
                historyFiltrado.shift();
            }

            const notasPrevias = perfilCliente.notas_mascota || "";

            const chat = model.startChat({
                history: historyFiltrado,
                systemInstruction: {
                    role: 'system',
                    parts: [{ text: prompts.systemInstruction(perfilCliente) }]
                }
            });

            // 2. RESPUESTA AL CLIENTE
            const result = await chat.sendMessage(mensajeUsuario);
            const responseText = result.response.text();
            const call = result.response.functionCalls()?.[0];

            // 3. EXTRACCIÓN CON MEMORIA COMPLETA (CORREGIDO)
            if (!call) {
                try {
                    // Usamos TODO el historial disponible para no perder detalles como "agresivo"
                    const contextoTotal = historyFiltrado
                        .map(m => `${m.role === 'user' ? 'Cliente' : 'Ana'}: ${m.parts[0].text}`)
                        .join("\n");

                    const instruccionExtraccion = `
                        ESTADO DE LA MEMORIA ACTUAL: "${notasPrevias}"
                        
                        HISTORIAL DE LA CHARLA:
                        ${contextoTotal}
                        Último mensaje del cliente: "${mensajeUsuario}"
                        
                        TAREA: Revisa TODO el historial arriba. Si el cliente mencionó datos de comportamiento (ej: agresividad, incidentes), 
                        nombres de mascotas, ubicación o preferencias, redacta una versión actualizada de la memoria.
                        Si no hay NADA nuevo en todo el historial que no esté ya en la memoria, responde: SIN_CAMBIOS.
                    `;

                    const extractionResult = await model.generateContent(instruccionExtraccion);
                    const nuevasNotas = extractionResult.response.text().trim();

                    // Guardamos si hay algo nuevo y relevante
                    if (nuevasNotas && nuevasNotas !== "SIN_CAMBIOS" && nuevasNotas !== notasPrevias) {
                        // Aseguramos que el ID de WhatsApp sea el correcto
                        await dbService.actualizarNotasMascota(perfilCliente.whatsappId, nuevasNotas);
                        console.log(`✅ Memoria actualizada: ${nuevasNotas}`);
                    }
                } catch (e) {
                    console.error("⚠️ Error en extracción:", e.message);
                }
            }

            if (call && call.name === "escalarAVentas") {
                return {
                    text: "¡Qué nota! Mira, te paso con mi equipo de ventas para ayudarte con eso. ¡Dame un segundo! 🙋‍♀️",
                    action: "HANDOVER_SALES"
                };
            }

            return { text: responseText, action: null };

        } catch (error) {
            console.error("---------- ERROR CRÍTICO ----------");
            return { text: "¡Ay! Me distraje un segundo. ¿Me repites? 🐾", action: null };
        }
    }
};