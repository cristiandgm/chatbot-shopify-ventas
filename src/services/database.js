const admin = require('firebase-admin');

// Asegura que Firebase se inicialice antes de definir 'db'
if (!admin.apps.length) {
    const path = require('path');
    const serviceAccount = require(path.join(__dirname, '../../firebase-key.json'));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

module.exports = {
    guardarCarrito: async (whatsappId, nuevosItems) => {
        try {
            const userRef = db.collection('clientes').doc(whatsappId);
            const total = nuevosItems.reduce((acc, item) => acc + (item.precio * item.cantidad), 0);

            // Usamos .set con merge: true para que cree el doc si no existe 
            // o solo actualice el campo 'carrito' si ya existe.
            await userRef.set({
                carrito: {
                    items: nuevosItems,
                    total: total,
                    ultimaActualizacion: admin.firestore.FieldValue.serverTimestamp(),
                    cumpleMinimo: total >= 150000
                }
            }, { merge: true });

            return { total, cumpleMinimo: total >= 150000 };
        } catch (error) {
            console.error("🔥 Error en database.js:", error);
            throw error;
        }
    }
};