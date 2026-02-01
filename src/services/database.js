/**
 * ARCHIVO: src/services/database.js
 * DESCRIPCIÓN: Gestión de persistencia en Firebase Firestore con enfoque en Memoria de Largo Plazo.
 * Organiza la información para que el asistente reconozca al cliente y sus mascotas permanentemente.
 * * ESTRUCTURA MEJORADA:
 * - Colección 'clientes' -> Documento [whatsappId]
 * - Campos raíz: perfil, memoria_long_term (Conocimiento acumulado), metadata.
 * - Subcolección: 'historial_chat' (Registro de mensajes).
 */

const admin = require('firebase-admin');
const path = require('path');

// Inicialización de Firebase Admin SDK
if (!admin.apps.length) {
    try {
        const serviceAccount = require(path.join(__dirname, '../../firebase-key.json'));
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
        console.log("🚀 Conexión con Firebase establecida para Memoria de Largo Plazo.");
    } catch (error) {
        console.error("❌ Error cargando configuración de Firebase:", error.message);
    }
}

const db = admin.firestore();

module.exports = {
    db,

    /**
     * Obtiene la Ficha Técnica del cliente o crea una nueva.
     * Diseñado para que la IA lea 'memoria_long_term' y sepa quién es el cliente al instante.
     */
    obtenerOSetearCliente: async (whatsappId, nombre) => {
        try {
            const userRef = db.collection('clientes').doc(whatsappId);
            const doc = await userRef.get();

            if (!doc.exists) {
                // ESTRUCTURA DE MEMORIA DE POR VIDA
                const nuevoPerfil = {
                    perfil: {
                        nombre: nombre || "Amigo/a",
                        fechaRegistro: admin.firestore.FieldValue.serverTimestamp()
                    },
                    // SECCIÓN CRÍTICA: Aquí reside el conocimiento evolutivo
                    memoria_long_term: {
                        notas_mascotas: "",      // Segmentado por: [Nombre]: Detalles
                        preferencias_dueño: "",  // Gustos, ubicación, nivel de experiencia
                        historial_relevante: ""  // Incidentes pasados o hitos importantes
                    },
                    metadata: {
                        necesitaAtencionHumana: false,
                        ultimaInteraccion: admin.firestore.FieldValue.serverTimestamp(),
                        versionMemoria: 1
                    }
                };
                await userRef.set(nuevoPerfil);
                return nuevoPerfil;
            }

            // Actualizamos solo la última interacción para mantener el perfil activo
            await userRef.update({
                'metadata.ultimaInteraccion': admin.firestore.FieldValue.serverTimestamp()
            });

            return doc.data();
        } catch (error) {
            console.error(`🔥 Error recuperando perfil (${whatsappId}):`, error.message);
            throw error;
        }
    },

    /**
     * Actualiza la memoria acumulada. No borra el historial, mejora la ficha técnica.
     * @param {string} whatsappId - ID del cliente.
     * @param {Object} dataActualizada - Objeto con los campos de memoria a actualizar.
     */
    actualizarMemoriaDePorVida: async (whatsappId, nuevasNotas) => {
        try {
            const notasLimpias = nuevasNotas ? nuevasNotas.replace(/SIN_CAMBIOS/g, "").trim() : "";
            if (!notasLimpias || notasLimpias.length < 5) return;

            const userRef = db.collection('clientes').doc(whatsappId);

            // Actualizamos la memoria sin tocar el historial ni los datos básicos del perfil
            await userRef.update({
                "memoria_long_term.notas_mascotas": notasLimpias,
                "metadata.ultimaActualizacionMemoria": admin.firestore.FieldValue.serverTimestamp()
            });

            console.log(`🧠 Memoria de largo plazo sincronizada para: ${whatsappId}`);
        } catch (error) {
            console.error("🔥 Error escribiendo en la memoria permanente:", error.message);
        }
    }
};