// tools.js
module.exports = [
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
                            description: "El tag EXACTO de la marca en Shopify (ej: 'Taste of the wild', 'Royal Canin')."
                        }
                    },
                    required: ["marcaTag"]
                }
            },
            {
                name: "escalarAHumano",
                description: "Úsalo SOLO si el cliente está muy enojado o pide hablar con un supervisor.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        motivo: { type: "STRING", description: "Razón del escalamiento" }
                    },
                    required: ["motivo"]
                }
            }
        ]
    }
];