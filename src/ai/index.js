// src/ai/index.js
const { GoogleGenerativeAI } = require("@google/generative-ai");
const shopifyService = require('../services/shopify');
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

            // 1. LIMPIEZA DE HISTORIAL PARA EVITAR SALUDOS REPETIDOS
            // Si ya hay mensajes en el historial, le indicamos internamente que no debe saludar.
            const yaSaludó = historialChat.some(m => m.rol === 'bot');
            const instruccionAjustada = yaSaludó
                ? prompts.systemInstruction(perfilCliente) + "\n**NOTA**: Ya saludaste anteriormente. NO vuelvas a presentarte, ve directo al grano."
                : prompts.systemInstruction(perfilCliente);

            const chatHistory = historialChat.map(m => ({
                role: m.rol === 'usuario' ? 'user' : 'model',
                parts: [{ text: m.texto }]
            }));

            const chatSession = model.startChat({
                history: chatHistory,
                systemInstruction: {
                    role: 'system',
                    parts: [{ text: instruccionAjustada }]
                }
            });

            const result = await chatSession.sendMessage(mensajeUsuario);
            const response = result.response;
            const functionCalls = response.functionCalls();

            if (!functionCalls || functionCalls.length === 0) {
                return { text: response.text(), action: null };
            }

            const call = functionCalls[0];
            let functionResult = "";
            let actionInfo = null;

            // 2. LÓGICA DE CARRITO REFORZADA
            if (call.name === "gestionarCarrito") {
                const resultado = await dbService.guardarCarrito(perfilCliente.whatsappId, call.args.items);

                // Forzamos una respuesta de herramienta que no deje lugar a dudas
                const esListo = resultado.total >= 150000;
                functionResult = JSON.stringify({
                    totalActual: resultado.total,
                    cumpleMinimo: esListo,
                    estado: esListo ? "LISTO_PARA_CIERRE" : "PENDIENTE_MINIMO",
                    instruccionDirecta: esListo
                        ? "PEDIDO MÍNIMO SUPERADO. NO pidas más productos. Solicita Cédula y Dirección AHORA."
                        : `Faltan $${150000 - resultado.total} para el mínimo.`
                });
            }

            // 3. CONSULTA DE CATÁLOGO
            if (call.name === "obtenerCatalogoPorMarca") {
                const productos = await shopifyService.buscarPorMarca(call.args.marcaTag);
                functionResult = productos.length > 0
                    ? JSON.stringify(productos)
                    : "No hay productos disponibles. Dile al cliente que están súper agotados 😿.";
            }

            else if (call.name === "escalarAHumano") {
                actionInfo = "HANDOVER";
                functionResult = "Escalamiento activado.";
            }

            // 4. RESPUESTA FINAL
            const finalResult = await chatSession.sendMessage([{
                functionResponse: {
                    name: call.name,
                    response: { name: call.name, content: { result: functionResult } }
                }
            }]);

            return { text: finalResult.response.text(), action: actionInfo };

        } catch (error) {
            console.error("🔥 Error en index.js:", error);
            return { text: "¡Hola! Tuve un pequeño error técnico. ¿Me podrías repetir lo último? 🐾", action: null };
        }
    }
};