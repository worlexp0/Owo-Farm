const { Client } = require('discord.js-selfbot-v13');
require('dotenv').config();

const client = new Client({ checkUpdate: false });

let FARM_CHANNEL_ID = process.env.FARM_CHANNEL_ID || null;
// Kumar komutları eklendi. Miktarı (100) kendine göre değiştirebilirsin.
const KOMUTLAR = ['owo hunt', 'owo battle', 'owo cf 100', 'owo slots 100'];
const ARALIK_SANIYE = 15; // 15 saniyeden aşağı düşürme, ban yersin!

client.on('ready', () => {
  console.log(`✅ ${client.user.username} olarak giriş yapıldı!`);
  console.log(`📌 Farm kanalı: ${FARM_CHANNEL_ID || 'ayarlanmadı'}`);
  startFarm();
});

client.on('messageCreate', async (msg) => {
  if (msg.author.id !== client.user.id) return;

  if (msg.content.startsWith('!setkanal')) {
    const kanal = msg.mentions.channels.first();
    if (!kanal) {
      try { await msg.channel.send('❌ Kullanım: `!setkanal #kanal` (kanalı etiketle)'); } catch(e){}
      return;
    }
    FARM_CHANNEL_ID = kanal.id;
    try { await msg.channel.send(`✅ Farm kanalı ayarlandı: <#${kanal.id}>`); } catch(e){}
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
