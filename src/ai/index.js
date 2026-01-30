const { GoogleGenerativeAI } = require("@google/generative-ai");
const shopifyService = require('../services/shopify');
const toolsDefinition = require('./tools'); // Importamos habilidades
const prompts = require('./prompts');       // Importamos personalidad
const dbService = require('../services/database');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

module.exports = {
    generarRespuesta: async (mensajeUsuario, historialChat, perfilCliente) => {
        try {
            const model = genAI.getGenerativeModel({
                model: "gemini-2.0-flash",
                tools: toolsDefinition
            });

            const chatHistory = historialChat.map(m => ({
                role: m.rol === 'usuario' ? 'user' : 'model',
                parts: [{ text: m.texto }]
            }));

            const chatSession = model.startChat({
                history: chatHistory,
                systemInstruction: {
                    role: 'system',
                    parts: [{ text: prompts.systemInstruction(perfilCliente) }]
                }
            });

            const result = await chatSession.sendMessage(mensajeUsuario);
            const response = result.response;
            const functionCalls = response.functionCalls();

            if (!functionCalls || functionCalls.length === 0) {
                return { text: response.text(), action: null };
            }

            // Lógica de ejecución de herramientas
            const call = functionCalls[0];
            let functionResult = "";
            let actionInfo = null;

            if (call.name === "gestionarCarrito") {
                const whatsappId = perfilCliente.whatsappId;
                const resultado = await shopifyService.guardarCarrito(whatsappId, call.args.items);

                functionResult = JSON.stringify({
                    totalActual: resultado.total,
                    faltante: resultado.cumpleMinimo ? 0 : 150000 - resultado.total,
                    estado: resultado.cumpleMinimo ? "LISTO_PARA_CIERRE" : "PENDIENTE_MINIMO"
                });
            }

            if (call.name === "obtenerCatalogoPorMarca") {
                const productos = await shopifyService.buscarPorMarca(call.args.marcaTag);
                functionResult = productos.length > 0
                    ? JSON.stringify(productos)
                    : "No hay productos disponibles para esta marca.";
            } else if (call.name === "escalarAHumano") {
                actionInfo = "HANDOVER";
                functionResult = "Escalamiento activado.";
            }

            const finalResult = await chatSession.sendMessage([{
                functionResponse: {
                    name: call.name,
                    response: { name: call.name, content: { result: functionResult } }
                }
            }]);

            return { text: finalResult.response.text(), action: actionInfo };

        } catch (error) {
            console.error("🔥 Error en index.js:", error);
            return { text: "Tuve un pequeño error técnico. ¿Me repites la marca?", action: null };
        }
    }
};