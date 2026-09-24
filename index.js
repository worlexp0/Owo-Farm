const {
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
  PermissionFlagsBits, ChannelType, EmbedBuilder
} = require('discord.js');
const { Client: SelfbotClient } = require('discord.js-selfbot-v13');
const http = require('http');

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
let FARM_KOMUTLARI = ['wh', 'wb']; // eski mod için (artık kullanılmıyor ama dursun)

// ====== GEM ÖNCELİKLERİ ======
const GEM_ONCELIK = {
  'elmas': 3, 'diamond': 3,
  'kalp': 2, 'heart': 2,
  '8gem': 1, '8 gem': 1, 'gem8': 1, 'gem': 1,
};

const farms = new Map();
const bekleyenTalepler = new Map();
// OwO cevap bekleyenler: Map<token, resolveFunc>
const cevapBekleyen = new Map();

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
    .addStringOption(o => o.setName('tokens').setDescription('Token(lar)').setRequired(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('plan_upgrade')
    .setDescription('Plan yükseltme talebi gönder')
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
    .setDescription('[Admin] Bekleyen plan talepleri')
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
    .addStringOption(o => o.setName('komutlar').setDescription('Örn: wh,wb').setRequired(true))
    .toJSON(),
];

function adminMi(interaction) {
  if (!interaction.guild) return false;
  return interaction.guild.ownerId === interaction.user.id;
}

// ====== BOT HAZIR ======
bot.once('ready', async () => {
  console.log('=================================');
  console.log(`✅ BOT HAZIR: ${bot.user.tag}`);
  console.log(`🏠 Yetkili Sunucu: ${SUNUCU_ID}`);
  console.log(`📊 Sunucu sayısı: ${bot.guilds.cache.size}`);
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
bot.on('shardError', (e) => console.error('❌ Shard hatası:', e.message));

bot.on('guildCreate', async (guild) => {
  if (guild.id !== SUNUCU_ID) {
    await guild.leave().catch(() => {});
  }
});

// ====== INTERACTION ======
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
      if (tokens.length === 0) return interaction.reply({ content: '❌ Geçerli token yok.', ephemeral: true });

      let kullaniciPlani = 'Free';
      for (const [, f] of farms.entries()) {
        if (f.userId === interaction.user.id) { kullaniciPlani = f.plan; break; }
      }
      if (interaction.guild && interaction.guild.ownerId === interaction.user.id) kullaniciPlani = 'Admin';

      const limit = PLAN_LIMITLERI[kullaniciPlani];
      let mevcutSayi = 0;
      for (const [, f] of farms.entries()) if (f.userId === interaction.user.id) mevcutSayi++;
      const kalan = limit - mevcutSayi;

      if (kalan <= 0) return interaction.reply({ content: `❌ Limit doldu! (${kullaniciPlani}, max ${limit})\n💡 \`/plan_upgrade\``, ephemeral: true });

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
            listenerEklendi: false,
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
      ozet += `⏱️ Aralık: ${MIN_SANIYE}–${MAX_SANIYE} sn\n`;
      ozet += `🎮 Döngü: \`w lb all\` → \`w inv\` → gem kullan`;
      if (hatalar.length > 0) ozet += `\n\n**Hatalar:**\n${hatalar.slice(0, 10).join('\n')}`;
      if (ozet.length > 1900) ozet = ozet.slice(0, 1900);
      await interaction.followUp({ content: ozet, ephemeral: true });
    }

    // ====== /plan_upgrade ======
    else if (interaction.commandName === 'plan_upgrade') {
      const plan = interaction.options.getString('plan');
      if (!PLANLAR.includes(plan)) {
        const embed = new EmbedBuilder().setTitle('📋 Planlar').setDescription('**Free** — 5\n**Premium** — 10\n**Admin** — 25');
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (plan === 'Free') {
        for (const [, f] of farms.entries()) if (f.userId === interaction.user.id) f.plan = 'Free';
        return interaction.reply({ content: '✅ Plan **Free**.', ephemeral: true });
      }

      if (interaction.guild && interaction.guild.ownerId === interaction.user.id) {
        // Sunucu sahibi direkt
        const kanalAdi = `plan-${plan.toLowerCase()}-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 90);
        const channel = await interaction.guild.channels.create({
          name: kanalAdi,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          ],
        });
        let guncellenen = 0;
        for (const [, f] of farms.entries()) if (f.userId === interaction.user.id) { f.plan = plan; guncellenen++; }
        return interaction.reply({ content: `✅ Plan **${plan}** aktif!\n📌 <#${channel.id}>\n🔄 Güncellenen: **${guncellenen}**`, ephemeral: true });
      }

      // Normal kullanıcı → talep
      bekleyenTalepler.set(interaction.user.id, { plan, username: interaction.user.username, requestedAt: Date.now() });
      try {
        const sahip = await bot.users.fetch(interaction.guild.ownerId);
        await sahip.send(`📩 **YENİ PLAN TALEBİ**\n👤 **${interaction.user.username}** (\`${interaction.user.id}\`)\n📊 Plan: **${plan}**\n\nOnay: \`/onayla kullanici:@${interaction.user.username} plan:${plan}\`\nReddet: \`/reddet kullanici:@${interaction.user.username}\``);
      } catch (e) { console.log('❌ DM hatası:', e.message); }

      return interaction.reply({ content: `⏳ Talebin sunucu sahibine iletildi. Plan: **${plan}**`, ephemeral: true });
    }

    // ====== /onayla ======
    else if (interaction.commandName === 'onayla') {
      if (!adminMi(interaction)) return interaction.reply({ content: '❌ Sadece sunucu sahibi.', ephemeral: true });
      const hedef = interaction.options.getUser('kullanici');
      const plan = interaction.options.getString('plan');
      if (!PLANLAR.includes(plan) || plan === 'Free') return interaction.reply({ content: '❌ Premium veya Admin.', ephemeral: true });
      const talep = bekleyenTalepler.get(hedef.id);
      if (!talep) return interaction.reply({ content: `❌ ${hedef.username} için talep yok.`, ephemeral: true });

      let guncellenen = 0;
      for (const [, f] of farms.entries()) if (f.userId === hedef.id) { f.plan = plan; guncellenen++; }
      bekleyenTalepler.delete(hedef.id);

      let kanalId = null;
      try {
        const kanalAdi = `plan-${plan.toLowerCase()}-${hedef.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 90);
        const channel = await interaction.guild.channels.create({
          name: kanalAdi,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: hedef.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
            { id: interaction.guild.ownerId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          ],
        });
        kanalId = channel.id;
      } catch (e) { console.log('❌ Kanal:', e.message); }

      try { await hedef.send(`✅ Planın **${plan}** onaylandı! Limit: ${PLAN_LIMITLERI[plan]}${kanalId ? `\n📌 <#${kanalId}>` : ''}`); } catch (e) {}

      return interaction.reply({ content: `✅ **${hedef.username}** → **${plan}**\n🔄 ${guncellenen} hesap güncellendi${kanalId ? `\n📌 <#${kanalId}>` : ''}`, ephemeral: true });
    }

    // ====== /reddet ======
    else if (interaction.commandName === 'reddet') {
      if (!adminMi(interaction)) return interaction.reply({ content: '❌ Sadece sunucu sahibi.', ephemeral: true });
      const hedef = interaction.options.getUser('kullanici');
      if (!bekleyenTalepler.has(hedef.id)) return interaction.reply({ content: `❌ Talep yok.`, ephemeral: true });
      bekleyenTalepler.delete(hedef.id);
      try { await hedef.send(`❌ Plan talebin reddedildi.`); } catch (e) {}
      return interaction.reply({ content: `🗑️ **${hedef.username}** reddedildi.`, ephemeral: true });
    }

    // ====== /bekleyenler ======
    else if (interaction.commandName === 'bekleyenler') {
      if (!adminMi(interaction)) return interaction.reply({ content: '❌ Sadece sunucu sahibi.', ephemeral: true });
      if (bekleyenTalepler.size === 0) return interaction.reply({ content: '📭 Bekleyen talep yok.', ephemeral: true });
      const liste = [];
      for (const [userId, t] of bekleyenTalepler.entries()) {
        const dk = Math.floor((Date.now() - t.requestedAt) / 60000);
        liste.push(`👤 <@${userId}> • Plan: **${t.plan}** • ${dk} dk`);
      }
      const embed = new EmbedBuilder().setTitle('📋 Bekleyen Talepler').setColor(0xFFA500).setDescription(liste.join('\n'));
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ====== /komut_ekle ======
    else if (interaction.commandName === 'komut_ekle') {
      const yeni = interaction.options.getString('komut').trim();
      if (FARM_KOMUTLARI.includes(yeni)) return interaction.reply({ content: '⚠️ Zaten var.', ephemeral: true });
      if (FARM_KOMUTLARI.length >= 20) return interaction.reply({ content: '❌ Max 20.', ephemeral: true });
      FARM_KOMUTLARI.push(yeni);
      return interaction.reply({ content: `✅ \`${yeni}\``, ephemeral: true });
    }

    // ====== /komut_sil ======
    else if (interaction.commandName === 'komut_sil') {
      const sil = interaction.options.getString('komut').trim();
      const idx = FARM_KOMUTLARI.indexOf(sil);
      if (idx === -1) return interaction.reply({ content: `❌ Bulunamadı.`, ephemeral: true });
      FARM_KOMUTLARI.splice(idx, 1);
      return interaction.reply({ content: `🗑️ \`${sil}\``, ephemeral: true });
    }

    // ====== /komut_liste ======
    else if (interaction.commandName === 'komut_liste') {
      const embed = new EmbedBuilder().setTitle('📋 Komut Listesi').setColor(0x00FF99).setDescription(FARM_KOMUTLARI.map((k, i) => `**${i + 1}.** \`${k}\``).join('\n'));
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ====== /komut_temizle ======
    else if (interaction.commandName === 'komut_temizle') {
      FARM_KOMUTLARI = ['wh', 'wb'];
      return interaction.reply({ content: `🧹 Sıfırlandı.`, ephemeral: true });
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
    console.error('❌ Interaction:', e);
    try {
      if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
      else await interaction.followUp({ content: `❌ ${e.message}`, ephemeral: true });
    } catch (_) {}
  }
});

// ====== OwO KOMUT GÖNDER (cevap bekleme opsiyonlu) ======
async function owOkomutGonder(token, komut, cevapBekle = false, timeoutMs = 8000) {
  const farm = farms.get(token);
  if (!farm) return null;

  let responsePromise = null;
  if (cevapBekle) {
    responsePromise = new Promise((resolve) => {
      cevapBekleyen.set(token, resolve);
      setTimeout(() => {
        if (cevapBekleyen.has(token)) {
          cevapBekleyen.delete(token);
          resolve(null);
        }
      }, timeoutMs);
    });
  }

  try {
    const channel = await farm.selfbot.channels.fetch(farm.channelId);
    if (!channel) throw new Error('Kanal yok');
    await channel.send(komut);
    console.log(`[${farm.selfbot.user.username}] 📤 ${komut}`);
  } catch (e) {
    console.log(`[${token.slice(0, 12)}...] ❌ ${e.message}`);
  }

  if (cevapBekle) return await responsePromise;
  return null;
}

// ====== INVENTORY'DEN GEM'LERİ ÇIKAR ======
function enIyiGemleriBul(msg) {
  if (!msg) return [];

  let tumMetin = msg.content || '';
  if (msg.embeds && msg.embeds[0]) {
    const e = msg.embeds[0];
    if (e.title) tumMetin += '\n' + e.title;
    if (e.description) tumMetin += '\n' + e.description;
    if (e.fields) for (const f of e.fields) tumMetin += '\n' + f.name + '\n' + f.value;
    if (e.footer?.text) tumMetin += '\n' + e.footer.text;
  }

  const satirlar = tumMetin.split('\n');
  const bulunanlar = [];

  for (const satir of satirlar) {
    const low = satir.toLowerCase();
    // En az bir gem kelimesi içermeli
    let oncelik = 0;
    for (const [kelime, puan] of Object.entries(GEM_ONCELIK)) {
      if (low.includes(kelime)) oncelik = Math.max(oncelik, puan);
    }
    if (oncelik === 0) continue;

    // ID çek: [12345], (12345) veya başındaki sayı
    const idMatch = satir.match(/\[?\(?(\d{4,})\)?\]?/);
    if (!idMatch) continue;

    bulunanlar.push({
      id: idMatch[1],
      oncelik,
      satir: satir.trim(),
    });
  }

  bulunanlar.sort((a, b) => b.oncelik - a.oncelik);
  return bulunanlar;
}

// ====== FARM DÖNGÜSÜ (yeni sıra) ======
function startFarm(token) {
  const farm = farms.get(token);
  if (!farm) return;

  // Listener: OwO mesajlarını yakala (cevap bekleyenlere ilet)
  if (!farm.listenerEklendi) {
    farm.listenerEklendi = true;

    farm.selfbot.on('messageCreate', async (msg) => {
      if (msg.author.id !== OWO_BOT_ID) return;

      // Cevap bekleyen bir istek varsa onu çöz
      const resolver = cevapBekleyen.get(token);
      if (resolver) {
        cevapBekleyen.delete(token);
        resolver(msg);
        // Captcha kontrolü de devam etsin diye return yapmıyoruz
      }

      // CAPTCHA / VERIFY kontrolü
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
          try {
            await fetch(WEBHOOK_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                content: `🚨 **CAPTCHA!**\n👤 \`${farm.selfbot.user.username}\`\n📝 ${(msg.content || '(butonlu)').slice(0, 200)}\n🔗 <#${msg.channel.id}>`,
              }),
            });
          } catc
