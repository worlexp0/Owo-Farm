const {
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
  PermissionFlagsBits, ChannelType, EmbedBuilder
} = require('discord.js');
const { Client: SelfbotClient } = require('discord.js-selfbot-v13');
const http = require('http');

// ====== ORTAM ======
const BOT_TOKEN = process.env.BOT_TOKEN;
const OWNER_ID = process.env.OWNER_ID;
const WEBHOOK_URL = process.env.WEBHOOK_URL || null;

console.log('🚀 Bot başlatılıyor...');
console.log('🔑 BOT_TOKEN:', BOT_TOKEN ? `${BOT_TOKEN.slice(0, 10)}...` : 'YOK');
console.log('👑 OWNER_ID:', OWNER_ID || 'YOK');

if (!BOT_TOKEN) { console.error('❌ BOT_TOKEN eksik!'); process.exit(1); }
if (!OWNER_ID) { console.error('❌ OWNER_ID eksik!'); process.exit(1); }

// ====== AYARLAR ======
const PLANLAR = ['Free', 'Premium', 'Admin'];
const PLAN_LIMITLERI = { Free: 5, Premium: 10, Admin: 25 };
const MIN_SANIYE = 22;
const MAX_SANIYE = 28;
const OWO_BOT_ID = '408785106942164992';
let FARM_KOMUTLARI = ['wh', 'wb'];

// ====== FARMS MAP ======
const farms = new Map();

// ====== HEALTH CHECK SERVER ======
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ok',
    bot: bot?.user?.tag || 'başlatılıyor',
    farms: farms.size,
    uptime: Math.floor(process.uptime()) + 's',
  }));
}).listen(PORT, () => {
  console.log(`🌐 Health check aktif: port ${PORT}`);
});

