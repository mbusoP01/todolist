const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const mongoose = require('mongoose');

// --- 1. SETUP SERVER & DATABASE ---
const app = express();
const port = process.env.PORT || 3000;

// Connect to MongoDB using the "Secret" Environment Variable
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('✅ Connected to Database'))
    .catch(err => console.error('❌ Database Connection Error:', err));

// Define the "Task" structure
const TaskSchema = new mongoose.Schema({
    description: String,
    dateAdded: { type: Date, default: Date.now }
});
const Task = mongoose.model('Task', TaskSchema);

// Keep-Alive Web Server
app.get('/', (req, res) => res.send('Bot is persistent and running! 🤖'));
app.listen(port, () => console.log(`Server on port ${port}`));

// --- 2. WHATSAPP CLIENT ---
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process']
    }
});

client.on('qr', (qr) => {
    console.log('SCAN THIS QR CODE:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => console.log('✅ WhatsApp Client Ready!'));

client.on('message', async msg => {
    const text = msg.body.trim();

    // COMMAND: !add <Task>
    if (text.startsWith('!add ')) {
        const description = text.replace('!add ', '');
        try {
            // Save to Database
            const newTask = new Task({ description });
            await newTask.save();
            msg.reply(`💾 Saved to DB: "${description}"`);
        } catch (e) {
            msg.reply('❌ Error saving task.');
        }
    }

    // COMMAND: !list
    else if (text === '!list') {
        // Fetch from Database
        const tasks = await Task.find(); 
        if (tasks.length === 0) return msg.reply("📂 List is empty.");
        
        const listText = tasks.map((t, i) => `${i + 1}. ${t.description}`).join('\n');
        msg.reply(`📝 *Current To-Do List:*\n${listText}`);
    }

    // COMMAND: !done <Number>
    else if (text.startsWith('!done ')) {
        const index = parseInt(text.split(' ')[1]) - 1;
        const tasks = await Task.find(); // Get current list to find ID
        
        if (tasks[index]) {
            // Delete from Database
            await Task.findByIdAndDelete(tasks[index]._id);
            msg.reply(`✅ Completed & Removed: "${tasks[index].description}"`);
        } else {
            msg.reply('❌ Invalid number.');
        }
    }
});

client.initialize();
