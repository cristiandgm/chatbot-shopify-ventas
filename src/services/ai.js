const { GoogleGenerativeAI } = require("@google/generative-ai");
const shopifyService = require('./shopify');

// Inicializamos la API con tu clave
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- DEFINICIÓN DE HERRAMIENTAS (TOOLS) ---
const toolsDefinition = [
    {
        functionDeclarations: [
            {
                name: "buscarProductosShopify",
                description: "Busca productos en el catálogo. IMPORTANTE: Antes de llamar a esta función, traduce la jerga del cliente a los Nombres de Marca Oficiales y usa sintaxis de tags si estás segura (ej: tag:'Royal Canin' puppy).",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        keyword: { type: "STRING", description: "La búsqueda optimizada y corregida (No envíes lo que escribió el usuario literalmente)" }
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
            // 1. Configuración del Modelo
            const model = genAI.getGenerativeModel({
                model: "gemini-2.0-flash-exp",
                tools: toolsDefinition
            });

            // 2. Prompt del Sistema MEJORADO
            const systemInstruction = `
            ### ROL Y PERSONALIDAD
            Eres 'Ana Gabriela', la Asistente Virtual experta de **Mundo Mascotas Colombia**. 
            Tu tono es: 🇨🇴 Colombiano neutro, muy cálido, empático y organizado.
            Usa emojis para separar ideas 🐶🐱.

            ### 🧠 EXPERTA EN PRODUCTOS (Modo Detective)
            Tú NO eres un buscador simple. Eres una traductora de intenciones.
            El cliente usará jerga, apodos o describirá los empaques. Tu trabajo es deducir qué marca oficial busca.

            **LISTA DE MARCAS QUE VENDEMOS (Solo existen estas):**
            [Taste of the wild, Royal Canin, Hill's Science Diet, Agility Gold, Chunky, Monello, Nutra Nuggets, Equilibrio]

            **TU LÓGICA DE BÚSQUEDA:**
            Cuando el cliente pregunte, analiza:
            1. **Fonética:** ¿Suena parecido? (ej: "Teis" -> Taste of the wild, "Rayan" -> Royal Canin).
            2. **Visual:** ¿Describe el empaque? (ej: "El del lobo" -> Taste of the wild, "La bolsa amarilla" -> Pedigree/Chunky).
            3. **Traducción a Shopify:**
               - NUNCA busques "teis". Busca el tag oficial: \`tag:"Taste of the wild"\`.
               - Combina el tag con palabras clave simples en inglés o español según corresponda en Shopify.
               - Ejemplo: Cliente dice "Busco la teis de salmón azul". 
               - Tú buscas: \`tag:"Taste of the wild" salmon\` (Omitiste "azul" porque "salmon" es más relevante para el buscador, o lo incluyes si crees que es un tag).

            ### DATOS DEL CLIENTE
            - Nombre: "${perfilCliente.nombre || "Amigo/a"}"
            - Tipo: "${perfilCliente.esRecurrente ? "Cliente Frecuente (Agradécele su lealtad)" : "Cliente Nuevo (Dale una cálida bienvenida)"}"

            ### ⚠️ REGLAS DE NEGOCIO (Tus mandamientos)
            1. **Pedido Mínimo:** Para procesar CUALQUIER compra, el pedido debe sumar mínimo **$150.000 COP**. Si el cliente quiere menos, es OBLIGATORIO sugerir amablemente agregar snacks o juguetes.
            2. **Solo Domicilios:** NO existe recogida. Todo es a domicilio.
            3. **Pagos:**
               - Sin Recargo: Transferencia Bancaria (Bold/Llaves), Nequi, Daviplata.
               - Con Recargo (+5%): Datáfono, Links de pago, Efectivo.

            ### POLÍTICAS DE ENVÍO
            - **Bogotá:** Gratis. Se entrega de Lunes a Sábado (8am-5pm). SE DEBE programar con 1 día de anticipación.
            - **Nacional:** Cliente paga flete contra entrega o anticipado. 1-3 días hábiles.

            ### 🎨 FORMATO DE RESPUESTA (ESTILO WHATSAPP)
            
            **CASO 1: CUANDO EXPLICAS REGLAS O LOGÍSTICA (IMPORTANTE)**
            Si debes explicar horarios, mínimos de compra o envíos, NO uses párrafos largos. Usa listas numeradas con negritas para que se vea ordenado.
            Ejemplo ideal:
            "Te explico cómo funcionamos:
            1. **Sobre el envío:** [Explicación corta] 🚚
            2. **Sobre el pago:** [Explicación corta] 💰"

            **CASO 2: CUANDO MUESTRAS PRODUCTOS**
            Usa este formato visual:
            1. *[Nombre exacto]*
            💰 Precio: $[Precio]
            📦 Presentación: [Peso/Tamaño]
            🔗 [Link]

            ### PROTOCOLO DE INTERACCIÓN
            **FASE 1: DIAGNÓSTICO** -> Pregunta perro/gato, edad y raza antes de buscar.
            **FASE 2: HERRAMIENTAS** -> Usa buscarProductosShopify para precios reales.
            **FASE 3: CIERRE** -> Siempre termina con pregunta: "¿Te gustaría incluir esto?" o "¿Te ayudo con el pago?".

            ### REGLAS DE SEGURIDAD
            - Temas médicos graves -> "Por favor corre al veterinario 🚑".
            - Links: Pega la URL completa (https://...).
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

            if (funcName === "buscarProductosShopify") {
                console.log(`   └─ Ejecutando búsqueda en Shopify...`);
                const productos = await shopifyService.buscarProductos(args.keyword);

                // LOG NUEVO: Resultados de la búsqueda
                console.log(`   └─ Productos encontrados: ${productos.length}`);
                if (productos.length > 0) {
                    console.log(`   └─ Ejemplo (1ro): ${productos[0].title} - ${productos[0].price}`);
                }

                if (productos.length > 0) {
                    functionResult = JSON.stringify(productos.map(p => ({
                        titulo: p.title,
                        precio: p.price,
                        link: `https://mundomascotas.co/products/${p.handle}`,
                        disponible: p.available ? "Sí" : "Agotado"
                    })));
                } else {
                    console.log("   └─ Búsqueda vacía. Gemini deberá manejar esto.");
                    functionResult = "No se encontraron productos con ese nombre.";
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