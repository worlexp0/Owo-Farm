const {
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
  PermissionFlagsBits, ChannelType, EmbedBuilder
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
// Bekleyen plan talepleri: Map<userId, { plan, username, requestedAt }>
const bekleyenTalepler = new Map();

// ====== HEALTH CHECK ======
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ok',
    bot: bot?.user?.tag || 'başlatılıyor',
    farms: farms.size,
    bekleyen: bekleyenTalepler.size,
    uptime: Math.floor(process.uptime()) + 's',
  }));
}).listen(PORT, () => console.log(`🌐 Health check: port ${PORT}`));

// ====== DISCORD BOT ======
const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

// ====== SLASH KOMUTLARI ======
const commands = [
  new SlashCommandBuilder()
    .setName('add')
    .setDescription('OwO hesap(lar)ını bota bağla')
    .addStringOption(o => o.setName('tokens').setDescription('Token(lar) — boşluk/virgül ile ayır').setRequired(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('plan_upgrade')
    .setDescription('Plan yükseltme talebi gönder (Premium veya Admin)')
    .addStringOption(o => o.setName('plan').setDescription('Premium veya Admin').setRequired(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('onayla')
    .setDescription('[Admin] Plan talebini onayla')
    .addUserOption(o => o.setName('kullanici').setDescription('Kullanıcı').setRequired(true))
    .addStringOption(o => o.setName('plan').setDescription('Premium veya Admin').setRequired(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('reddet')
    .setDescription('[Admin] Plan talebini reddet')
    .addUserOption(o => o.setName('kullanici').setDescription('Kullanıcı').setRequired(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('bekleyenler')
    .setDescription('[Admin] Bekleyen plan taleplerini göster')
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

// ====== ADMIN Mİ? ======
function adminMi(interaction) {
  if (!interaction.guild) return false;
  return interaction.guild.ownerId === interaction.user.id;
}

// ====== BOT HAZIR ======
bot.once('ready', async () => {
  console.log('=================================');
  console.log(`✅ BOT HAZIR: ${bot.user.tag}`);
  console.log(`🆔 Bot ID: ${bot.user.id}`);
  console.log(`🏠 Yetkili Sunucu: ${SUNUCU_ID}`);
  console.log(`📊 Sunucu sayısı: ${bot.guilds.cache.size}`);
  console.log(`🔔 Webhook: ${WEBHOOK_URL ? 'AKTİF' : 'kapalı'}`);
  console.log(`📋 Komutlar: ${FARM_KOMUTLARI.join(', ')}`);
  console.log('=================================');

  const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(bot.user.id), { body: commands });
    console.log('✅ Slash komutları kaydedildi.');
  } catch (e) {
    console.error('❌ Komut kayıt hatası:', e.message);
  }

  // Yetkisiz sunuculardan çık
  for (const [guildId, guild] of bot.guilds.cache) {
    if (guildId !== SUNUCU_ID) {
      console.log(`🚫 Yetkisiz sunucu: ${guild.name} — çıkıyorum.`);
      await guild.leave().catch(() => {});
    }
  }
});

bot.on('error', (e) => console.error('❌ Bot hatası:', e.message));
bot.on('warn', (w) => console.warn('⚠️ Uyarı:', w));
bot.on('shardError', (e) => console.error('❌ Shard hatası:', e.message));

// ====== YETKİSİZ SUNUCUDAN ÇIK ======
bot.on('guildCreate', async (guild) => {
  if (guild.id !== SUNUCU_ID) {
    console.log(`🚫 Yetkisiz sunucu: ${guild.name} — çıkıyorum.`);
    await guild.leave().catch(() => {});
  } else {
    console.log(`✅ Sunucuya katıldım: ${guild.name}`);
  }
});

// ====== SLASH KOMUT İŞLEYİCİ ======
bot.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // Yetkisiz sunucu kontrolü
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

    // ====== /plan_upgrade (TALEP GÖNDER) ======
    else if (interaction.commandName === 'plan_upgrade') {
      const plan = interaction.options.getString('plan');

      // Geçersiz plan adı
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

      // Free'ye düşürmek serbest
      if (plan === 'Free') {
        for (const [, f] of farms.entries()) {
          if (f.userId === interaction.user.id) f.plan = 'Free';
        }
        return interaction.reply({ content: '✅ Plan **Free** olarak ayarlandı.', ephemeral: true });
      }

      // Sunucu sahibi → direkt yükseltir, talep gerekmez
      if (interaction.guild && interaction.guild.ownerId === interaction.user.id) {
        // Direkt uygula
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

      // Normal kullanıcı → talep oluştur
      bekleyenTalepler.set(interaction.user.id, {
        plan,
        username: interaction.user.username,
        requestedAt: Date.now(),
      });

      // Sunucu sahibine DM at
      let dmDurumu = '✅';
      try {
        const sahip = await bot.users.fetch(interaction.guild.ownerId);
        await sahip.send(
          `📩 **YENİ PLAN TALEBİ**\n\n` +
          `👤 **Kullanıcı:** ${interaction.user.username} (\`${interaction.user.id}\`)\n` +
          `📊 **İstediği plan:** ${plan}\n` +
          `🏠 **Sunucu:** ${interaction.guild.name}\n` +
          `⏰ **Zaman:** <t:${Math.floor(Date.now() / 1000)}:R>\n\n` +
          `**Onaylamak için:**\n` +
          `\`/onayla kullanici:@${interaction.user.username} plan:${plan}\`\n\n` +
          `**Reddetmek için:**\n` +
          `\`/reddet kullanici:@${interaction.user.username}\``
        );
      } catch (e) {
        dmDurumu = '⚠️ DM atılamadı';
        console.log('❌ DM hatası:', e.message);
      }

      return interaction.reply({
        content:
          `⏳ Talebin sunucu sahibine iletildi. Onay bekleniyor...\n` +
          `📊 İstenen plan: **${plan}**\n` +
          `🆔 Talep ID: \`${interaction.user.id}\`\n` +
          `ℹ️ ${dmDurumu}`,
        ephemeral: true,
      });
    }

    // ====== /onayla (SADECE SUNUCU SAHİBİ) ======
    else if (interaction.commandName === 'onayla') {
      if (!adminMi(interaction)) {
        return interaction.reply({ content: '❌ Bu komutu sadece **sunucu sahibi** kullanabilir.', ephemeral: true });
      }

      const hedef = interaction.options.getUser('kullanici');
      const plan = interaction.options.getString('plan');

      if (!PLANLAR.includes(plan) || plan === 'Free') {
        return interaction.reply({ content: '❌ Geçersiz plan. **Premium** veya **Admin** olmalı.', ephemeral: true });
      }

      const talep = bekleyenTalepler.get(hedef.id);
      if (!talep) {
        return interaction.reply({ content: `❌ ${hedef.username} için bekleyen talep yok.`, ephemeral: true });
      }

      // Plan uygula
      let guncellenen = 0;
      for (const [, f] of farms.entries()) {
        if (f.userId === hedef.id) { f.plan = plan; guncellenen++; }
      }
      bekleyenTalepler.delete(hedef.id);

      // Özel kanal aç
      let kanalId = null;
      try {
        const kanalAdi = `plan-${plan.toLowerCase()}-${hedef.username}`
          .toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 90);

        const overwrites = [
          { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: hedef.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          { id: interaction.guild.ownerId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
        ];

        const channel = await interaction.guild.channels.create({
          name: kanalAdi,
          type: ChannelType.GuildText,
          permissionOverwrites: overwrites,
        });
        kanalId = channel.id;
      } catch (e) {
        console.log('❌ Kanal açma hatası:', e.message);
      }

      // Kullanıcıya DM at
      try {
        await hedef.send(
          `✅ **Planın onaylandı!**\n\n` +
          `📊 Yeni plan: **${plan}**\n` +
          `🔢 Yeni limit: **${PLAN_LIMITLERI[plan]}** hesap\n` +
          (kanalId ? `📌 Özel kanal: <#${kanalId}>\n` : '') +
          `\nArtık \`/add\` ile daha fazla token ekleyebilirsin.`
        );
      } catch (e) {
        console.log('⚠️ Kullanıcıya DM atılamadı:', e.message);
      }

      return interaction.reply({
        content:
          `✅ **${hedef.username}** kullanıcısının planı **${plan}** olarak onaylandı.\n` +
          `🔄 Güncellenen hesap: **${guncellenen}**\n` +
          `📊 Yeni limit: **${PLAN_LIMITLERI[plan]}**\n` +
          (kanalId ? `📌 Kanal: <#${kanalId}>` : '⚠️ Kanal açılamadı'),
        ephemeral: true,
      });
    }

    // ====== /reddet (SADECE SUNUCU SAHİBİ) ======
    else if (interaction.commandName === 'reddet') {
      if (!adminMi(interaction)) {
        return interaction.reply({ content: '❌ Bu komutu sadece **sunucu sahibi** kullanabilir.', ephemeral: true });
      }

      const hedef = interaction.options.getUser('kullanici');
      const talep = bekleyenTalepler.get(hedef.id);
      if (!talep) {
        return interaction.reply({ content: `❌ ${hedef.username} için bekleyen talep yok.`, ephemeral: true });
      }

      bekleyenTalepler.delete(hedef.id);

      try {
        await hedef.send(`❌ Plan talebin (\`${talep.plan}\`) **reddedildi**.`);
      } catch (e) {}

      return interaction.reply({ content: `🗑️ **${hedef.username}** kullanıcısının talebi reddedildi.`, ephemeral: true });
    }

    // ====== /bekleyenler (SADECE SUNUCU SAHİBİ) ======
    else if (interaction.commandName === 'bekleyenler') {
      if (!adminMi(interaction)) {
        return interaction.reply({ content: '❌ Bu komutu sadece **sunucu sahibi** kullanabilir.', ephemeral: true });
      }

      if (bekleyenTalepler.size === 0) {
        return interaction.reply({ content: '📭 Bekleyen talep yok.', ephemeral: true });
      }

      const liste = [];
      for (const [userId, talep] of bekleyenTalepler.entries()) {
        const dakika = Math.floor((Date.now() - talep.requestedAt) / 60000);
        liste.push(`👤 <@${userId}> (\`${talep.username}\`)\n   📊 Plan: **${talep.plan}** • ⏰ ${dakika} dk önce`);
      }

      const embed = new EmbedBuilder()
        .setTitle('📋 Bekleyen Plan Talepleri')
        .setColor(0xFFA500)
        .setDescription(liste.join('\n\n'))
        .setFooter({ text: `Toplam: ${bekleyenTalepler.size} talep` });

      return interaction.reply({ embeds: [embed], ephemeral: true });
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
      if (idx === -1) return interaction.reply({ content: `❌ Bulunamadı: \`${sil}\``, ephemeral: true });
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
      if (yeni.length === 0) return interaction.reply({ content: '❌ Boş.', ephemer
