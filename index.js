const {
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
  PermissionFlagsBits, ChannelType, EmbedBuilder
} = require('discord.js');
const { Client: SelfbotClient } = require('discord.js-selfbot-v13');
require('dotenv').config();

// ====== ORTAM ======
const BOT_TOKEN = process.env.BOT_TOKEN;
const OWNER_ID = process.env.OWNER_ID;
const WEBHOOK_URL = process.env.WEBHOOK_URL || null;

if (!BOT_TOKEN) { console.error('❌ BOT_TOKEN eksik!'); process.exit(1); }
if (!OWNER_ID) { console.error('❌ OWNER_ID eksik!'); process.exit(1); }

// ====== AYARLAR ======
const PLANLAR = ['Free', 'Premium', 'Admin'];
const FARM_KOMUTLARI = ['wh', 'wb'];
const MIN_SANIYE = 22;
const MAX_SANIYE = 28;
const OWO_BOT_ID = '408785106942164992';

// Map<token, { selfbot, userId, channelId, guildId, plan, timeout, stopped }>
const farms = new Map();

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
    .setDescription('OwO hesap(lar)ını bota bağla — birden fazla token destekler')
    .addStringOption(o =>
      o.setName('tokens')
        .setDescription('Token(lar) — boşluk, virgül veya alt satır ile ayır')
        .setRequired(true))
    .toJSON(),

  new SlashCommandBuilder()
    .setName('plan_upgrade')
    .setDescription('Plan yükselt (Premium veya Admin)')
    .addStringOption(o =>
      o.setName('plan')
        .setDescription('Premium veya Admin')
        .setRequired(true))
    .toJSON(),
];

// ====== BOT HAZIR ======
bot.once('ready', async () => {
  console.log(`✅ Bot hazır: ${bot.user.tag}`);
  console.log(`👑 Owner ID: ${OWNER_ID}`);
  console.log(`🔔 Webhook: ${WEBHOOK_URL ? 'AKTİF' : 'kapalı'}`);

  const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(bot.user.id), { body: commands });
    console.log('✅ Slash komutları kaydedildi.');
  } catch (e) {
    console.error('❌ Komut kayıt hatası:', e.message);
  }
});

// ====== YETKİSİZ SUNUCUDAN ÇIK ======
bot.on('guildCreate', async (guild) => {
  if (guild.ownerId !== OWNER_ID) {
    console.log(`🚫 Yetkisiz sunucu: ${guild.name} — çıkıyorum.`);
    await guild.leave().catch(() => {});
  }
});

// ====== SLASH KOMUT İŞLEYİCİ ======
bot.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // Yetkisiz sunucu kontrolü
  if (interaction.guild && interaction.guild.ownerId !== OWNER_ID) {
    await interaction.reply({
      content: '🚫 Bu bot yetkisiz sunucuda çalışmaz. Ayrılıyorum.',
      ephemeral: true,
    }).catch(() => {});
    setTimeout(() => interaction.guild.leave().catch(() => {}), 3000);
    return;
  }

  // ====== /add ======
  if (interaction.commandName === 'add') {
    const raw = interaction.options.getString('tokens');

    const tokens = raw
      .split(/[\s,;]+/)
      .map(t => t.trim())
      .filter(t => t.length > 20);

    if (tokens.length === 0) {
      return interaction.reply({ content: '❌ Geçerli token bulunamadı.', ephemeral: true });
    }

    await interaction.reply({
      content: `⏳ **${tokens.length}** token işleniyor... Bu işlem biraz sürebilir.`,
      ephemeral: true,
    });

    let basarili = 0;
    let basarisiz = 0;
    const hatalar = [];
    const basariliHesaplar = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      if (farms.has(token)) {
        basarisiz++;
        hatalar.push(`#${i + 1}: zaten ekli`);
        continue;
      }

      try {
        const sb = new SelfbotClient({ checkUpdate: false });

        await new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('zaman aşımı (30sn)')), 30000);
          sb.once('ready', () => { clearTimeout(t); resolve(); });
          sb.once('error', (e) => { clearTimeout(t); reject(e); });
          sb.login(token).catch(reject);
        });

        farms.set(token, {
          selfbot: sb,
          userId: interaction.user.id,
          channelId: interaction.channelId,
          guildId: interaction.guildId,
          plan: 'Free',
          timeout: null,
          stopped: false,
        });

        startFarm(token);
        basarili++;
        basariliHesaplar.push(sb.user.username);

        await new Promise(r => setTimeout(r, 1000)); // rate limit önleme
      } catch (e) {
        basarisiz++;
        hatalar.push(`#${i + 1}: ${e.message.slice(0, 60)}`);
      }
    }

    let ozet = `✅ **Başarılı:** ${basarili}\n❌ **Başarısız:** ${basarisiz}\n`;
    ozet += `📌 Kanal: <#${interaction.channelId}>\n`;
    ozet += `⏱️ Aralık: ${MIN_SANIYE}–${MAX_SANIYE} saniye\n`;
    ozet += `🎮 Komutlar: \`wh\`, \`wb\`\n`;

    if (basariliHesaplar.length > 0) {
      ozet += `\n**Bağlananlar:**\n${basariliHesaplar.slice(0, 20).join(', ')}`;
      if (basariliHesaplar.length > 20) ozet += ` ... ve ${basariliHesaplar.length - 20} tane daha`;
    }

    if (hatalar.length > 0) {
      ozet += `\n\n**Hatalar:**\n${hatalar.slice(0, 15).join('\n')}`;
      if (hatalar.length > 15) ozet += `\n... ve ${hatalar.length - 15} tane daha`;
    }

    if (ozet.length > 1900) ozet = ozet.slice(0, 1900) + '\n...(kısaltıldı)';

    await interaction.followUp({ content: ozet, ephemeral: true });
  }

  // ====== /plan_upgrade ======
  if (interaction.commandName === 'plan_upgrade') {
    const plan = interaction.options.getString('plan');

    if (!PLANLAR.includes(plan)) {
      const embed = new EmbedBuilder()
        .setTitle('📋 Mevcut Planlar')
        .setColor(0x5865F2)
        .setDescription(
          '**Free** — Sadece `/add`, 22–28 sn aralık, sınırsız token\n' +
          '**Premium** — Özel kanal, öncelikli farm, 3 hesap\n' +
          '**Admin** — Sınırsız hesap, tüm özellikler'
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (plan === 'Free') {
      for (const [, f] of farms.entries()) {
        if (f.userId === interaction.user.id) f.plan = 'Free';
      }
      return interaction.reply({ content: '✅ Plan **Free** olarak ayarlandı.', ephemeral: true });
    }

    try {
      const kanalAdi = `plan-${plan.toLowerCase()}-${interaction.user.username}`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .slice(0, 90);

      const channel = await interaction.guild.channels.create({
        name: kanalAdi,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          {
            id: interaction.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          },
          {
            id: OWNER_ID,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageChannels,
            ],
          },
        ],
      });

      let guncellenen = 0;
      for (const [, f] of farms.entries()) {
        if (f.userId === interaction.user.id) { f.plan = plan; guncellenen++; }
      }

      await interaction.reply({
        content:
          `✅ Plan **${plan}** aktifleştirildi!\n` +
          `📌 Özel kanal: <#${channel.id}>\n` +
          `🔄 Güncellenen hesap: **${guncellenen}**`,
        ephemeral: true,
      });
    } catch (e) {
      await interaction.reply({ content: `❌ Kanal oluşturma hatası: ${e.message}`, ephemeral: true });
    }
  }
});

