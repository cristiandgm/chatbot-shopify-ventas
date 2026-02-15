/**
 * ARCHIVO: src/ai/index.js
 * DESCRIPCIÓN: Motor de IA con gestión de Memoria Estructurada (JSON) y FUSIÓN INTELIGENTE.
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const toolsDefinition = require('./tools'); // Tu archivo de herramientas original
const prompts = require('./prompts');
const dbService = require('../services/database');

// Inicialización del cliente de Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

module.exports = {
    /**
     * Genera respuestas y gestiona el aprendizaje continuo.
     */
    generarRespuesta: async (mensajeUsuario, historialChat, perfilCliente) => {
        try {
            // Instancia para el chat conversacional con tus herramientas
            const model = genAI.getGenerativeModel({
                model: "gemini-2.0-flash", // O el modelo que prefieras usar
                tools: toolsDefinition
            });

            // 1. PREPARACIÓN DEL CONTEXTO
            // Filtramos mensajes vacíos o de sistema interno
            let historyFiltrado = historialChat
                .filter(m => m.texto && m.rol)
                .map(m => ({
                    role: m.rol === 'usuario' ? 'user' : 'model',
                    parts: [{ text: m.texto }]
                }))
                .slice(-15); // Mantenemos la ventana de contexto corta

            // Corrección de inicio: Gemini no puede empezar con 'model', debe empezar con 'user'
            if (historyFiltrado.length > 0 && historyFiltrado[0].role === 'model') {
                historyFiltrado.shift();
            }

            // Recuperamos la memoria. Si no existe, iniciamos array vacío.
            const memoriaActual = perfilCliente.memoria_long_term || [];

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

            // 3. GESTIÓN DE MEMORIA (BACKGROUND)
            // Ejecutamos la preservación de memoria sin bloquear la respuesta
            if (!call) {
                analizarYPreservarConocimiento(mensajeUsuario, historyFiltrado, memoriaActual, perfilCliente.whatsappId, model)
                    .catch(err => console.error("⚠️ Error background memoria:", err.message));
            }

            // 4. HANDOVER / FUNCIONES (Tu lógica de escalamiento)
            if (call && call.name === "escalarAVentas") {
                return {
                    text: "¡Listo! Te voy a comunicar con un asesor humano experto para que te ayude con esa compra. Dame un segundo. 🙋‍♀️",
                    action: "HANDOVER_SALES",
                    payload: call.args
                };
            }

            return { text: responseText, action: null };

        } catch (error) {
            console.error("---------- ERROR CRÍTICO AI ----------", error);
            return {
                text: "¡Ay! Se me fue la señal un segundito. 🐾 ¿Me lo puedes repetir?",
                action: null
            };
        }
    }
};

/**
 * FUNCIÓN BLINDADA: GESTIÓN DE BASE DE DATOS CON "DEEP MERGE"
 * Esta función evita que se borren datos (raza, edad) si no se mencionan en el chat reciente.
 */
async function analizarYPreservarConocimiento(mensajeActual, historial, memoriaPrevia, whatsappId, model) {
    const contextoCharla = historial
        .map(m => `${m.role === 'user' ? 'Cliente' : 'Ana'}: ${m.parts[0].text}`)
        .join("\n");

    // A. Normalización (Manejo de datos antiguos)
    let currentDB = [];
    if (Array.isArray(memoriaPrevia)) {
        currentDB = memoriaPrevia;
    } else if (typeof memoriaPrevia === 'string' && memoriaPrevia.length > 5) {
        // Migración de emergencia si viene texto plano
        currentDB = [{ nombre: "Mascota Anterior", especie: "Desconocida", notas: memoriaPrevia }];
    }

    const jsonStructure = JSON.stringify(currentDB, null, 2);

    // B. Prompt de Ingeniería de Datos (AUDITOR ESTRICTO)
    const promptPersistencia = `
        ACTÚA COMO UN MOTOR DE FUSIÓN DE DATOS (DATA MERGE ENGINE).
        Tu trabajo es ACTUALIZAR la base de datos de mascotas sin perder información previa.

        ### INPUT 1: BASE DE DATOS ACTUAL (LA VERDAD PREVIA):
        ${jsonStructure}

        ### INPUT 2: CONVERSACIÓN RECIENTE (INFORMACIÓN NUEVA):
        "${contextoCharla} \n Último mensaje: ${mensajeActual}"

        ### REGLAS DE ORO PARA LA FUSIÓN (LEER ATENTAMENTE):
        1. **PRINCIPIO DE NO-DESTRUCCIÓN**:
           - Si la Base de Datos dice que "Perseo" es raza "Pitbull", y en el chat reciente NO se menciona la raza: **MANTÉN "Pitbull"**. 
           - **ESTÁ PROHIBIDO** poner "null", "desconocido" o borrar el dato si ya existía.
           - Solo sobrescribe un dato si el usuario lo CORRIGE explícitamente (ej: "No es Pitbull, es Boxer").

        2. **ACUMULACIÓN DE HISTORIAL**:
           - En campos como "salud" o "comportamiento", NO borres lo anterior. Trata de fusionar o agregar la novedad.
           - Ejemplo: Si antes tenía "Diarrea" y hoy tiene "Tos", el resultado debe ser "Historial de diarrea, actualmente con tos".

        3. **NUEVAS MASCOTAS**:
           - Si aparece una mascota nueva que no está en la lista, crea un objeto nuevo.

        ### ESTRUCTURA DE SALIDA OBLIGATORIA (JSON ARRAY):
        [
            {
                "nombre": "String",
                "especie": "Perro | Gato | ...",
                "raza": "MANTENER VALOR PREVIO O ACTUALIZAR",
                "edad": "MANTENER VALOR PREVIO O ACTUALIZAR",
                "salud": "Resumen acumulado",
                "comportamiento": "Resumen acumulado",
                "preferencias": "Gustos, juguetes, comida"
            }
        ]
    `;

    try {
        // Usamos una instancia nueva del modelo forzando JSON para esta tarea administrativa
        // Nota: No pasamos 'tools' aquí porque esta tarea es puramente de texto a JSON
        const dbModel = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            generationConfig: { responseMimeType: "application/json" }
        });

        const result = await dbModel.generateContent(promptPersistencia);
        const jsonResponse = JSON.parse(result.response.text());

        // C. Safety Check: Evitar borrado accidental masivo
        if (currentDB.length > 0 && jsonResponse.length === 0) {
            // Un chequeo simple: si teníamos mascotas y ahora hay 0 sin que el usuario diga "borrar", es un error.
            const userIntentDelete = mensajeActual.toLowerCase().includes("borra") || mensajeActual.toLowerCase().includes("elimina");
            if (!userIntentDelete) {
                console.warn("⚠️ ALERTA: La IA intentó vaciar la DB sin permiso. Bloqueando cambio.");
                return;
            }
        }

        if (Array.isArray(jsonResponse)) {
            await dbService.actualizarMemoriaDePorVida(whatsappId, jsonResponse);
            console.log(`🧠 DB Actualizada (${whatsappId}): ${jsonResponse.length} mascotas.`);
        }

    } catch (error) {
        console.error("Error procesando JSON de memoria:", error.message);
    }
}