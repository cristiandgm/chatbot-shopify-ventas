# Chatbot Shopify Assistant

Este proyecto conecta WhatsApp con Shopify para actuar como un Asistente de Ventas.

## Características
- Búsqueda de productos en Shopify.
- Creación de pedidos manuales con estado "Pending".
- Instrucciones de pago automáticas.

## Configuración

### 1. Requisitos Previos
- Node.js instalado.
- Cuenta de Shopify Partner/Admin.
- Cuenta de Meta Developers (WhatsApp Cloud API).

### 2. Variables de Entorno (.env)
Renombra `.env.example` a `.env` o crea uno nuevo con:

```env
PORT=3000
SHOPIFY_SHOP_URL=tu-tienda.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxxxxxxxxxxxxx
BANK_INSTRUCTIONS=Tu información bancaria aquí...
WEBHOOK_VERIFY_TOKEN=tu_token_de_verificacion_meta
```

**IMPORTANTE**: 
1. Obtén el `SHOPIFY_ACCESS_TOKEN` desde una App Privada o Custom App en Shopify.
2. Asegúrate de habilitar los siguientes **Admin API Scopes**:
   - `write_orders`
   - `read_products`
3. Configura `BANK_INSTRUCTIONS` con tus datos reales.

### 3. Instalación y Ejecución

```bash
npm install
npm start
``` 

### 4. Uso
- **Webhook**: Configura `YOUR_URL/webhook` en Meta Developers.
- **Test**: Puedes probar la creación de órdenes vía POST a `/test-order` (ver `index.js`).

## Estructura
- `src/services/shopify.js`: Lógica de conexión con Shopify.
- `src/controllers/whatsapp.js`: Manejo de mensajes y formateo de respuestas.
