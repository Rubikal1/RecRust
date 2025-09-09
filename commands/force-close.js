// commands/force-close.js
const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const USER_MAP_PATH = path.join(__dirname, '../utils/ticketUserMap.json');
const { ARCHIVE_CATEGORY_IDS } = require('../utils/constants');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('force-close')
    .setDescription('Force-close and archive a ticket by ticket ID (admin only)')
    .addStringOption(opt =>
      opt.setName('ticketid')
        .setDescription('Ticket ID to force close')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('reason')
        .setDescription('Reason for closing')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    const ticketId = interaction.options.getString('ticketid');
    const reason = interaction.options.getString('reason') || 'Force-closed by admin';

    let userMap = {};
    if (fs.existsSync(USER_MAP_PATH)) {
      try { userMap = JSON.parse(fs.readFileSync(USER_MAP_PATH, 'utf8')); } catch { userMap = {}; }
    }
    const ticketData = userMap[ticketId];
    if (!ticketData) return interaction.reply({ content: '❌ Ticket ID not found.', ephemeral: true });

    // Fetch the channel
    const channel = await interaction.client.channels.fetch(ticketData.channelId).catch(() => null);
    if (!channel) return interaction.reply({ content: '❌ Ticket channel not found.', ephemeral: true });

    // Move to archive, rename, disable buttons
    const archiveId = ARCHIVE_CATEGORY_IDS[0]; // Move to cheater archive by default or pick based on logic
    await channel.setParent(archiveId).catch(() => {});
    await channel.setName(`closed-${ticketId.toLowerCase()}`).catch(() => {});

    // Remove all message buttons and mark as closed (reuse your existing code)
    const { EmbedBuilder } = require('discord.js');
    const msgs = await channel.messages.fetch({ limit: 50 });
    for (const msg of msgs.values()) {
      if (msg.components && msg.components.length) await msg.edit({ components: [] }).catch(() => {});
      if (msg.embeds && msg.embeds.length && msg.embeds[0].description && msg.embeds[0].description.includes(ticketId)) {
        const embed = EmbedBuilder.from(msg.embeds[0]);
        if (!embed.data.fields) embed.data.fields = [];
        embed.data.fields = embed.data.fields.filter(f => !f.name.toLowerCase().includes('status'));
        embed.data.fields = [
          { name: 'Status', value: "🗄️ Closed (Force-Closed by Admin)", inline: false },
          ...embed.data.fields
        ];
        await msg.edit({ embeds: [embed], components: [] }).catch(() => {});
      }
    }

    // DM the user
    try {
      const user = await interaction.client.users.fetch(ticketData.userId);
      await user.send(`Your ticket (\`${ticketId}\`) was force-closed by an admin.\nReason: ${reason}`);
    } catch {}

    await interaction.reply({ content: `✅ Ticket force-closed and archived!`, ephemeral: true });
    await channel.send(`Ticket force-closed and archived by <@${interaction.user.id}>. Reason: ${reason}`);
  }
};
