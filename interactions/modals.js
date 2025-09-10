const {
  ChannelType,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const ticketTypes = require('../utils/ticketConfig');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

// ---- CONFIG ttt ----
const STAFF_SERVER_ID = '1415094995161059504';
const STAFF_CATEGORY_IDS = {
  general: '1412705818062884899',
  cheater: '1412705818062884898',
  unban: '1412705818062884900',
  kit: '1412705818062884901',
};
const ARCHIVE_CATEGORY_IDS = {
  cheater: '1415094996721336449',
  general: '1415094996721336448',
  appeal: '1415094996721336450',
  kit: '1415094996893438086',
  frivolous: '1415094996893438087',
};

const STAFF_ROLE_ID = '1412705816670109775';
const { TICKET_BANNER_URL, ICON_URL } = require('../utils/imageAssets');
const TICKET_DATA_PATH = path.join(__dirname, '../utils/ticketIdStore.json');
const USER_MAP_PATH = path.join(__dirname, '../utils/ticketUserMap.json');

const TYPE_EMOJIS = {
  general: '💬',
  cheater: '🚨',
  unban: '🔓',
  kit: '🛠️',
};
const STATUS_META = {
  open:   { emoji: '🟢', text: 'Open' },
  claimed:{ emoji: '🟡', text: 'Claimed' },
  pending:{ emoji: '🔴', text: 'Pending Approval' },
  closed: { emoji: '🗄️', text: 'Closed' },
};

const TYPE_COLORS = {
  general: 0x3498db, // blue
  cheater: 0xed4245, // red
  unban: 0x747f8d,   // gray
  kit: 0x2ecc40,     // green
};

async function fullyCloseTicket(channel, ticketId) {
  const msgs = await channel.messages.fetch({ limit: 50 });
  let mainEmbedMsg = null;
  for (const msg of msgs.values()) {
    if (msg.components && msg.components.length) {
      await msg.edit({ components: [] }).catch(() => {});
    }
    if (!mainEmbedMsg && msg.embeds && msg.embeds.length && msg.embeds[0].description && msg.embeds[0].description.includes(ticketId)) {
      mainEmbedMsg = msg;
    }
  }
  if (mainEmbedMsg) {
    const embed = EmbedBuilder.from(mainEmbedMsg.embeds[0]);
    if (!embed.data.fields) embed.data.fields = [];
    embed.data.fields = embed.data.fields.filter(f => !f.name.toLowerCase().includes('status'));
    embed.data.fields = [
      { name: 'Status', value: "🗄️ Closed", inline: false },
      ...embed.data.fields
    ];
    await mainEmbedMsg.edit({ embeds: [embed], components: [] }).catch(() => {});
  }
}

function generateTicketId() {
  let id;
  let existing = {};
  if (!fs.existsSync(TICKET_DATA_PATH)) {
    fs.writeFileSync(TICKET_DATA_PATH, '{}');
  }
  try {
    const raw = fs.readFileSync(TICKET_DATA_PATH, 'utf8');
    existing = raw.trim() ? JSON.parse(raw) : {};
    if (typeof existing !== 'object' || Array.isArray(existing) || existing === null) throw new Error('Not an object');
  } catch {
    existing = {};
    fs.writeFileSync(TICKET_DATA_PATH, '{}');
  }
  let loopGuard = 0;
  do {
    id = String(Math.floor(Math.random() * 900000) + 100000);
    loopGuard++;
    if (loopGuard > 10000) throw new Error('Ticket ID generation infinite loop!');
  } while (existing[id]);
  existing[id] = Date.now();
  fs.writeFileSync(TICKET_DATA_PATH, JSON.stringify(existing, null, 2));
  return id;
}

function engravedField(label, value) {
  return {
    name: `__${label}__`,
    value: `\n\`\`\`\n${value || 'None'}\n\`\`\``,
    inline: false,
  };
}

async function sendUserCloseDM(ticketId, type, userId, archivedType, reason) {
  let ticketLabel = type.charAt(0).toUpperCase() + type.slice(1);
  let archiveLabel = archivedType.charAt(0).toUpperCase() + archivedType.slice(1);
  const client = require('../index').client || global.client;
  if (!client) return;
  try {
    const user = await client.users.fetch(userId);
    if (!user) return;
    const embed = new EmbedBuilder()
      .setTitle('Your Ticket Has Been Closed')
      .setDescription(`Your ${ticketLabel} ticket has been **closed** and archived to **${archiveLabel}**.\n\n**Ticket ID:** \`${ticketId}\`\n\n**Reason:**\n${reason}`)
      .setColor(0x747f8d)
      .setFooter({ text: 'Inferno Support', iconURL: ICON_URL })
      .setImage(TICKET_BANNER_URL)
      .setTimestamp();
    await user.send({ embeds: [embed] });
  } catch (e) {
    console.warn('[Modals] Could not DM user about closed ticket:', e);
  }
}


module.exports = async function handleModal(interaction) {
  if (!interaction.isModalSubmit()) return;
// --- Archive reason modal submit handler (fixed) ---
if (
  interaction.customId &&
  interaction.customId.startsWith('archive_reason_')
) {
  try {
    // 1) Parse type + ticket id from the modal customId
    const m = /^archive_reason_([a-z]+)_(\d+)$/.exec(interaction.customId);
    if (!m) return;
    const archiveType = m[1];
    const archiveTicketId = m[2];

    // 2) Validate target archive category
    const archiveCategoryId = ARCHIVE_CATEGORY_IDS[archiveType];
    if (!archiveCategoryId) {
      await interaction.reply({ content: `❌ Archive category ID missing.`, ephemeral: true });
      return;
    }

    // 3) Get reason text
    const reason = (interaction.fields.getTextInputValue('archive_reason') || '').trim() || 'No reason provided.';

    // 4) Load userMap FIRST so we have targetUserId before we use it
    let userMap = {};
    if (fs.existsSync(USER_MAP_PATH)) {
      try { userMap = JSON.parse(fs.readFileSync(USER_MAP_PATH, 'utf8')); } catch { userMap = {}; }
    }
    const entry = userMap[archiveTicketId] || {};
    const targetUserId = entry.userId || null;     // ✅ declared before use
    const ticketType   = entry.type   || 'general';

    // 5) Move channel + renamff
    await interaction.channel.setParent(archiveCategoryId).catch(() => {});
    await interaction.channel.setName(`archived-${archiveTicketId}`).catch(() => {});

    // 6) Mark closed (remove buttons + set Status field)
    await fullyCloseTicket(interaction.channel, archiveTicketId);

    // 7) Optional but recommended: lock perms after archive
    //    - user: no view/send
    //    - staff role: can view & read history, cannot send
    if (targetUserId) {
      await interaction.channel.permissionOverwrites.edit(targetUserId, {
        ViewChannel: false,
        SendMessages: false,
      }).catch(() => {});
    }
    await interaction.channel.permissionOverwrites.edit(STAFF_ROLE_ID, {
      ViewChannel: true,
      ReadMessageHistory: true,
      SendMessages: false,
    }).catch(() => {});

    // 8) DM user the closure reason
    if (targetUserId) {
      await sendUserCloseDM(archiveTicketId, ticketType, targetUserId, archiveType, reason);
    }
// 8.5) Persist "closed" so DM relay stops forwarding
userMap[archiveTicketId] = {
  ...(userMap[archiveTicketId] || {}),
  isClosed: true,
  archivedType: archiveType,
  closedAt: Date.now(),
};
fs.writeFileSync(USER_MAP_PATH, JSON.stringify(userMap, null, 2));

    // 9) Acks
    const pretty = archiveType.charAt(0).toUpperCase() + archiveType.slice(1);
    await interaction.reply({ content: `✅ Ticket archived to ${pretty}.`, ephemeral: true });
    await interaction.channel.send(`Ticket archived to **${pretty}** by <@${interaction.user.id}>.\n**Reason:** ${reason}`);
  } catch (err) {
    console.error('[Modals] Error archiving with reason:', err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ Something went wrong archiving.', ephemeral: true });
    }
  }
  return;
}


  if (!interaction.customId.startsWith('modal_')) return;

  const typeId = interaction.customId.replace('modal_', '');
  const config = ticketTypes.find(t => t.id === typeId);
  if (!config) {
    console.log(`[Modal] No config found for type: ${typeId}`);
    return;
  }
  console.log(`[Modal] Processing ticket of type '${typeId}' for user ${interaction.user.id}`);

  const fieldData = {};
  config.fields.forEach(field => {
    fieldData[field.customId] = interaction.fields.getTextInputValue(field.customId);
  });
  console.log(`[Modal] Field data received:`, fieldData);

  // --- Prevent duplicate open tickets per user ---
  let userMap = {};
  if (fs.existsSync(USER_MAP_PATH)) {
    try { userMap = JSON.parse(fs.readFileSync(USER_MAP_PATH, 'utf8')); } catch { userMap = {}; }
  }
  // Check for existing open ticket (not archived)
  const alreadyOpen = Object.entries(userMap).find(
    ([ticketId, data]) => data.userId === interaction.user.id
  );
  if (alreadyOpen) {
    // Check if ticket's channel still exists and is not archived
    try {
      const ticketChannel = await interaction.client.channels.fetch(alreadyOpen[1].channelId);
      const archivedCategories = Object.values(ARCHIVE_CATEGORY_IDS);
      if (ticketChannel && !archivedCategories.includes(ticketChannel.parentId)) {
        await interaction.reply({
          content: `❌ You already have an open ticket! Please close it before creating a new one. (Ticket ID: \`${alreadyOpen[0]}\`)`,
          ephemeral: true
        });
        return;
      }
    } catch {
      // Channel fetch failed, let them create a new ticket
    }
  }

  let replyDeferred = false;
  try {
    await interaction.deferReply({ ephemeral: true });
    replyDeferred = true;
    console.log(`[Modal] Deferred reply for user ${interaction.user.id}`);
  } catch (err) {
    console.warn(`[Modal] Failed to defer reply, will try to reply directly later.`);
  }

  let ticketId;
  try {
    ticketId = generateTicketId();
    console.log(`[Modal] Generated ticket ID: ${ticketId}`);
  } catch (err) {
    console.error(`[Modal] Error generating ticket ID:`, err);
    if (replyDeferred) {
      await interaction.editReply({ content: '❌ Failed to generate a ticket ID. Please try again.' });
    } else {
      await interaction.reply({ content: '❌ Failed to generate a ticket ID. Please try again.', ephemeral: true });
    }
    return;
  }

  // --- Create ticket channel in Staff server ---
  let staffServer, channel;
  try {
    staffServer = await interaction.client.guilds.fetch(STAFF_SERVER_ID);
    const staffCategoryId = STAFF_CATEGORY_IDS[typeId === 'appeal' ? 'unban' : typeId] || STAFF_CATEGORY_IDS['general'];
    channel = await staffServer.channels.create({
      name: ticketId,
      type: ChannelType.GuildText,
      parent: staffCategoryId,
      permissionOverwrites: [
        {
          id: staffServer.roles.everyone,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: STAFF_ROLE_ID,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ],
        },
      ],
    });
    console.log(`[Modal] Created ticket channel '${channel.name}' (${channel.id}) in Staff server, category ${staffCategoryId}`);
  } catch (err) {
    console.error(`[Modal] Error creating ticket channel in Staff server:`, err);
    if (replyDeferred) {
      await interaction.editReply({ content: '❌ Failed to create ticket channel. Please contact staff.' });
    } else {
      await interaction.reply({ content: '❌ Failed to create ticket channel. Please contact staff.', ephemeral: true });
    }
    return;
  }

  // --- Save user/channel/type for /send and /ticket-search ---
  try {
    userMap[ticketId] = {
      userId: interaction.user.id,
      channelId: channel.id,
      type: typeId,
      steamid: fieldData.steamid || null
    };
    fs.writeFileSync(USER_MAP_PATH, JSON.stringify(userMap, null, 2));
    console.log(`[Modal] Saved ticketUserMap entry for ticket ID ${ticketId}`);
  } catch (err) {
    console.error(`[Modal] Error saving ticketUserMap:`, err);
    if (replyDeferred) {
      await interaction.editReply({ content: '❌ Failed to create ticket channel. Please contact staff.' });
    } else {
      await interaction.reply({ content: '❌ Failed to create ticket channel. Please contact staff.', ephemeral: true });
    }
    return;
  }

  // --- Build styled staff embed ---
  const status = STATUS_META.open;
  const typeEmoji = TYPE_EMOJIS[typeId] || '';
  const user = await interaction.client.users.fetch(interaction.user.id);

const staffEmbed = new EmbedBuilder()
  .setTitle(`${typeEmoji} ${config.label} Ticket`)
  .setDescription(
    `**Ticket ID:** \`${ticketId}\`\n` +
    `**Type:** ${config.label}\n` +
    `**Submitted by:** <@${user.id}> (${user.tag})\n` +
    `**Assigned to:** Unclaimed` +
    (typeId === 'cheater'
      ? '\n\n*Make sure you F7 report the hackers in-game!*'
      : '')
  )
  .setColor(TYPE_COLORS[typeId] || 0x747f8d)
  .setFooter({ text: 'Inferno Tickets', iconURL: ICON_URL })
  .setTimestamp();


  staffEmbed.addFields({ name: "Status", value: `${status.emoji} ${status.text}`, inline: false });
  for (const field of config.fields) {
    staffEmbed.addFields(engravedField(field.label, fieldData[field.customId]));
  }

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`claim_${ticketId}`)
      .setLabel('Claim')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`close_${ticketId}`)
      .setLabel('Close')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`pending_${ticketId}`)
      .setLabel('Pending Approval')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`transfer_${ticketId}`)
      .setLabel('Transfer')
      .setStyle(ButtonStyle.Secondary)
  );

  try {
    await channel.send({ embeds: [staffEmbed], components: [actionRow] });
    console.log(`[Modal] Sent styled embed with buttons to channel ${channel.id}`);
  } catch (err) {
    console.error(`[Modal] Error sending embed/buttons to channel:`, err);
  }

  // --- Build styled user DM embed ---
  const userEmbed = new EmbedBuilder()
    .setTitle(`${typeEmoji} ${config.label} Ticket Submitted`)
    .setDescription(`Thank you for your submission! Our staff will review your ticket soon.\n\n**Ticket ID:** \`${ticketId}\``)
    .setColor(TYPE_COLORS[typeId] || 0x747f8d)
    .setImage(TICKET_BANNER_URL)
    .setFooter({ text: 'Inferno Support', iconURL: ICON_URL })
    .setTimestamp();

  for (const field of config.fields) {
    userEmbed.addFields(engravedField(field.label, fieldData[field.customId]));
  }

  try {
    await interaction.user.send({ embeds: [userEmbed] });
    console.log(`[Modal] DMed ticket embed to user ${interaction.user.id}`);
  } catch (err) {
    await channel.send({ content: `:warning: Could not DM <@${interaction.user.id}> their ticket details.` });
    console.warn(`[Modal] Could not DM user ${interaction.user.id}.`);
  }

  try {
    if (replyDeferred) {
      await interaction.editReply({
        content: `✅ Your ticket has been submitted! (ID: \`${ticketId}\`)`,
      });
      console.log(`[Modal] Edited confirmation reply to user ${interaction.user.id}`);
    } else {
      await interaction.reply({
        content: `✅ Your ticket has been submitted! (ID: \`${ticketId}\`)`,
        ephemeral: true,
      });
      console.log(`[Modal] Sent confirmation reply to user ${interaction.user.id}`);
    }
  } catch (err) {
    console.error(`[Modal] Error sending or editing confirmation reply to user:`, err);
  }
};
