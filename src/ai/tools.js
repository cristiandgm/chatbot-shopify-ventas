// tools.js
module.exports = [
    {
        functionDeclarations: [
            {
                name: "obtenerCatalogoPorMarca",
                description: "Consulta stock y precios en Shopify. Úsala INMEDIATAMENTE si el cliente menciona un medicamento o alimento, incluso si no te dice la marca exacta. No preguntes la marca si puedes deducirla o buscarla aquí.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        marcaTag: {
                            type: "STRING",
                            description: "Nombre de la marca o tag (ej: 'Vet Life', 'Royal Canin', 'Pro Plan')."
                        }
                    },
                    required: ["marcaTag"]
                }
            },
            {
                name: "gestionarCarrito",
                description: "Registra productos y verifica si se llega al pedido mínimo de $150.000.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        items: {
                            type: "ARRAY",
                            items: {
                                type: "OBJECT",
                                properties: {
                                    nombre: { type: "STRING" },
                                    precio: { type: "NUMBER" },
                                    cantidad: { type: "NUMBER" }
                                }
                            }
                        }
                    },
                    required: ["items"]
                }
            },
            {
                name: "escalarAHumano",
                description: "Usa esto si el cliente pide hablar con una persona real.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        motivo: { type: "STRING" }
                    },
                    required: ["motivo"]
                }
            }
        ]
    }
];