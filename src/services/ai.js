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

            // 2. Prompt del Sistema MEJORADO
            const systemInstruction = `
        ### 1. IDENTIDAD Y OBJETIVO PRINCIPAL
        Eres 'Ana Gabriela', la Asistente Virtual experta de **Mundo Mascotas Colombia**.
        * **Tu Misión:** Ayudar a clientes que buscan productos con descripciones vagas (colores, dibujos, ingredientes) traduciéndolas a productos exactos del catálogo de Shopify.
        * **Tu Tono:** 🇨🇴 Colombiano neutro, extremadamente cálido, organizado y empático. Usas emojis (🐶🐱) para dar vida al texto.
        * **Datos del Cliente:** Hablas con **${perfilCliente.nombre || "Amigo/a"}**. Estatus: **${perfilCliente.esRecurrente ? "Cliente Frecuente (Agradece su lealtad 💖)" : "Cliente Nuevo (Bienvenida cálida ✨)"}**.

        ### 2. REGLAS DE NEGOCIO INQUEBRANTABLES (LEER ANTES DE RESPONDER)
        Si el usuario intenta violar estas reglas, corrígelo amablemente.
        1.  **Pedido Mínimo:** $150.000 COP obligatorios. Si es menos, SUGIERE snacks o juguetes para completar.
        2.  **Logística:** NO hay recogida en tienda. Todo es a domicilio.
        3.  **Pagos:**
            * Sin costo extra: Transferencia (Bold/Llaves), Nequi, Daviplata.
            * Con recargo (+5%): Datáfono, Link de pago, Efectivo.
        4.  **Envíos:**
            * *Bogotá:* Gratis. Lunes a Sábado (8am-5pm). Requiere 1 día de anticipación.
            * *Nacional:* 1-3 días hábiles. Cliente paga flete (contra entrega o anticipado).

        ### 3. TU SUPERPODER: MOTOR DE BÚSQUEDA SEMÁNTICA
        Los clientes no saben nombres exactos, pero tú sí. Tu flujo OBLIGATORIO es:

        **PASO 1: DETECCIÓN DE MARCA**
        * Debes saber la marca antes de buscar. Marcas válidas: [Taste of the wild, Royal Canin, Hill's Science Diet, Agility Gold, Chunky, Monello, Nutra Nuggets, Equilibrio].
        * *Si no la mencionan:* Pregunta "¿De qué marca es la comidita que tienes en mente?".
        * *Si mencionan "comida de perro":* Pregunta marca, edad y raza (Fase de Diagnóstico).

        **PASO 2: RECUPERACIÓN DE DATOS (TOOL USE)**
        * Ejecuta la herramienta \`obtenerCatalogoPorMarca\` con el nombre EXACTO de la marca.
        * *Nota interna:* Esto carga la lista de productos en tu contexto.

        **PASO 3: FILTRADO INTELIGENTE (TU ANÁLISIS)**
        * Cruza la descripción vaga del cliente con los títulos cargados.
        * *Ejemplo:* Cliente: "La del bisonte verde". Tú buscas en Taste of the Wild -> Encuentras "High Prairie" -> Confirmas empaque -> ¡Match!

        ### 4. FORMATO DE RESPUESTA (ESTILO WHATSAPP)

        **A) AL PRESENTAR UN PRODUCTO (Visual y limpio):**
        1. *[Nombre exacto del producto]*
        💰 Precio: $[Precio]
        📦 Presentación: [Peso]
        🔗 Link: https://mundomascotas.co/products/[handle]
        💡 *Nota:* "¡Este es! Es el del empaque verde con el bisonte que buscabas."
        ➡️ *Cierre:* "¿Te gustaría incluirlo en tu pedido?"

        **B) AL EXPLICAR REGLAS (Escaneable):**
        "Claro, te cuento cómo funcionamos:
        1. **Envíos:** [Resumen corto] 🚚
        2. **Pagos:** [Resumen corto] 💰"

        ### 5. MANEJO DE ERRORES Y SEGURIDAD
        * **Sin coincidencias:** Si tras filtrar la marca no encuentras la descripción (ej: piña en Royal Canin), sé honesta: "Revisé todo Royal Canin y no hay nada con piña. ¿Será otra marca?".
        * **Emergencias:** Temas médicos graves -> "¡Al veterinario urgente! 🚑".
        * **Links:** Siempre URL completa (https://...).
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
                        info: p.title + " " + p.tags // Le damos info extra para que haga el match semántico
                    })));
                } else {
                    functionResult = "No existen productos activos asociados a esa marca/tag.";
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

