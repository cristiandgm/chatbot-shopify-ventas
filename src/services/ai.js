const { GoogleGenerativeAI } = require("@google/generative-ai");
const shopifyService = require('./shopify');

// Inicializamos la API con tu clave
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- DEFINICIÓN DE HERRAMIENTAS (TOOLS) ---
// Aquí le explicamos a Gemini qué "superpoderes" tiene
const toolsDefinition = [
    {
        functionDeclarations: [
            {
                name: "buscarProductosShopify",
                description: "Busca productos en el catálogo de la tienda. Úsalo cuando el cliente pregunte precios, recomendaciones o stock.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        keyword: { type: "STRING", description: "Término de búsqueda (ej: 'Acana', 'Gato', 'Juguete')" }
                    },
                    required: ["keyword"]
                }
            },
            {
                name: "escalarAHumano",
                description: "Úsalo SOLO si el cliente está muy enojado, pide hablar con un supervisor o envía una imagen que no entiendes.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        motivo: { type: "STRING", description: "Razón breve del escalamiento" }
                    },
                    required: ["motivo"]
                }
            }
        ]
    }
];

module.exports = {
    /**
     * Función principal que orquesta la conversación con Gemini
     */
    generarRespuesta: async (mensajeUsuario, historialChat, perfilCliente) => {
        try {
            // 1. Configuración del Modelo (Usamos Flash 2.0 por velocidad)
            const model = genAI.getGenerativeModel({
                model: "gemini-2.0-flash-exp", // O "gemini-1.5-flash" si prefieres más estabilidad
                tools: toolsDefinition
            });

            // 2. Prompt del Sistema (PERSONALIDAD)
            const systemInstruction = `
            Eres 'Ana Gabriela', la asistente humana experta de Mundo Mascotas Colombia.
            
            DATOS DEL CLIENTE ACTUAL:
            - Nombre: ${perfilCliente.nombre || "Amigo"}
            - Historial: ${perfilCliente.esRecurrente ? "Cliente frecuente" : "Cliente nuevo"}

            TUS REGLAS DE ORO:
            1. **Tono:** Cercano, empático y profesional. Usa emojis moderadamente 🐶.
            2. **Venta Consultiva:** No des listas frías. Si piden "comida", pregunta para qué mascota (edad/raza) o busca opciones específicas.
            3. **Stock:** NUNCA inventes precios. Usa SIEMPRE la herramienta 'buscarProductosShopify' para ver qué hay real.
            4. **Brevedad:** Respuestas cortas y fáciles de leer en WhatsApp.
            5. **Seguridad:** Si no sabes algo, di que consultarás con un humano.

            OBJETIVO: Ayudar al cliente a encontrar lo que busca y guiarlo a la compra.
            `;

            // 3. Preparar el Chat (Convertimos tu historial de Firebase al formato de Gemini)
            let chatHistory = historialChat.map(m => ({
                role: m.rol === 'usuario' ? 'user' : 'model',
                parts: [{ text: m.texto }]
            }));

            // --- CORRECCIÓN DEL ERROR ---
            // Gemini exige que el primer mensaje siempre sea del usuario ('user').
            // Si el historial empieza con el bot ('model'), borramos ese primer mensaje.
            if (chatHistory.length > 0 && chatHistory[0].role === 'model') {
                console.log("🧹 Ajustando historial: Eliminando mensaje inicial del bot para cumplir reglas de Gemini.");
                chatHistory.shift(); // Elimina el primer elemento
            }

            const chatSession = model.startChat({
                history: chatHistory,
                systemInstruction: { role: 'system', parts: [{ text: systemInstruction }] }
            });
            // 4. Enviar mensaje inicial a Gemini
            console.log("🤖 Consultando a Gemini...");
            const result = await chatSession.sendMessage(mensajeUsuario);
            const response = result.response;

            // --- LÓGICA DE HERRAMIENTAS (FUNCTION CALLING) ---
            const functionCalls = response.functionCalls();

            // CASO A: Gemini respondió texto normal (sin usar herramientas)
            if (!functionCalls || functionCalls.length === 0) {
                return { text: response.text(), action: null };
            }

            // CASO B: Gemini quiere usar una herramienta
            const call = functionCalls[0];
            const funcName = call.name;
            const args = call.args;

            console.log(`🛠️ Gemini activó herramienta: ${funcName}`);

            // Ejecutamos la herramienta real
            let functionResult = "";
            let actionInfo = null;

            if (funcName === "buscarProductosShopify") {
                const productos = await shopifyService.buscarProductos(args.keyword);

                // Formateamos un poco para ahorrarle tokens a la IA
                if (productos.length > 0) {
                    functionResult = JSON.stringify(productos.map(p => ({
                        titulo: p.title,
                        precio: p.price,
                        id: p.variantId,
                        disponible: p.available
                    })));
                } else {
                    functionResult = "No se encontraron productos con ese nombre.";
                }

            } else if (funcName === "escalarAHumano") {
                actionInfo = "HANDOVER";
                functionResult = "Escalamiento confirmado.";
            }

            // 5. Devolvemos el resultado de la herramienta a Gemini para que genere la respuesta final
            // (El "Round 2" del chat)
            const result2 = await chatSession.sendMessage([
                {
                    functionResponse: {
                        name: funcName,
                        response: { name: funcName, content: { result: functionResult } }
                    }
                }
            ]);

            return { text: result2.response.text(), action: actionInfo };

        } catch (error) {
            console.error("🔥 Error en Gemini:", error);
            // Fallback por si la IA falla
            return { text: "Estoy teniendo un pequeño lapus mental 😵‍💫. ¿Me podrías repetir eso?", action: null };
        }
    }
};