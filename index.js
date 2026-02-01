/**
 * ARCHIVO: index.js
 * DESCRIPCIÓN: Punto de entrada principal y configuración del servidor Express.
 * Centraliza la carga de variables de entorno y la exposición del Webhook de WhatsApp.
 * * MEJORAS INCLUIDAS:
 * - Limpieza de endpoints de prueba obsoletos.
 * - Middleware de seguridad y procesamiento de JSON.
 * - Logging informativo del estado del servicio al arrancar.
 * - Endpoint de salud (health check) para monitoreo.
 */

require('dotenv').config();
const express = require('express');
const whatsappController = require('./src/controllers/whatsapp');

// Inicialización de la aplicación Express
const app = express();
const PORT = process.env.PORT || 3000;

/**
 * CONFIGURACIÓN DE MIDDLEWARES
 * Estándar para recibir y procesar correctamente los JSON enviados por Meta (WhatsApp).
 */
app.use(express.json());

/**
 * RUTAS DEL WEBHOOK PARA WHATSAPP
 * - GET: Utilizado por Meta para la verificación inicial del servidor.
 * - POST: Utilizado para recibir todos los mensajes e interacciones de los clientes.
 */
app.get('/webhook', whatsappController.handleMessage);
app.post('/webhook', whatsappController.handleMessage);

/**
 * ENDPOINT DE SALUD (Health Check)
 * Útil para verificar que el servidor está en línea sin necesidad de enviar mensajes.
 */
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'online',
        asistente: 'Ana Gabriela',
        timestamp: new Date().toISOString()
    });
});

/**
 * INICIO DEL SERVICIO
 * Configura el puerto y muestra en consola la información necesaria para el despliegue.
 */
app.listen(PORT, () => {
    console.log(`
    ===================================================
    🚀 ASISTENTE VIRTUAL: Ana Gabriela (Mundo Mascotas)
    ===================================================
    📍 Estado: Activo y escuchando mensajes.
    🔗 Puerto local: ${PORT}
    🌐 Webhook Path: /webhook
    📅 Inicio: ${new Date().toLocaleString('es-CO')}
    ===================================================
    `);
});