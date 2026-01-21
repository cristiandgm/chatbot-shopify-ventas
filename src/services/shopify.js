require('dotenv').config();
const { shopifyApi, LATEST_API_VERSION, Session } = require('@shopify/shopify-api');
require('@shopify/shopify-api/adapters/node');

// Initialize Shopify API (Configuración intacta)
const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY || 'dummy_key',
  apiSecretKey: process.env.SHOPIFY_API_SECRET || 'dummy_secret',
  scopes: ['read_products', 'write_orders'],
  hostName: process.env.SHOPIFY_SHOP_URL ? process.env.SHOPIFY_SHOP_URL.replace(/https?:\/\//, '') : 'localhost',
  apiVersion: '2025-10',
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
 * Busca productos en el catálogo de Shopify
 * @param {string} keyword - Palabra clave para buscar
 * @returns {Promise<Array>} - Lista de productos con nombre, precio y disponibilidad
 */
async function buscarProductos(keyword) {
  try {
    const queryOptimized = `${keyword} AND status:ACTIVE`;

    // LOG CRUCIAL: Ver exactamente qué le pedimos a Shopify
    console.log(`🛒 [Shopify Request] Query enviada: "${queryOptimized}"`);

    const response = await client.request(
      `
        query {
          products(first: 5, query: "${queryOptimized}") {
            edges {
              node {
                title
                handle  
                totalInventory
                priceRangeV2 {
                  minVariantPrice {
                    amount
                    currencyCode
                  }
                }
                variants(first: 1) {
                  edges {
                    node {
                      id
                      availableForSale
                      price
                    }
                  }
                }
              }
            }
          }
        }
      `,
    ); // He agregado 'handle' arriba para poder generar los links

    let responseBody = response;
    if (response.body) {
      responseBody = response.body;
    } else if (typeof response.json === 'function') {
      responseBody = await response.json();
    }

    if (!responseBody.data || !responseBody.data.products) {
      console.warn("⚠️ [Shopify] Respuesta vacía o estructura inesperada.");
      return [];
    }

    const products = responseBody.data.products.edges;

    // LOG DE RESULTADO
    console.log(`🛒 [Shopify Response] Productos encontrados: ${products.length}`);

    return products.map(({ node }) => ({
      title: node.title,
      handle: node.handle, // Necesario para crear el link en ai.js
      price: node.priceRangeV2.minVariantPrice.amount,
      currency: node.priceRangeV2.minVariantPrice.currencyCode,
      available: node.totalInventory > 0 || node.variants.edges[0].node.availableForSale,
      variantId: node.variants.edges[0].node.id
    }));

  } catch (error) {
    console.error('🔥 Error CRÍTICO buscando en Shopify:', error);
    return [];
  }
}

/**
 * Crea un pedido manual en Shopify
 */
async function crearPedidoManual(items, datosCliente) {
  try {
    console.log(`📦 [Shopify Order] Intentando crear pedido para: ${datosCliente.email}`);

    const restClient = new shopify.clients.Rest({ session });

    const orderData = {
      order: {
        line_items: items.map(item => ({
          variant_id: parseInt(item.variantId.split('/').pop(), 10),
          quantity: item.quantity
        })),
        customer: {
          first_name: datosCliente.firstName,
          last_name: datosCliente.lastName,
          email: datosCliente.email
        },
        financial_status: 'pending',
        tags: 'pedido-whatsapp'
      }
    };

    const response = await restClient.post({
      path: 'orders',
      type: 'application/json',
      data: orderData,
    });

    const order = response.body.order;

    console.log(`✅ [Shopify Order] Pedido creado con éxito: #${order.name}`);

    return {
      orderNumber: order.name,
      totalPrice: order.total_price
    };

  } catch (error) {
    console.error('🔥 Error creando pedido en Shopify:', error);
    throw error;
  }
}

module.exports = {
  buscarProductos,
  crearPedidoManual
};