const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode'); // Note: This is the image generator now
const express = require('express');
const mongoose = require('mongoose');

const app = express();
const port = process.env.PORT || 3000;

// Variables to store state
let qrCodeImage = '';
let isClientReady = false;

// --- DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('✅ Connected to Database'))
    .catch(err => console.error('❌ Database Connection Error:', err));

const TaskSchema = new mongoose.Schema({
    description: String,
    dateAdded: { type: Date, default: Date.now }
});
const Task = mongoose.model('Task', TaskSchema);

// --- WEB SERVER (The Visual Interface) ---
app.get('/', (req, res) => {
    if (isClientReady) {
        res.send(`
            <div style="font-family: sans-serif; text-align: center; padding: 50px;">
                <h1>✅ Bot is Connected!</h1>
                <p>You can close this window. Your bot is listening on WhatsApp.</p>
            </div>
        `);
    } else if (qrCodeImage) {
        res.send(`
            <div style="font-family: sans-serif; text-align: center; padding: 50px;">
                <h1>Scan this QR Code</h1>
                <p>Open WhatsApp > Settings > Linked Devices > Link a Device</p>
                <img src="${qrCodeImage}" alt="QR Code" style="width: 300px; height: 300px; border: 2px solid #333;"/>
                <p>Refresh this page if the code expires.</p>
            </div>
        `);
    } else {
        res.send(`
            <div style="font-family: sans-serif; text-align: center; padding: 50px;">
                <h1>⏳ Starting up...</h1>
                <p>Please wait 10-20 seconds and refresh this page.</p>
            </div>
        `);
    }
});

app.listen(port, () => console.log(`Server on port ${port}`));

// --- WHATSAPP CLIENT ---
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process']
    }
});

client.on('qr', (qr) => {
    // Convert the text code into a Data URL (Image)
    QRCode.toDataURL(qr, (err, url) => {
        if (err) console.log('Error generating QR image');
        else {
            qrCodeImage = url;
            console.log('QR Code generated. Visit the website to scan it.');
        }
    });
});

client.on('ready', () => {
    console.log('✅ WhatsApp Client Ready!');
    isClientReady = true;
});

// IMPORTANT: Use 'message_create' so it hears YOU too
client.on('message_create', async msg => {
    const text = msg.body.trim();

    // Prevent bot from replying to its own confirmation messages
    if (msg.fromMe && msg.body.startsWith('✅')) return;
    if (msg.fromMe && msg.body.startsWith('💾')) return;

    if (text.startsWith('!add ')) {
        const description = text.replace('!add ', '');
        try {
            const newTask = new Task({ description });
            await newTask.save();
            // Only reply if it's a group, or if it's you talking to yourself
            // (Avoids spamming if the logic loops)
            msg.reply(`💾 Saved: "${description}"`);
        } catch (e) { console.log(e); }
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
