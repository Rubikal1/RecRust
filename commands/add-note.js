const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const USER_MAP_PATH = path.join(__dirname, '../utils/ticketUserMap.json');
const { ARCHIVE_CATEGORY_IDS } = require('../utils/constants');
const ARCHIVE_CATEGORY_IDS_LIST = Object.values(ARCHIVE_CATEGORY_IDS);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('add-note')
    .setDescription('Add an internal staff note to this ticket (staff only, never DM\'d to user)')
    .addStringOption(option =>
      option.setName('note')
        .setDescription('Internal note for staff (not visible to user)')
        .setRequired(true)
        .setMaxLength(1000)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(interaction) {
    const channel = interaction.channel;

  if (ARCHIVE_CATEGORY_IDS_LIST.includes(channel.parentId)) {
      return interaction.reply({ content: '❌ This ticket is archived/closed. Notes cannot be added.', ephemeral: true });
    }

    // Get ticketId from channel name
    const ticketId = channel.name.replace(/^(claimed-|pending-|closed-)/, '').toUpperCase();

    // Load notes from ticketUserMap (optional; for backup)
    let userMap = {};
    if (fs.existsSync(USER_MAP_PATH)) {
      try { userMap = JSON.parse(fs.readFileSync(USER_MAP_PATH, 'utf8')); } catch { userMap = {}; }
    }
    if (!userMap[ticketId]) userMap[ticketId] = {};
    if (!userMap[ticketId].notes) userMap[ticketId].notes = [];

    // Add note
    const note = interaction.options.getString('note');
    const author = interaction.user;
    const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false });

    userMap[ticketId].notes.push({
      note,
      authorId: author.id,
      authorTag: `${author.username}#${author.discriminator}`,
      timestamp
    });

    fs.writeFileSync(USER_MAP_PATH, JSON.stringify(userMap, null, 2));

    // Find the main embed in this channel (should be first embed with Ticket ID)
    const msgs = await channel.messages.fetch({ limit: 50 });
    let ticketMsg = null;
    for (const msg of msgs.values()) {
      if (msg.embeds && msg.embeds.length && msg.embeds[0].description && msg.embeds[0].description.includes(ticketId)) {
        ticketMsg = msg;
        break;
      }
    }
    if (!ticketMsg) {
      return interaction.reply({ content: '❌ Could not find the ticket embed to update.', ephemeral: true });
    }

    // Build the Notes field text
    const notesFieldValue = userMap[ticketId].notes.map(n =>
      `**[${n.timestamp}]** <@${n.authorId}>: ${n.note}`
    ).join('\n\n');

    // Update or add Notes field in embed
    const embed = ticketMsg.embeds[0];
    let fields = embed.fields || [];
    // Remove any previous Notes field
    fields = fields.filter(f => f.name !== 'Notes');
    fields.push({ name: 'Notes', value: notesFieldValue.substring(0, 1024), inline: false }); // Discord embed limit

    // Edit the embed in the channel (staff only)
    await ticketMsg.edit({ embeds: [{ ...embed, fields }] });

    await interaction.reply({ content: '✅ Note added to ticket (visible to staff only).', ephemeral: true });
  }
};
