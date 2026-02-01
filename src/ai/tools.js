/**
 * ARCHIVO: ai/tools.js
 * DESCRIPCIÓN: Define las habilidades técnicas (tools) que Ana Gabriela puede ejecutar.
 * Actualmente configurado para permitir el "Handover" o transferencia a un agente de ventas humano.
 */

module.exports = [
    {
        /**
         * Declaración de funciones que Gemini puede decidir invocar 
         * basándose en la intención detectada en el mensaje del usuario.
         */
        functionDeclarations: [
            {
                name: "escalarAVentas",
                description: `
                    Activa esta función SOLO cuando el cliente:
                    1. Pregunte explícitamente por el precio de un producto.
                    2. Pregunte si hay disponibilidad o stock de un artículo.
                    3. Manifieste que ya quiere realizar la compra o cerrar su pedido.
                    4. Solicite hablar con un asesor humano para temas comerciales.
                `,
                parameters: {
                    type: "OBJECT",
                    properties: {
                        nota: {
                            type: "STRING",
                            description: "Resumen ejecutivo del interés del cliente para que el vendedor tenga contexto (ej: 'Interesado en bulto Pro Plan Adulto' o 'Pregunta por medios de pago')."
                        }
                    },
                    required: ["nota"]
                }
            }
        ]
    }
];