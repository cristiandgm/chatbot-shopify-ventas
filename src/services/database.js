/**
 * ARCHIVO: src/services/database.js
 * DESCRIPCIÓN: Gestión de persistencia en Firebase Firestore (SOPORTE JSON/ARRAY).
 * * CAMBIOS CLAVE:
 * - Soporte nativo para guardar Arrays de Objetos en 'memoria_long_term'.
 * - Normalización de datos al leer: Si encuentra el formato antiguo (mapa), 
 * lo extrae para que la IA no falle.
 */

const admin = require('firebase-admin');
const path = require('path');

// Inicialización Singleton de Firebase
// Se mantiene tu lógica original de carga de credenciales
if (!admin.apps.length) {
    try {
        const serviceAccount = require(path.join(__dirname, '../../firebase-key.json'));
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
        console.log("🚀 Firebase Conectado: Modo Array/JSON Activo.");
    } catch (error) {
        console.error("❌ Error cargando Firebase:", error.message);
    }
}

const db = admin.firestore();

module.exports = {
    db,

    /**
     * Obtiene el perfil del cliente.
     * INCLUYE PARCHE DE COMPATIBILIDAD: Convierte formatos viejos a lo que espera la nueva IA.
     */
    obtenerOSetearCliente: async (whatsappId, nombre) => {
        try {
            const userRef = db.collection('clientes').doc(whatsappId);
            const doc = await userRef.get();

            if (!doc.exists) {
                // CREACIÓN DE CLIENTE NUEVO CON ESTRUCTURA MODERNA (ARRAY)
                const nuevoPerfil = {
                    perfil: {
                        nombre: nombre || "Amigo/a",
                        fechaRegistro: admin.firestore.FieldValue.serverTimestamp()
                    },
                    // AHORA ES UN ARRAY, NO UN OBJETO CON STRINGS
                    memoria_long_term: [],
                    metadata: {
                        necesitaAtencionHumana: false,
                        ultimaInteraccion: admin.firestore.FieldValue.serverTimestamp(),
                        versionMemoria: 2 // Subimos versión para rastrear
                    }
                };
                await userRef.set(nuevoPerfil);
                return nuevoPerfil;
            }

            // CLIENTE EXISTENTE: LÓGICA DE NORMALIZACIÓN
            let data = doc.data();

            // PARCHE: Si la memoria viene en formato antiguo (Objeto/Map), extraemos lo útil.
            // Esto arregla el problema de tu foto donde 'memoria_long_term' tiene 'notas_mascotas'.
            if (data.memoria_long_term && !Array.isArray(data.memoria_long_term) && typeof data.memoria_long_term === 'object') {
                // Si es el formato viejo, devolvemos el string antiguo para que la IA lo migre,
                // o un array vacío si no había nada.
                const notasViejas = data.memoria_long_term.notas_mascotas || "";

                // Sobrescribimos en memoria (no en DB aún) para que la IA reciba lo que espera
                data.memoria_long_term = notasViejas ? [{ nombre: "Mascota (Datos Previos)", notas: notasViejas }] : [];
            }

            // Actualizamos timestamp
            await userRef.update({
                'metadata.ultimaInteraccion': admin.firestore.FieldValue.serverTimestamp()
            });

            return data;
        } catch (error) {
            console.error(`🔥 Error DB (${whatsappId}):`, error.message);
            throw error;
        }
    },

    /**
     * Actualiza la memoria. Acepta ARRAY (JSON) y reemplaza el campo en Firestore.
     */
    actualizarMemoriaDePorVida: async (whatsappId, nuevaMemoria) => {
        try {
            // Verificación de seguridad: Solo guardamos si es un Array válido
            if (!nuevaMemoria || !Array.isArray(nuevaMemoria)) {
                console.warn("⚠️ Intento de guardar memoria inválida (No es Array):", typeof nuevaMemoria);
                return;
            }

            const userRef = db.collection('clientes').doc(whatsappId);

            // ACTUALIZACIÓN DIRECTA
            // Firestore cambiará automáticamente el tipo de dato de Map a Array.
            await userRef.update({
                "memoria_long_term": nuevaMemoria,
                "metadata.ultimaActualizacionMemoria": admin.firestore.FieldValue.serverTimestamp(),
                "metadata.versionMemoria": 2
            });

            console.log(`💾 Memoria guardada en Firestore (${whatsappId}): ${nuevaMemoria.length} mascotas.`);
        } catch (error) {
            console.error("🔥 Error guardando array en Firestore:", error.message);
        }
    }
};