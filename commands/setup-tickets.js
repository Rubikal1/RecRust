const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');
const ticketTypes = require('../utils/ticketConfig');
require('dotenv').config();
module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-tickets')
    .setDescription('Post the support panel with ticket buttons'),

  async execute(interaction) {
    // Only admins can run this
    const { PermissionsBitField } = require('discord.js');
if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({
        content: '❌ You must be an administrator to use this.',
        ephemeral: true,
      });
    }

const { TICKET_BANNER_URL, ICON_URL } = require('../utils/imageAssets');

    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("🛡️ Create a Ticket!")
      .setDescription(
        "**Categories**\n" +
        "• **General Support** — Any inquiry not listed.\n" +
        "• **Cheater Report** — Cheaters, Teaming, Bug explots...\n" +
        "• **Unban Appeal** — In game/discord ban appeal.\n" +
        "• **Kit Support** — Website, Payment, or Account issues.\n\n" +
        "**How does it work?**\n" +
        "Click one of the buttons below and fill out the form to create your ticket."
      )
      .setImage(TICKET_BANNER_URL)
      .setFooter({ text: "Inferno Support Panel", iconURL: ICON_URL });

    // Dynamically build button row from ticketTypes config
    const row = new ActionRowBuilder().addComponents(
      ...ticketTypes.map(type =>
        new ButtonBuilder()
          .setCustomId(`ticket_${type.id}`)
          .setLabel(type.label)
          .setStyle(ButtonStyle[type.style] || ButtonStyle.Secondary)
      )
    );

    // Post panel in the channel
    await interaction.channel.send({
      embeds: [embed],
      components: [row],
    });

    // Confirm to the admin
    return interaction.reply({
      content: '✅ Ticket panel posted.',
      ephemeral: true,
    });
  },
};
