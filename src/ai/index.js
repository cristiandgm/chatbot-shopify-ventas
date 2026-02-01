/**
 * ARCHIVO: src/ai/index.js
 * DESCRIPCIÓN: Motor de Inteligencia Artificial de "Ana Gabriela".
 * Gestiona la conversación y la evolución de la Memoria de Largo Plazo del cliente.
 * * MEJORAS INCLUIDAS:
 * - Integración con Memoria de Largo Plazo (Ficha Técnica).
 * - Procesamiento asíncrono de extracción de datos para mayor velocidad.
 * - Lógica de segmentación multi-mascota reforzada.
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const toolsDefinition = require('./tools');
const prompts = require('./prompts');
const dbService = require('../services/database');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

module.exports = {
    /**
     * Genera respuestas y gestiona el aprendizaje continuo del asistente.
     * @param {string} mensajeUsuario - Mensaje entrante del cliente.
     * @param {Array} historialChat - Mensajes recientes para contexto inmediato.
     * @param {Object} perfilCliente - Ficha técnica completa del cliente desde Firestore.
     */
    generarRespuesta: async (mensajeUsuario, historialChat, perfilCliente) => {
        try {
            const model = genAI.getGenerativeModel({
                model: "gemini-2.0-flash",
                tools: toolsDefinition
            });

            // 1. PREPARACIÓN DEL CONTEXTO (Historial reciente)
            let historyFiltrado = historialChat
                .filter(m => m.texto && m.rol)
                .map(m => ({
                    role: m.rol === 'usuario' ? 'user' : 'model',
                    parts: [{ text: m.texto }]
                }))
                .slice(-15);

            if (historyFiltrado.length > 0 && historyFiltrado[0].role === 'model') {
                historyFiltrado.shift();
            }

            // Accedemos a la memoria persistente de largo plazo
            const memoriaActual = perfilCliente.memoria_long_term?.notas_mascotas || "";

            const chat = model.startChat({
                history: historyFiltrado,
                systemInstruction: {
                    role: 'system',
                    parts: [{ text: prompts.systemInstruction(perfilCliente) }]
                }
            });

            // 2. GENERACIÓN DE RESPUESTA
            const result = await chat.sendMessage(mensajeUsuario);
            const responseText = result.response.text();
            const call = result.response.functionCalls()?.[0];

            // 3. ACTUALIZACIÓN DE MEMORIA DE POR VIDA (Background Process)
            // Analizamos la charla para actualizar la ficha técnica sin bloquear la respuesta.
            if (!call) {
                analizarYPreservarConocimiento(mensajeUsuario, historyFiltrado, memoriaActual, perfilCliente.whatsappId, model)
                    .catch(err => console.error("⚠️ Error en preservación de memoria:", err.message));
            }

            // 4. ACCIONES ESPECIALES (Handover)
            if (call && call.name === "escalarAVentas") {
                return {
                    text: "¡Qué nota! Mira, te paso con mi equipo de ventas para ayudarte con eso. ¡Dame un segundo! 🙋‍♀️",
                    action: "HANDOVER_SALES"
                };
            }

            return { text: responseText, action: null };

        } catch (error) {
            console.error("---------- ERROR CRÍTICO EN AI ENGINE ----------");
            return {
                text: "¡Ay! Me distraje un segundo con un perrito que pasó. 🐾 ¿Me repites lo último?",
                action: null
            };
        }
    }
};

/**
 * Función dedicada a la "Memoria de por vida".
 * Extrae datos y actualiza la ficha técnica permanente en Firestore.
 */
async function analizarYPreservarConocimiento(mensajeActual, historial, memoriaPrevia, whatsappId, model) {
    const contextoCharla = historial
        .map(m => `${m.role === 'user' ? 'Cliente' : 'Ana'}: ${m.parts[0].text}`)
        .join("\n");

    const instruccionExtraccion = `
        OBJETIVO: Actualizar la FICHA TÉCNICA PERMANENTE del cliente.
        
        MEMORIA ACTUAL DE LARGO PLAZO: 
        "${memoriaPrevia}"
        
        CONTEXTO DE LA CONVERSACIÓN:
        ${contextoCharla}
        Último mensaje: "${mensajeActual}"
        
        TAREA:
        Revisa si hay información que deba quedar grabada "de por vida" (nombres de mascotas, 
        alergias, comportamientos fijos, ubicación o preferencias del dueño).
        
        FORMATO DE SALIDA:
        - Mantén la segmentación: [Nombre Mascota]: [Detalles].
        - Si no hay información nueva para la ficha permanente, responde: SIN_CAMBIOS.
    `;

    const extractionResult = await model.generateContent(instruccionExtraccion);
    const memoriaEvolucionada = extractionResult.response.text().trim();

    if (memoriaEvolucionada && memoriaEvolucionada !== "SIN_CAMBIOS" && memoriaEvolucionada !== memoriaPrevia) {
        // Llamamos al nuevo método de actualización permanente en el database service
        await dbService.actualizarMemoriaDePorVida(whatsappId, memoriaEvolucionada);
        console.log(`🧠 Ficha técnica actualizada de por vida para: ${whatsappId}`);
    }
}