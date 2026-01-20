require('dotenv').config();
const { shopifyApi, LATEST_API_VERSION, Session } = require('@shopify/shopify-api');
require('@shopify/shopify-api/adapters/node');

// Initialize Shopify API
// For a Custom App using only Access Token (Backend only), we set isCustomStoreApp: true
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
// En shopify.js
async function buscarProductos(keyword) {
  try {
    // ⚠️ EL CAMBIO MAESTRO:
    // Al quitar "title:", permitimos que Ana use "tag:", "product_type:", etc.
    // Solo mantenemos el filtro de status:ACTIVE para no vender cosas archivadas.
    const queryOptimized = `${keyword} AND status:ACTIVE`;

    const response = await client.request(
      `
        query {
          products(first: 5, query: "${queryOptimized}") {
            edges {
              node {
                title
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
    );

    let responseBody = response;
    if (response.body) {
      responseBody = response.body;
    } else if (typeof response.json === 'function') {
      responseBody = await response.json();
    }

    if (!responseBody.data || !responseBody.data.products) {
      return [];
    }

    const products = responseBody.data.products.edges;

    return products.map(({ node }) => ({
      title: node.title,
      price: node.priceRangeV2.minVariantPrice.amount,
      currency: node.priceRangeV2.minVariantPrice.currencyCode,
      available: node.totalInventory > 0 || node.variants.edges[0].node.availableForSale,
      variantId: node.variants.edges[0].node.id // Useful for ordering
    }));
  } catch (error) {
    console.error('Error buscando productos:', error);
    return [];
  }
}

/**
 * Crea un pedido manual en Shopify
 * @param {Array} items - Lista de items { variantId, quantity }
 * @param {Object} datosCliente - { email, firstName, lastName }
 * @returns {Promise<Object>} - { orderNumber, totalParams }
 */
async function crearPedidoManual(items, datosCliente) {
  try {
    const restClient = new shopify.clients.Rest({ session });

    const orderData = {
      order: {
        line_items: items.map(item => ({
          variant_id: parseInt(item.variantId.split('/').pop(), 10), // Ensure ID is numeric integer
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

    return {
      orderNumber: order.name, // e.g. #1025
      totalPrice: order.total_price
    };

  } catch (error) {
    console.error('Error creando pedido:', error);
    throw error;
  }
}

module.exports = {
  buscarProductos,
  crearPedidoManual
};
