/**
 * ARCHIVO: src/ai/tools.js
 * DESCRIPCIÓN: Definición de las habilidades técnicas (Function Calling) de Ana Gabriela.
 * Permite que la IA interactúe con el sistema para ejecutar acciones específicas como el handover.
 * * MEJORAS INCLUIDAS:
 * - Descripciones semánticas enriquecidas para mejorar la precisión de activación.
 * - Parámetros detallados para capturar el contexto del cliente antes de la transferencia.
 * - Estructura optimizada para modelos Gemini (GoogleGenerativeAI).
 */

module.exports = [
    {
        /**
         * Declaración de funciones que Gemini puede invocar.
         * Estas funciones actúan como "triggers" en el controlador de WhatsApp.
         */
        functionDeclarations: [
            {
                name: "escalarAVentas",
                description: `
                    Transfiere la conversación a un asesor humano del equipo de ventas. 
                    Debe activarse ÚNICAMENTE en los siguientes escenarios:
                    1. Intención de Compra: El cliente quiere comprar, cerrar un pedido o realizar un pago.
                    2. Consultas Comerciales: Preguntas sobre precios exactos, promociones vigentes o métodos de pago.
                    3. Logística y Stock: Preguntas sobre disponibilidad de productos específicos o tiempos de entrega.
                    4. Solicitud Directa: El cliente pide hablar con una persona o un vendedor.
                `,
                parameters: {
                    type: "OBJECT",
                    properties: {
                        nota: {
                            type: "STRING",
                            description: "Contexto clave para el vendedor. Debe incluir qué producto busca el cliente y cuál es su duda principal."
                        },
                        prioridad: {
                            type: "STRING",
                            enum: ["alta", "media", "baja"],
                            description: "Nivel de urgencia detectado en el tono del cliente."
                        }
                    },
                    required: ["nota"]
                }
            }
        ]
    }
];