// ====== DISCORD BOT ======
const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ====== SLASH KOMUTLARI ======
const commands = [
  new SlashCommandBuilder()
    .setName('add')
    .setDescription('OwO hesap(lar)ını bota bağla')
    .addStringOption(o => o.setName('tokens').setDescription('Token(lar)').setRequired(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('plan_upgrade')
    .setDescription('Plan yükselt')
    .addStringOption(o => o.setName('plan').setDescription('Premium veya Admin').setRequired(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('komut_ekle')
    .setDescription('Farm listesine komut ekle')
    .addStringOption(o => o.setName('komut').setDescription('Örn: owo hunt').setRequired(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('komut_sil')
    .setDescription('Farm listesinden komut sil')
    .addStringOption(o => o.setName('komut').setDescription('Silinecek komut').setRequired(true))
    .toJSON(),
  new SlashCommandBuilder().setName('komut_liste').setDescription('Listeyi göster').toJSON(),
  new SlashCommandBuilder().setName('komut_temizle').setDescription('wh, wb olarak sıfırla').toJSON(),
  new SlashCommandBuilder()
    .setName('komut_ayarla')
    .setDescription('Listeyi komple değiştir')
    .addStringOption(o => o.setName('komutlar').setDescription('wh,wb,owo hunt').setRequired(true))
    .toJSON(),
];

// ====== BOT HAZIR ======
bot.once('ready', async () => {
  console.log('=================================');
  console.log(`✅ BOT HAZIR: ${bot.user.tag}`);
  console.log(`🆔 Bot ID: ${bot.user.id}`);
  console.log(`👑 Owner ID: ${OWNER_ID}`);
  console.log(`📊 Sunucu sayısı: ${bot.guilds.cache.size}`);
  console.log(`🔔 Webhook: ${WEBHOOK_URL ? 'AKTİF' : 'kapalı'}`);
  console.log(`📋 Komutlar: ${FARM_KOMUTLARI.join(', ')}`);
  console.log('=================================');

  const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(bot.user.id), { body: commands });
    console.log('✅ Slash komutları Discord\'a kaydedildi.');
  } catch (e) {
    console.error('❌ Komut kayıt hatası:', e.message);
  }
});

bot.on('error', (e) => console.error('❌ Bot hatası:', e.message));
bot.on('warn', (w) => console.warn('⚠️ Uyarı:', w));
bot.on('shardError', (e) => console.error('❌ Shard hatası:', e.message));

// ====== YETKİSİZ SUNUCUDAN ÇIK ======
bot.on('guildCreate', async (guild) => {
  if (guild.ownerId !== OWNER_ID) {
    console.log(`🚫 Yetkisiz sunucu: ${guild.name} — çıkıyorum.`);
    await guild.leave().catch(() => {});
  } else {
    console.log(`✅ Sunucuya katıldım: ${guild.name}`);
  }
});

// ====== SLASH KOMUT İŞLEYİCİ ======
bot.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.guild && interaction.guild.ownerId !== OWNER_ID) {
    await interaction.reply({ content: '🚫 Yetkisiz sunucu.', ephemeral: true }).catch(() => {});
    setTimeout(() => interaction.guild.leave().catch(() => {}), 3000);
    return;
  }

  try {
    // ====== /add ======
    if (interaction.commandName === 'add') {
      const raw = interaction.options.getString('tokens');
      const tokens = raw.split(/[\s,;]+/).map(t => t.trim()).filter(t => t.length > 20);

      if (tokens.length === 0) {
        return interaction.reply({ content: '❌ Geçerli token bulunamadı.', ephemeral: true });
      }

      let kullaniciPlani = 'Free';
      for (const [, f] of farms.entries()) {
        if (f.userId === interaction.user.id) { kullaniciPlani = f.plan; break; }
      }
      if (interaction.user.id === OWNER_ID) kullaniciPlani = 'Admin';

      const limit = PLAN_LIMITLERI[kullaniciPlani];
      let mevcutSayi = 0;
      for (const [, f] of farms.entries()) {
        if (f.userId === interaction.user.id) mevcutSayi++;
      }
      const kalan = limit - mevcutSayi;

      if (kalan <= 0) {
        return interaction.reply({
          content: `❌ **Limit doldu!** Plan: **${kullaniciPlani}** (max ${limit}), Mevcut: **${mevcutSayi}**`,
          ephemeral: true,
        });
      }

      let eklenecekler = tokens;
      if (tokens.length > kalan) eklenecekler = tokens.slice(0, kalan);

      await interaction.reply({ content: `⏳ **${eklenecekler.length}** token işleniyor...`, ephemeral: true });

      let basarili = 0, basarisiz = 0;
      const hatalar = [];

      for (let i = 0; i < eklenecekler.length; i++) {
        const token = eklenecekler[i];
        if (farms.has(token)) { basarisiz++; hatalar.push(`#${i + 1}: zaten ekli`); continue; }

        try {
          const sb = new SelfbotClient({ checkUpdate: false });
          await new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error('zaman aşımı')), 30000);
            sb.once('ready', () => { clearTimeout(t); resolve(); });
            sb.once('error', (e) => { clearTimeout(t); reject(e); });
            sb.login(token).catch(reject);
          });

          farms.set(token, {
            selfbot: sb,
            userId: interaction.user.id,
            channelId: interaction.channelId,
            plan: kullaniciPlani,
            timeout: null,
            stopped: false,
            captchaListenerEklendi: false,
          });
          startFarm(token);
          basarili++;
          console.log(`✅ Bağlandı: ${sb.user.username}`);
          await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
          basarisiz++;
          hatalar.push(`#${i + 1}: ${e.message.slice(0, 60)}`);
        }
      }

      let ozet = `✅ **Başarılı:** ${basarili}\n❌ **Başarısız:** ${basarisiz}\n`;
      ozet += `📊 Plan: **${kullaniciPlani}** (${mevcutSayi + basarili}/${limit})\n`;
      ozet += `⏱️ Aralık: ${MIN_SANIYE}–${MAX_SANIYE} sn`;
      if (hatalar.length > 0) ozet += `\n\n**Hatalar:**\n${hatalar.slice(0, 10).join('\n')}`;
      if (ozet.length > 1900) ozet = ozet.slice(0, 1900);

      await interaction.followUp({ content: ozet, ephemeral: true });
    }

    // ====== /plan_upgrade ======
    else if (interaction.commandName === 'plan_upgrade') {
      const plan = interaction.options.getString('plan');
      if (!PLANLAR.includes(plan)) {
        const embed = new EmbedBuilder()
          .setTitle('📋 Planlar')
          .setDescription('**Free** — 5 hesap\n**Premium** — 10 hesap\n**Admin** — 25 hesap');
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (plan === 'Free') {
        for (const [, f] of farms.entries()) {
          if (f.userId === interaction.user.id) f.plan = 'Free';
        }
        return interaction.reply({ content: '✅ Plan **Free**.', ephemeral: true });
      }

      const kanalAdi = `plan-${plan.toLowerCase()}-${interaction.user.username}`
        .toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 90);

      const channel = await interaction.guild.channels.create({
        name: kanalAdi,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          { id: OWNER_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        ],
      });

      let guncellenen = 0;
      for (const [, f] of farms.entries()) {
        if (f.userId === interaction.user.id) { f.plan = plan; guncellenen++; }
      }

      await interaction.reply({
        content: `✅ Plan **${plan}** aktif!\n📌 <#${channel.id}>\n🔄 Güncellenen: **${guncellenen}**`,
        ephemeral: true,
      });
    }

    // ====== /komut_ekle ======
    else if (interaction.commandName === 'komut_ekle') {
      const yeni = interaction.options.getString('komut').trim();
      if (FARM_KOMUTLARI.includes(yeni)) return interaction.reply({ content: `⚠️ Zaten var.`, ephemeral: true });
      if (FARM_KOMUTLARI.length >= 20) return interaction.reply({ content: '❌ Max 20.', ephemeral: true });
      FARM_KOMUTLARI.push(yeni);
      return interaction.reply({ content: `✅ Eklendi: \`${yeni}\`\n📋 ${FARM_KOMUTLARI.map(k => `\`${k}\``).join(', ')}`, ephemeral: true });
    }

    // ====== /komut_sil ======
    else if (interaction.commandName === 'komut_sil') {
      const sil = interaction.options.getString('komut').trim();
      const idx = FARM_KOMUTLARI.indexOf(sil);
      if (idx === -1) return interaction.reply({ content: `❌ Bulunamadı.`, ephemeral: true });
      if (FARM_KOMUTLARI.length <= 1) return interaction.reply({ content: '❌ En az 1 kalmalı.', ephemeral: true });
      FARM_KOMUTLARI.splice(idx, 1);
      return interaction.reply({ content: `🗑️ Silindi: \`${sil}\`\n📋 ${FARM_KOMUTLARI.map(k => `\`${k}\``).join(', ')}`, ephemeral: true });
    }

    // ====== /komut_liste ======
    else if (interaction.commandName === 'komut_liste') {
      const embed = new EmbedBuilder()
        .setTitle('📋 Farm Komutları')
        .setColor(0x00FF99)
        .setDescription(FARM_KOMUTLARI.map((k, i) => `**${i + 1}.** \`${k}\``).join('\n') + `\n\n⏱️ ${MIN_SANIYE}–${MAX_SANIYE} sn`);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ====== /komut_temizle ======
    else if (interaction.commandName === 'komut_temizle') {
      FARM_KOMUTLARI = ['wh', 'wb'];
      return interaction.reply({ content: `🧹 ${FARM_KOMUTLARI.map(k => `\`${k}\``).join(', ')}`, ephemeral: true });
    }

    // ====== /komut_ayarla ======
    else if (interaction.commandName === 'komut_ayarla') {
      const raw = interaction.options.getString('komutlar');
      const yeni = raw.split(',').map(k => k.trim()).filter(k => k.length > 0);
      if (yeni.length === 0 || yeni.length > 20) return interaction.reply({ content: '❌ 1-20 komut.', ephemeral: true });
      FARM_KOMUTLARI = yeni;
      return interaction.reply({ content: `✅ ${FARM_KOMUTLARI.map(k => `\`${k}\``).join(', ')}`, ephemeral: true });
    }
  } catch (e) {
    console.error('❌ Interaction hatası:', e);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: `❌ Hata: ${e.message}`, ephemeral: true });
      } else {
        await interaction.followUp({ content: `❌ Hata: ${e.message}`, ephemeral: true });
      }
    } catch (_) {}
  }
});

// ====== FARM DÖNGÜSÜ ======
function startFarm(token) {
  const farm = farms.get(token);
  if (!farm) return;

  if (!farm.captchaListenerEklendi) {
    farm.captchaListenerEklendi = true;

    farm.selfbot.on('messageCreate', async (msg) => {
      if (msg.author.id !== OWO_BOT_ID) return;
      const icerik = msg.content.toLowerCase();
      const captchaVar = icerik.includes('captcha') || icerik.includes('verify') ||
        icerik.includes('human') || icerik.includes('please complete');

      if (captchaVar || msg.components.length > 0) {
        console.log(`🛑 [${farm.selfbot.user.username}] CAPTCHA!`);
        farm.stopped = true;
        if (farm.timeout) clearTimeout(farm.timeout);

        if (WEBHOOK_URL) {
          try {
            await fetch(WEBHOOK_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content: `🚨 **CAPTCHA!** \`${farm.selfbot.user.username}\`\n${(msg.content || '(butonlu)').slice(0, 200)}` }),
            });
          } catch (e) {}
        }

        if (msg.components.length > 0) {
          try { await msg.clickButton(); console.log(`✅ Butona basıldı.`); } catch (e) {}
        }

        setTimeout(() => { farm.stopped = false; startFarm(token); }, 90000);
      }
    });
  }

  async function loop() {
    if (farm.stopped) return;
    try {
      const channel = await farm.selfbot.channels.fetch(farm.channelId);
      if (channel && FARM_KOMUTLARI.length > 0) {
        const komut = FARM_KOMUTLARI[Math.floor(Math.random() * FARM_KOMUTLARI.length)];
        await channel.send(komut);
        console.log(`[${farm.selfbot.user.username}] 📤 ${komut}`);
      }
    } catch (e) {
      console.log(`[${token.slice(0, 12)}...] ❌ ${e.message}`);
    }
    const bekleme = (Math.floor(Math.random() * (MAX_SANIYE - MIN_SANIYE + 1)) + MIN_SANIYE) * 1000;
    farm.timeout = setTimeout(loop, bekleme);
  }

  const ilk = (Math.floor(Math.random() * (MAX_SANIYE - MIN_SANIYE + 1)) + MIN_SANIYE) * 1000;
  farm.timeout = setTimeout(loop, ilk);
}

// ====== SHUTDOWN ======
async function shutdown() {
  console.log('🛑 Kapatılıyor...');
  for (const [, f] of farms.entries()) {
    f.stopped = true;
    if (f.timeout) clearTimeout(f.timeout);
    try { await f.selfbot.destroy(); } catch (e) {}
  }
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ====== LOGIN ======
bot.login(BOT_TOKEN).catch((e) => {
  console.error('❌ LOGIN HATASI:', e.message);
  console.error('Full error:', e);
});
