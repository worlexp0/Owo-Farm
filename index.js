const {
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
  PermissionFlagsBits, ChannelType, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType
} = require('discord.js');
const { Client: SelfbotClient } = require('discord.js-selfbot-v13');
const http = require('http');

// ====== ORTAM ======
const BOT_TOKEN = process.env.BOT_TOKEN;
const SUNUCU_ID = process.env.SUNUCU_ID;
const WEBHOOK_URL = process.env.WEBHOOK_URL || null;

console.log('🚀 Bot başlatılıyor...');
console.log('🔑 BOT_TOKEN:', BOT_TOKEN ? `${BOT_TOKEN.slice(0, 10)}...` : 'YOK');
console.log('🏠 SUNUCU_ID:', SUNUCU_ID || 'YOK');

if (!BOT_TOKEN) { console.error('❌ BOT_TOKEN eksik!'); process.exit(1); }
if (!SUNUCU_ID) { console.error('❌ SUNUCU_ID eksik!'); process.exit(1); }

// ====== AYARLAR ======
const PLANLAR = ['Free', 'Premium', 'Admin'];
const PLAN_LIMITLERI = { Free: 5, Premium: 10, Admin: 25 };
const MIN_SANIYE = 22;
const MAX_SANIYE = 28;
const OWO_BOT_ID = '408785106942164992';
let FARM_KOMUTLARI = ['wh', 'wb'];

const farms = new Map();

// ====== HEALTH CHECK ======
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ok',
    bot: bot?.user?.tag || 'başlatılıyor',
    farms: farms.size,
    uptime: Math.floor(process.uptime()) + 's',
  }));
}).listen(PORT, () => console.log(`🌐 Health check: port ${PORT}`));

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
    .setDescription('Plan yükseltme talebi aç (Premium veya Admin)')
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
    .addStringOption(o => o.setName('komutlar').setDescription('Örn: wh,wb,owo hunt').setRequired(true))
    .toJSON(),
];

// ====== BOT HAZIR ======
bot.once('ready', async () => {
  console.log('=================================');
  console.log(`✅ BOT HAZIR: ${bot.user.tag}`);
  console.log(`🏠 Yetkili Sunucu: ${SUNUCU_ID}`);
  console.log(`📊 Sunucu sayısı: ${bot.guilds.cache.size}`);
  console.log(`📋 Komutlar: ${FARM_KOMUTLARI.join(', ')}`);
  console.log('=================================');

  const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(bot.user.id), { body: commands });
    console.log('✅ Slash komutları kaydedildi.');
  } catch (e) {
    console.error('❌ Komut kayıt hatası:', e.message);
  }

  for (const [guildId, guild] of bot.guilds.cache) {
    if (guildId !== SUNUCU_ID) {
      console.log(`🚫 Yetkisiz sunucu: ${guild.name} — çıkıyorum.`);
      await guild.leave().catch(() => {});
    }
  }
});

bot.on('error', (e) => console.error('❌ Bot hatası:', e.message));
bot.on('warn', (w) => console.warn('⚠️ Uyarı:', w));

// ====== YETKİSİZ SUNUCUDAN ÇIK ======
bot.on('guildCreate', async (guild) => {
  if (guild.id !== SUNUCU_ID) {
    console.log(`🚫 Yetkisiz sunucu: ${guild.name} — çıkıyorum.`);
    await guild.leave().catch(() => {});
  }
});

