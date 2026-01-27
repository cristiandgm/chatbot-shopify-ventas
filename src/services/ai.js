const { GoogleGenerativeAI } = require("@google/generative-ai");
const shopifyService = require('./shopify');

// Inicializamos la API con tu clave
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- DEFINICIÓN DE HERRAMIENTAS (TOOLS) ---
const toolsDefinition = [
    {
        functionDeclarations: [
            {
                name: "obtenerCatalogoPorMarca",
                description: "Obtiene TODOS los productos disponibles de una marca específica. Úsalo cuando identifiques la marca que quiere el cliente.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        marcaTag: {
                            type: "STRING",
                            description: "El tag EXACTO de la marca en Shopify (ej: 'Taste of the wild', 'Royal Canin', 'Hill's Science Diet')."
                        }
                    },
                    required: ["marcaTag"]
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
            // 1. Configuración del Modelo
            const model = genAI.getGenerativeModel({
                model: "gemini-2.0-flash-exp",
                tools: toolsDefinition
            });



            const systemInstruction = `
                ### OBJETIVO
                Eres 'Ana Gabriela', asistente de Mundo Mascotas Colombia. Tu única tarea es identificar qué producto busca el cliente a través de un proceso de dos pasos.

                ### FLUJO OBLIGATORIO
                1. **Identificar Marca:** Debes saber la marca antes de buscar. Marcas válidas: [Taste of the wild, Royal Canin, Hill's Science Diet, Agility Gold, Chunky, Monello, Nutra Nuggets, Equilibrio].
                * Si el usuario no la dice, PREGUNTA: "¿De qué marca es el producto que buscas?".
                * No intentes adivinar el producto sin haber llamado a la herramienta de búsqueda primero.

                2. **Cargar Catálogo (Tool Use):** Una vez tengas la marca, ejecuta 'obtenerCatalogoPorMarca' con el tag exacto.

                3. **Análisis y Respuesta:** Cuando recibas la lista de productos de Shopify, busca el que mejor coincida con la descripción vaga del cliente (colores, ingredientes, dibujos).

                ### FORMATO DE RESPUESTA
                Presenta el resultado así:
                🐶 **[Nombre exacto del producto]**
                💰 Precio: $[Precio] COP
                📦 Presentación: [Peso/Info]
                🔗 Link: https://mundomascotas.co/products/[handle]
                💡 *Por qué lo elegí:* [Explicación del match semántico]

                Si tras buscar no encuentras nada que coincida con la descripción, dile al cliente que revisaste el catálogo de [Marca] pero no encontraste ese detalle específico.
                `;

            // 3. Preparar el Chat 
            let chatHistory = historialChat.map(m => ({
                role: m.rol === 'usuario' ? 'user' : 'model',
                parts: [{ text: m.texto }]
            }));

            // Corrección de roles alternados (Gemini no permite empezar con 'model')
            if (chatHistory.length > 0 && chatHistory[0].role === 'model') {
                chatHistory.shift();
            }

            const chatSession = model.startChat({
                history: chatHistory,
                systemInstruction: { role: 'system', parts: [{ text: systemInstruction }] }
            });

            // 4. Enviar mensaje inicial
            // LOG NUEVO
            console.log("🧠 Gemini: Analizando intención del usuario...");

            const result = await chatSession.sendMessage(mensajeUsuario);
            const response = result.response;

            // --- LÓGICA DE HERRAMIENTAS ---
            const functionCalls = response.functionCalls();

            if (!functionCalls || functionCalls.length === 0) {
                // LOG NUEVO
                console.log("🧠 Gemini: Respuesta directa (sin herramientas).");
                return { text: response.text(), action: null };
            }

            const call = functionCalls[0];
            const funcName = call.name;
            const args = call.args;

            // LOG NUEVO: Ver qué herramienta eligió y con qué parámetros
            console.log(`🛠️ Gemini activó herramienta: [${funcName}]`);
            console.log(`   └─ Argumentos recibidos: ${JSON.stringify(args)}`);

            let functionResult = "";
            let actionInfo = null;

            if (funcName === "obtenerCatalogoPorMarca") {
                console.log(`   └─ 📥 Descargando catálogo completo de: ${args.marcaTag}...`);

                // Llamamos a la nueva función en shopify.js
                const productos = await shopifyService.buscarPorMarca(args.marcaTag);

                console.log(`   └─ 📚 Catálogo cargado: ${productos.length} productos en memoria de Gemini.`);

                if (productos.length > 0) {
                    // Le pasamos TODO el JSON a Gemini para que él filtre
                    // Optimizamos el JSON para no gastar tantos tokens
                    functionResult = JSON.stringify(productos.map(p => ({
                        titulo: p.title,
                        precio: p.price,
                        handle: p.handle, // Gemini necesita esto para armar el link si quiere
                        descripcion_clave: `${p.title} ${p.tags}`
                    })));
                } else {
                    functionResult = "No encontré productos para esta marca en la tienda.";
                }
            } else if (funcName === "escalarAHumano") {
                actionInfo = "HANDOVER";
                functionResult = "Escalamiento confirmado.";
                console.log("   └─ 🚨 Escalamiento activado.");
            }

            // Enviamos el resultado de vuelta a Gemini para que genere el texto final
            console.log("🧠 Gemini: Generando respuesta final con datos de herramienta...");
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
            console.error("🔥 Error en Gemini (ai.js):", error);
            return { text: "Estoy revisando el sistema y tuve un pequeño error. ¿Me repites lo último?", action: null };
        }
    }
};

