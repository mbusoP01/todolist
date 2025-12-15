const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const mongoose = require('mongoose');

// --- CONFIGURATION ---
// ENTER YOUR PHONE NUMBER HERE (Format: CountryCode + Number, no + symbol)
// Example for South Africa: 27821234567 (Drop the leading '0')
const myPhoneNumber = '27782514218'; 

// --- 1. SETUP SERVER & DATABASE ---
const app = express();
const port = process.env.PORT || 3000;

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('✅ Connected to Database'))
    .catch(err => console.error('❌ Database Connection Error:', err));

const TaskSchema = new mongoose.Schema({
    description: String,
    dateAdded: { type: Date, default: Date.now }
});
const Task = mongoose.model('Task', TaskSchema);

app.get('/', (req, res) => res.send('Bot is running! 🤖'));
app.listen(port, () => console.log(`Server on port ${port}`));

// --- 2. WHATSAPP CLIENT ---
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process']
    }
});

// MODIFIED CONNECTION LOGIC
client.on('qr', async (qr) => {
    // We still generate the QR just in case
    qrcode.generate(qr, { small: true });
    
    // HERE IS THE FIX: Request a Pairing Code
    try {
        console.log('Attempting to generate Pairing Code...');
        const code = await client.requestPairingCode(myPhoneNumber);
        console.log('------------------------------------------------');
        console.log('⚠️ YOUR PAIRING CODE: ' + code);
        console.log('------------------------------------------------');
    } catch (err) {
        console.log('Could not generate pairing code. Retrying...', err);
    }
});

client.on('ready', () => console.log('✅ WhatsApp Client Ready!'));

// ... (Rest of your message logic stays the same) ...

client.on('message', async msg => {
    const text = msg.body.trim();

    if (text.startsWith('!add ')) {
        const description = text.replace('!add ', '');
        try {
            const newTask = new Task({ description });
            await newTask.save();
            msg.reply(`💾 Saved: "${description}"`);
        } catch (e) { msg.reply('❌ Error saving.'); }
    }
    else if (text === '!list') {
        const tasks = await Task.find(); 
        if (tasks.length === 0) return msg.reply("📂 Empty.");
        const listText = tasks.map((t, i) => `${i + 1}. ${t.description}`).join('\n');
        msg.reply(`📝 *To-Do List:*\n${listText}`);
    }
    else if (text.startsWith('!done ')) {
        const index = parseInt(text.split(' ')[1]) - 1;
        const tasks = await Task.find();
        if (tasks[index]) {
            await Task.findByIdAndDelete(tasks[index]._id);
            msg.reply(`✅ Done: "${tasks[index].description}"`);
        }
    }
});

client.initialize();