// ====== SLASH KOMUT İŞLEYİCİ ======
bot.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.guild && interaction.guild.id !== SUNUCU_ID) {
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
      if (interaction.guild && interaction.guild.ownerId === interaction.user.id) {
        kullaniciPlani = 'Admin';
      }

      const limit = PLAN_LIMITLERI[kullaniciPlani];
      let mevcutSayi = 0;
      for (const [, f] of farms.entries()) {
        if (f.userId === interaction.user.id) mevcutSayi++;
      }
      const kalan = limit - mevcutSayi;

      if (kalan <= 0) {
        return interaction.reply({
          content: `❌ **Limit doldu!** Plan: **${kullaniciPlani}** (max ${limit}), Mevcut: **${mevcutSayi}**\n💡 \`/plan_upgrade\` ile yükseltme talep et.`,
          ephemeral: true,
        });
      }

      let eklenecekler = tokens;
      let limitUyarisi = '';
      if (tokens.length > kalan) {
        eklenecekler = tokens.slice(0, kalan);
        limitUyarisi = `\n⚠️ Sadece ilk ${kalan} token eklendi.`;
      }

      await interaction.reply({ content: `⏳ **${eklenecekler.length}** token işleniyor...${limitUyarisi}`, ephemeral: true });

      let basarili = 0, basarisiz = 0;
      const hatalar = [], basariliHesaplar = [];

      for (let i = 0; i < eklenecekler.length; i++) {
        const token = eklenecekler[i];
        if (farms.has(token)) { basarisiz++; hatalar.push(`#${i + 1}: zaten ekli`); continue; }

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
            plan: kullaniciPlani,
            timeout: null,
            stopped: false,
            captchaListenerEklendi: false,
          });
          startFarm(token);
          basarili++;
          basariliHesaplar.push(sb.user.username);
          console.log(`✅ Bağlandı: ${sb.user.username}`);
          await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
          basarisiz++;
          hatalar.push(`#${i + 1}: ${e.message.slice(0, 60)}`);
        }
      }

      const yeniToplam = mevcutSayi + basarili;
      let ozet = `✅ **Başarılı:** ${basarili}\n❌ **Başarısız:** ${basarisiz}\n`;
      ozet += `📊 Plan: **${kullaniciPlani}** (${yeniToplam}/${limit})\n`;
      ozet += `📌 Kanal: <#${interaction.channelId}>\n`;
      ozet += `⏱️ Aralık: ${MIN_SANIYE}–${MAX_SANIYE} sn\n`;
      ozet += `🎮 Komutlar: ${FARM_KOMUTLARI.map(k => `\`${k}\``).join(', ')}`;
      if (limitUyarisi) ozet += limitUyarisi;
      if (basariliHesaplar.length > 0) {
        ozet += `\n\n**Bağlananlar:**\n${basariliHesaplar.slice(0, 15).join(', ')}`;
        if (basariliHesaplar.length > 15) ozet += ` ...+${basariliHesaplar.length - 15}`;
      }
      if (hatalar.length > 0) {
        ozet += `\n\n**Hatalar:**\n${hatalar.slice(0, 10).join('\n')}`;
        if (hatalar.length > 10) ozet += `\n...+${hatalar.length - 10}`;
      }
      if (ozet.length > 1900) ozet = ozet.slice(0, 1900) + '\n...(kısaltıldı)';
      await interaction.followUp({ content: ozet, ephemeral: true });
    }

    // ====== /plan_upgrade (TALEP KANALI AÇAR) ======
    else if (interaction.commandName === 'plan_upgrade') {
      const plan = interaction.options.getString('plan');

      if (!PLANLAR.includes(plan)) {
        const embed = new EmbedBuilder()
          .setTitle('📋 Mevcut Planlar')
          .setColor(0x5865F2)
          .setDescription(
            '**Free** — 5 hesap, 22–28 sn\n' +
            '**Premium** — 10 hesap, özel kanal\n' +
            '**Admin** — 25 hesap, tüm özellikler'
          );
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      // Free'ye düşürme serbest
      if (plan === 'Free') {
        for (const [, f] of farms.entries()) {
          if (f.userId === interaction.user.id) f.plan = 'Free';
        }
        return interaction.reply({ content: '✅ Plan **Free** olarak ayarlandı.', ephemeral: true });
      }

      // Sunucu sahibi direkt yükseltir
      if (interaction.guild && interaction.guild.ownerId === interaction.user.id) {
        const kanalAdi = `plan-${plan.toLowerCase()}-${interaction.user.username}`
          .toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 90);

        const channel = await interaction.guild.channels.create({
          name: kanalAdi,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          ],
        });

        let guncellenen = 0;
        for (const [, f] of farms.entries()) {
          if (f.userId === interaction.user.id) { f.plan = plan; guncellenen++; }
        }

        return interaction.reply({
          content: `✅ Plan **${plan}** aktif! (Sunucu sahibi)\n📌 <#${channel.id}>\n🔄 Güncellenen: **${guncellenen}**\n📊 Yeni limit: **${PLAN_LIMITLERI[plan]}**`,
          ephemeral: true,
        });
      }

      // Normal kullanıcı → talep kanalı aç
      await interaction.deferReply({ ephemeral: true });

      const kanalAdi = `talep-${interaction.user.username}`.toLowerCase()
        .replace(/[^a-z0-9-]/g, '-').slice(0, 90);

      const talepKanal = await interaction.guild.channels.create({
        name: kanalAdi,
        type: ChannelType.GuildText,
        topic: `Plan talebi: ${plan} • Kullanıcı: ${interaction.user.id}`,
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
            id: interaction.guild.ownerId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageChannels,
            ],
          },
        ],
      });

      // Talep mesajı
      const embed = new EmbedBuilder()
        .setTitle('📩 Plan Yükseltme Talebi')
        .setColor(0xFFA500)
        .setDescription(
          `👤 **Kullanıcı:** <@${interaction.user.id}> (\`${interaction.user.username}\`)\n` +
          `📊 **İstenen plan:** **${plan}**\n` +
          `🔢 **Yeni limit:** ${PLAN_LIMITLERI[plan]} hesap\n` +
          `⏰ **Zaman:** <t:${Math.floor(Date.now() / 1000)}:R>\n\n` +
          `Sunucu sahibi aşağıdaki butonlarla onaylayabilir.`
        )
        .setFooter({ text: 'Sadece sunucu sahibi onaylayabilir.' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`onayla_${interaction.user.id}_${plan}`)
          .setLabel('Onayla')
          .setStyle(ButtonStyle.Success)
          .setEmoji('✅'),
        new ButtonBuilder()
          .setCustomId(`reddet_${interaction.user.id}_${plan}`)
          .setLabel('Reddet')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('❌'),
      );

      await talepKanal.send({ content: `<@${interaction.guild.ownerId}> yeni talep!`, embeds: [embed], components: [row] });

      await interaction.editReply({
        content: `✅ Talep kanalı açıldı: <#${talepKanal.id}>\nSunucu sahibi onaylayınca planın aktif olacak.`,
      });
    }

    // ====== /komut_ekle ======
    else if (interaction.commandName === 'komut_ekle') {
      const yeni = interaction.options.getString('komut').trim();
      if (!yeni) return interaction.reply({ content: '❌ Boş.', ephemeral: true });
      if (FARM_KOMUTLARI.includes(yeni)) return interaction.reply({ content: `⚠️ Zaten var.`, ephemeral: true });
      if (FARM_KOMUTLARI.length >= 20) return interaction.reply({ content: '❌ Max 20 komut.', ephemeral: true });
      FARM_KOMUTLARI.push(yeni);
      return interaction.reply({ content: `✅ Eklendi: \`${yeni}\`\n📋 ${FARM_KOMUTLARI.map(k => `\`${k}\``).join(', ')}`, ephemeral: true });
    }

    // ====== /komut_sil ======
    else if (interaction.commandName === 'komut_sil') {
      const sil = interaction.options.getString('komut').trim();
      const idx = FARM_KOMUTLARI.indexOf(sil);
      if (idx === -1) return interaction.reply({ content: `❌ Bulunamadı.`, ephemeral: true });
      if (FARM_KOMUTLARI.length <= 1) return interaction.reply({ content: '❌ En az 1 komut kalmalı.', ephemeral: true });
      FARM_KOMUTLARI.splice(idx, 1);
      return interaction.reply({ content: `🗑️ Silindi: \`${sil}\`\n📋 ${FARM_KOMUTLARI.map(k => `\`${k}\``).join(', ')}`, ephemeral: true });
    }

    // ====== /komut_liste ======
    else if (interaction.commandName === 'komut_liste') {
      const embed = new EmbedBuilder()
        .setTitle('📋 Farm Komut Listesi')
        .setColor(0x00FF99)
        .setDescription(FARM_KOMUTLARI.map((k, i) => `**${i + 1}.** \`${k}\``).join('\n') + `\n\n⏱️ Aralık: **${MIN_SANIYE}–${MAX_SANIYE}** sn`);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ====== /komut_temizle ======
    else if (interaction.commandName === 'komut_temizle') {
      FARM_KOMUTLARI = ['wh', 'wb'];
      return interaction.reply({ content: `🧹 Sıfırlandı: ${FARM_KOMUTLARI.map(k => `\`${k}\``).join(', ')}`, ephemeral: true });
    }

    // ====== /komut_ayarla ======
    else if (interaction.commandName === 'komut_ayarla') {
      const raw = interaction.options.getString('komutlar');
      const yeni = raw.split(',').map(k => k.trim()).filter(k => k.length > 0);
      if (yeni.length === 0 || yeni.length > 20) return interaction.reply({ content: '❌ 1-20 komut.', ephemeral: true });
      FARM_KOMUTLARI = yeni;
      return interaction.reply({ content: `✅ Güncellendi (${FARM_KOMUTLARI.length}): ${FARM_KOMUTLARI.map(k => `\`${k}\``).join(', ')}`, ephemeral: true });
    }
  } catch (e) {
    console.error('❌ Interaction hatası:', e);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: `❌ Hata: ${e.message}`, ephemeral: true });
      } else if (interaction.deferred) {
        await interaction.editReply({ content: `❌ Hata: ${e.message}` });
      } else {
        await interaction.followUp({ content: `❌ Hata: ${e.message}`, ephemeral: true });
      }
    } catch (_) {}
  }
});

// ====== BUTON İŞLEYİCİ (ONAYLA / REDDET) ======
bot.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const [aksiyon, hedefId, plan] = interaction.customId.split('_');
  if (aksiyon !== 'onayla' && aksiyon !== 'reddet') return;

  // Sadece sunucu sahibi
  if (!interaction.guild || interaction.guild.ownerId !== interaction.user.id) {
    return interaction.reply({ content: '❌ Sadece **sunucu sahibi** bu butona basabilir.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  if (aksiyon === 'onayla') {
    // Planı aktif et
    let guncellenen = 0;
    for (const [, f] of farms.entries()) {
      if (f.userId === hedefId) { f.plan = plan; guncellenen++; }
    }

    // Kullanıcıya özel plan kanalı aç
    let planKanalId = null;
    try {
      const hedefUser = await bot.users.fetch(hedefId);
      const kanalAdi = `plan-${plan.toLowerCase()}-${hedefUser.username}`
        .toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 90);

      const channel = await interaction.guild.channels.create({
        name: kanalAdi,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: hedefId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          { id: interaction.guild.ownerId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
        ],
      });
      planKanalId = channel.id;

      await channel.send(`🎉 <@${hedefId}> planın **${plan}** olarak onaylandı! Yeni limit: **${PLAN_LIMITLERI[plan]}** hesap.`);
    } catch (e) {
      console.log('❌ Plan kanalı açma hatası:', e.message);
    }

    // Buton mesajını güncelle
    try {
      const eskiEmbed = interaction.message.embeds[0];
      const yeniEmbed = EmbedBuilder.from(eskiEmbed)
        .setColor(0x00FF00)
        .setTitle('✅ Talep Onaylandı')
        .setFooter({ text: `Onaylayan: ${interaction.user.username}` });
      await interaction.message.edit({ embeds: [yeniEmbed], components: [] });
    } catch (e) {}

    // Talep kanalını sil
    setTimeout(async () => {
      try { await interaction.channel.delete(); } catch (e) {}
    }, 5000);

    await interaction.editReply({
      content:
        `✅ **${plan}** planı <@${hedefId}> için onaylandı.\n` +
        `🔄 Güncellenen hesap: **${guncellenen}**\n` +
        `📊 Yeni limit: **${PLAN_LIMITLERI[plan]}**\n` +
        (planKanalId ? `📌 Plan kanalı: <#${planKanalId}>` : '⚠️ Plan kanalı açılamadı'),
    });
  } else if (aksiyon === 'reddet') {
    try {
      const eskiEmbed = interaction.message.embeds[0];
      const yeniEmbed = EmbedBuilder.from(eskiEmbed)
        .setColor(0xFF0000)
        .setTitle('❌ Talep Reddedildi')
        .setFooter({ text: `Reddeden: ${interaction.user.username}` });
      await interaction.message.edit({ embeds: [yeniEmbed], components: [] });
    } catch (e) {}

    setTimeout(async () => {
      try { await interaction.channel.delete(); } catch (e) {}
    }, 5000);

    await interaction.editReply({ content: `🗑️ <@${hedefId}> kullanıcısının talebi reddedildi.` });
  }
});

// ====== FARM DÖNGÜSÜ + CAPTCHA ======
function startFarm(token) {
  const farm = farms.get(token);
  if (!farm) return;

  if (!farm.captchaListenerEklendi) {
    farm.captchaListenerEklendi = true;

    farm.selfbot.on('messageCreate', async (msg) => {
      if (msg.author.id !== OWO_BOT_ID) return;
      const icerik = msg.content.toLowerCase();
      const captchaVar =
        icerik.includes('captcha') || icerik.includes('verify') ||
        icerik.includes('human') || icerik.includes('are you a') ||
        icerik.includes('please complete');

      if (captchaVar || msg.components.length > 0) {
        console.log(`🛑 [${farm.selfbot.user.username}] CAPTCHA!`);
        farm.stopped = true;
        if (farm.timeout) clearTimeout(farm.timeout);

        if (WEBHOOK_URL) {
          
