require('dotenv').config();
const express = require('express');
const whatsappController = require('./src/controllers/whatsapp');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Main Webhook Route for WhatsApp
app.get('/webhook', whatsappController.handleMessage);
app.post('/webhook', whatsappController.handleMessage);

// Test endpoint to simulate the buy flow manually (for verification without WhatsApp)
app.post('/test-order', async (req, res) => {
    const { items, customer } = req.body;
    // Expects:
    // items: [{ variantId: "123", quantity: 1 }]
    // customer: { firstName: "John", lastName: "Doe", email: "john@example.com" }

    const responseText = await whatsappController.processPurchase(items, customer);
    res.send(responseText);
});

// Test endpoint for search
app.get('/test-search', async (req, res) => {
    const { q } = req.query;
    const responseText = await whatsappController.processSearch(q);
    res.send(responseText);
});

app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
    console.log(`Webhook URL: http://localhost:${PORT}/webhook`);
});
