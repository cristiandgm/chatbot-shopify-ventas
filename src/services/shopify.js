require('dotenv').config();
const { shopifyApi, LATEST_API_VERSION, Session } = require('@shopify/shopify-api');
require('@shopify/shopify-api/adapters/node');

// Initialize Shopify API
const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY || 'dummy_key',
  apiSecretKey: process.env.SHOPIFY_API_SECRET || 'dummy_secret',
  scopes: ['read_products', 'write_orders'],
  hostName: process.env.SHOPIFY_SHOP_URL ? process.env.SHOPIFY_SHOP_URL.replace(/https?:\/\//, '') : 'localhost',
  apiVersion: '2025-01', // <--- CAMBIO: Usa este string directamente
  isEmbeddedApp: false,
  isCustomStoreApp: true,
  adminApiAccessToken: process.env.SHOPIFY_ACCESS_TOKEN,
});

const session = new Session({
  id: 'offline_session',
  shop: process.env.SHOPIFY_SHOP_URL ? process.env.SHOPIFY_SHOP_URL.replace(/https?:\/\//, '') : 'example.myshopify.com',
  state: 'state',
  isOnline: false,
  accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
});

const client = new shopify.clients.Graphql({ session });

/**
 * NUEVA FUNCIÓN: Trae todo el inventario de una marca específica mediante etiquetas (tags)
 * @param {string} marcaTag - El tag exacto de la marca en Shopify
 */
async function buscarPorMarca(marcaTag) {
  try {
    // Filtramos solo por etiqueta de marca y productos activos
    const queryOptimized = `tag:"${marcaTag}" AND status:ACTIVE`;

    console.log(`🛒 [Shopify Request] Descargando catálogo de marca: "${marcaTag}"`);

    const response = await client.request(
      `
        query($query: String!) {
          products(first: 50, query: $query) {
            edges {
              node {
                title
                handle
                tags 
                totalInventory
                priceRangeV2 {
                  minVariantPrice {
                    amount
                  }
                }
                variants(first: 1) {
                  edges {
                    node {
                      availableForSale
                    }
                  }
                }
              }
            }
          }
        }
      `,
      {
        variables: {
          query: queryOptimized,
        },
      }
    );

    // Manejo de la estructura de respuesta de la librería @shopify/shopify-api
    let responseBody = response.body ? response.body : response;

    if (!responseBody.data || !responseBody.data.products) {
      console.warn("⚠️ [Shopify] No se encontraron productos o la respuesta fue inesperada.");
      return [];
    }

    const products = responseBody.data.products.edges;

    console.log(`✅ [Shopify Response] ${products.length} productos cargados para Gemini.`);

    // Retornamos una estructura limpia para que Gemini analice
    return products.map(({ node }) => ({
      title: node.title,
      handle: node.handle,
      tags: node.tags.join(", "), // Unimos los tags en un string para búsqueda semántica
      price: Math.round(parseFloat(node.priceRangeV2.minVariantPrice.amount)),
      available: node.totalInventory > 0 || node.variants.edges[0].node.availableForSale
    }));

  } catch (error) {
    console.error('🔥 Error en shopify.js (buscarPorMarca):', error);
    return [];
  }
}

/**
 * Crea un pedido manual (Mantenemos esta por si la usas más adelante)
 */
async function crearPedidoManual(items, datosCliente) {
  try {
    const restClient = new shopify.clients.Rest({ session });
    const orderData = {
      order: {
        line_items: items.map(item => ({
          variant_id: parseInt(item.variantId.split('/').pop(), 10),
          quantity: item.quantity
        })),
        customer: {
          email: datosCliente.email
        },
        financial_status: 'pending'
      }
    };

    const response = await restClient.post({
      path: 'orders',
      type: 'application/json',
      data: orderData,
    });

    return response.body.order;
  } catch (error) {
    console.error('🔥 Error creando pedido:', error);
    throw error;
  }
}

module.exports = {
  buscarPorMarca,
  crearPedidoManual
};