// ====== FARM DÖNGÜSÜ + CAPTCHA DİNLEYİCİ ======
function startFarm(token) {
  const farm = farms.get(token);
  if (!farm) return;

  // Captcha dinleyici (aynı selfbot'a iki kere eklenmesin)
  if (!farm.captchaListenerEklendi) {
    farm.captchaListenerEklendi = true;

    farm.selfbot.on('messageCreate', async (msg) => {
      if (msg.author.id !== OWO_BOT_ID) return;

      const icerik = msg.content.toLowerCase();
      const captchaVar =
        icerik.includes('captcha') ||
        icerik.includes('verify') ||
        icerik.includes('human') ||
        icerik.includes('are you a') ||
        icerik.includes('please complete');

      if (captchaVar || msg.components.length > 0) {
        console.log(`🛑 [${farm.selfbot.user.username}] CAPTCHA!`);

        farm.stopped = true;
        if (farm.timeout) clearTimeout(farm.timeout);

        // Webhook bildirimi
        if (WEBHOOK_URL) {
          try {
            await fetch(WEBHOOK_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                content:
                  `🚨 **CAPTCHA UYARISI**\n` +
                  `👤 Hesap: \`${farm.selfbot.user.username}\`\n` +
                  `📝 Mesaj: ${(msg.content || '(butonlu)').slice(0, 200)}\n` +
                  `🔗 Kanal: <#${msg.channel.id}>`,
              }),
            });
          } catch (e) {
            console.log('❌ Webhook hatası:', e.message);
          }
        }

        // Butona bas
        if (msg.components.length > 0) {
          try {
            await msg.clickButton();
            console.log(`✅ [${farm.selfbot.user.username}] Butona basıldı.`);
          } catch (e) {
            console.log(`❌ Buton hatası: ${e.message}`);
          }
        }

        // 90 sn sonra devam
        setTimeout(() => {
          farm.stopped = false;
          startFarm(token);
          console.log(`▶️ [${farm.selfbot.user.username}] Farm devam.`);
        }, 90000);
      }
    });
  }

  async function loop() {
    if (farm.stopped) return;

    try {
      const channel = await farm.selfbot.channels.fetch(farm.channelId);
      if (!channel) throw new Error('Kanal bulunamadı');

      const komut = FARM_KOMUTLARI[Math.floor(Math.random() * FARM_KOMUTLARI.length)];
      await channel.send(komut);
      console.log(`[${farm.selfbot.user.username}] 📤 ${komut}`);
    } catch (e) {
      console.log(`[${token.slice(0, 12)}...] ❌ ${e.message}`);
    }

    const bekleme = (Math.floor(Math.random() * (MAX_SANIYE - MIN_SANIYE + 1)) + MIN_SANIYE) * 1000;
    farm.timeout = setTimeout(loop, bekleme);
  }

  const ilk = (Math.floor(Math.random() * (MAX_SANIYE - MIN_SANIYE + 1)) + MIN_SANIYE) * 1000;
  farm.timeout = setTimeout(loop, ilk);
}

// ====== GRACEFUL SHUTDOWN ======
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

bot.login(BOT_TOKEN);
