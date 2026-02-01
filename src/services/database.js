/**
 * ARCHIVO: services/database.js
 * DESCRIPCIÓN: Gestión de Firebase Firestore. 
 * Se encarga de la persistencia de perfiles y la memoria de largo plazo.
 */

const admin = require('firebase-admin');
const path = require('path');

// Inicialización de Firebase Admin SDK
if (!admin.apps.length) {
    const serviceAccount = require(path.join(__dirname, '../../firebase-key.json'));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

module.exports = {
    db,

    /**
     * Obtiene los datos del cliente o crea uno nuevo si no existe.
     * @param {string} whatsappId - ID único del cliente (número de teléfono).
     * @param {string} nombre - Nombre del perfil de WhatsApp.
     */
    obtenerOSetearCliente: async (whatsappId, nombre) => {
        try {
            const userRef = db.collection('clientes').doc(whatsappId);
            const doc = await userRef.get();

            if (!doc.exists) {
                // Si el cliente es nuevo, creamos la estructura base
                const nuevoPerfil = {
                    perfil: {
                        nombre: nombre || "Amigo/a"
                    },
                    notas_mascota: "", // Campo destinado a la memoria integral (Cliente + Mascota)
                    metadata: {
                        necesitaAtencionHumana: false,
                        fechaRegistro: admin.firestore.FieldValue.serverTimestamp(),
                        ultimaInteraccion: admin.firestore.FieldValue.serverTimestamp()
                    }
                };
                await userRef.set(nuevoPerfil);
                return nuevoPerfil;
            }

            // Si ya existe, actualizamos la fecha de su última visita
            await userRef.update({
                'metadata.ultimaInteraccion': admin.firestore.FieldValue.serverTimestamp()
            });

            return doc.data();
        } catch (error) {
            console.error("🔥 Error en database.js (obtenerOSetearCliente):", error);
            throw error;
        }
    },

    /**
     * Guarda la información extraída por la IA sobre el cliente y sus mascotas.
     * @param {string} whatsappId - ID del cliente.
     * @param {string} nuevasNotas - Texto consolidado con los nuevos datos aprendidos.
     */

    actualizarNotasMascota: async (whatsappId, nuevasNotas) => {
        try {
            // Limpieza básica de la respuesta de la IA
            const notasLimpias = nuevasNotas ? nuevasNotas.replace(/SIN_CAMBIOS/g, "").trim() : "";

            if (!notasLimpias || notasLimpias.length < 3) return;

            const userRef = db.collection('clientes').doc(whatsappId);

            // Forzamos la actualización del campo específico
            await userRef.update({
                "notas_mascota": notasLimpias,
                "metadata.ultimaActualizacionNotas": admin.firestore.FieldValue.serverTimestamp()
            });

            console.log(`✅ Memoria grabada en documento: ${whatsappId}`);
        } catch (error) {
            console.error("🔥 Error escribiendo en Firestore:", error.message);
        }
    }
};