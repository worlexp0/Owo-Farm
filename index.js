const { Client } = require('discord.js-selfbot-v13');
require('dotenv').config();

const client = new Client({ checkUpdate: false });

// Ayarlar - burayı düzenleyebilirsin
let FARM_CHANNEL_ID = process.env.FARM_CHANNEL_ID || null;
const KOMUTLAR = ['owo hunt', 'owo battle', 'owo pray', 'owo daily'];
const ARALIK_SANIYE = 20; // her 20 saniyede bir komut atar

client.on('ready', () => {
  console.log(`✅ ${client.user.username} olarak giriş yapıldı!`);
  console.log(`📌 Farm kanalı: ${FARM_CHANNEL_ID || 'ayarlanmadı (!setkanal #kanal)'}`);
  startFarm();
});

client.on('messageCreate', async (msg) => {
  // !setkanal komutu ile kanal belirleme
  if (msg.author.id === client.user.id && msg.content.startsWith('!setkanal')) {
    const kanal = msg.mentions.channels.first();
    if (!kanal) return msg.edit('❌ Kanal etiketle: `!setkanal #kanal`');
    FARM_CHANNEL_ID = kanal.id;
    msg.edit(`✅ Farm kanalı ayarlandı: <#${kanal.id}>`);
    console.log(`📌 Yeni farm kanalı: ${kanal.id}`);
    startFarm();
  }
});

let farmInterval = null;
function startFarm() {
  if (farmInterval) clearInterval(farmInterval);
  if (!FARM_CHANNEL_ID) return;

  farmInterval = setInterval(async () => {
    try {
      const kanal = await client.channels.fetch(FARM_CHANNEL_ID);
      if (!kanal) return;
      const komut = KOMUTLAR[Math.floor(Math.random() * KOMUTLAR.length)];
      await kanal.send(komut);
      console.log(`📤 Gönderildi: ${komut}`);
    } catch (e) {
      console.log('❌ Hata:', e.message);
    }
  }, ARALIK_SANIYE * 1000);
}

client.login(process.env.TOKEN);
