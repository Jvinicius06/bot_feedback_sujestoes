const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  REST,
  Routes,
} = require("discord.js");
require("dotenv").config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// ── Configuracoes ──────────────────────────────────────────
const TYPES = {
  feedback: {
    label: "Feedback",
    emoji: "📝",
    color: ButtonStyle.Primary,
    embedColor: 0x5865f2,
  },
  sugestao: {
    label: "Sugestao",
    emoji: "💡",
    color: ButtonStyle.Success,
    embedColor: 0x57f287,
  },
  denuncia: {
    label: "Denuncia",
    emoji: "🚨",
    color: ButtonStyle.Danger,
    embedColor: 0xed4245,
  },
};

// ── Registrar slash command ────────────────────────────────
async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
  const commands = [
    new SlashCommandBuilder()
      .setName("painelfeedback")
      .setDescription(
        "Envia o painel de feedback, sugestoes e denuncias no canal atual"
      )
      .setDefaultMemberPermissions(0) // somente admins
      .toJSON(),
  ];

  try {
    // Registra em cada servidor para aparecer instantaneamente
    for (const guild of client.guilds.cache.values()) {
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guild.id),
        { body: commands }
      );
      console.log(`Comando /painelfeedback registrado em: ${guild.name}`);
    }
  } catch (err) {
    console.error("Erro ao registrar commands:", err);
  }
}

// ── Bot pronto ─────────────────────────────────────────────
client.once("ready", async () => {
  console.log(`Bot online como ${client.user.tag}`);
  console.log(`Conectado em ${client.guilds.cache.size} servidor(es)`);
  await registerCommands();
});

// ── Interacoes ─────────────────────────────────────────────
client.on("interactionCreate", async (interaction) => {
  // ── Slash command /painelfeedback ──
  if (interaction.isChatInputCommand() && interaction.commandName === "painelfeedback") {
    const embed = new EmbedBuilder()
      .setTitle("Central de Feedback")
      .setDescription(
        "Clique em um dos botoes abaixo para enviar seu **feedback**, **sugestao** ou **denuncia**.\n\n" +
        "Voce pode escolher se deseja ser **anonimo** ou **identificado** dentro do formulario."
      )
      .setColor(0x2b2d31)
      .setFooter({ text: "Suas mensagens sao enviadas para a equipe administrativa." });

    const row = new ActionRowBuilder().addComponents(
      ...Object.entries(TYPES).map(([key, cfg]) =>
        new ButtonBuilder()
          .setCustomId(`open_modal_${key}`)
          .setLabel(cfg.label)
          .setEmoji(cfg.emoji)
          .setStyle(cfg.color)
      )
    );

    const botMember = await interaction.guild.members.fetchMe();
    const perms = interaction.channel.permissionsFor(botMember);
    if (!perms.has("SendMessages") || !perms.has("EmbedLinks")) {
      await interaction.reply({
        content: "Eu nao tenho permissao de enviar mensagens ou embeds neste canal. Verifique minhas permissoes.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({
      content: "Painel enviado!",
      flags: MessageFlags.Ephemeral,
    });

    await interaction.channel.send({ embeds: [embed], components: [row] });
    return;
  }

  // ── Botao → Abrir modal ──
  if (interaction.isButton() && interaction.customId.startsWith("open_modal_")) {
    const type = interaction.customId.replace("open_modal_", "");
    const cfg = TYPES[type];
    if (!cfg) return;

    const modal = new ModalBuilder()
      .setCustomId(`submit_${type}`)
      .setTitle(`${cfg.emoji} ${cfg.label}`);

    const tituloInput = new TextInputBuilder()
      .setCustomId("titulo")
      .setLabel("Titulo")
      .setPlaceholder("Resuma em poucas palavras...")
      .setStyle(TextInputStyle.Short)
      .setMaxLength(100)
      .setRequired(true);

    const descricaoInput = new TextInputBuilder()
      .setCustomId("descricao")
      .setLabel("Descricao")
      .setPlaceholder("Descreva com detalhes...")
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(2000)
      .setRequired(true);

    const anonimoInput = new TextInputBuilder()
      .setCustomId("anonimo")
      .setLabel("Deseja ser anonimo? (sim / nao)")
      .setPlaceholder("sim")
      .setValue("sim")
      .setStyle(TextInputStyle.Short)
      .setMaxLength(3)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(tituloInput),
      new ActionRowBuilder().addComponents(descricaoInput),
      new ActionRowBuilder().addComponents(anonimoInput)
    );

    await interaction.showModal(modal);
    return;
  }

  // ── Modal enviado ──
  if (interaction.isModalSubmit() && interaction.customId.startsWith("submit_")) {
    const type = interaction.customId.replace("submit_", "");
    const cfg = TYPES[type];
    if (!cfg) return;

    const titulo = interaction.fields.getTextInputValue("titulo");
    const descricao = interaction.fields.getTextInputValue("descricao");
    const anonimoRaw = interaction.fields.getTextInputValue("anonimo").toLowerCase().trim();
    const isAnonimo = anonimoRaw === "sim" || anonimoRaw === "s";

    // Embed para o canal de admin
    const embed = new EmbedBuilder()
      .setTitle(`${cfg.emoji} ${cfg.label}: ${titulo}`)
      .setDescription(descricao)
      .setColor(cfg.embedColor)
      .addFields(
        {
          name: "Tipo",
          value: cfg.label,
          inline: true,
        },
        {
          name: "Anonimo",
          value: isAnonimo ? "Sim" : "Nao",
          inline: true,
        }
      )
      .setTimestamp();

    if (!isAnonimo) {
      embed.addFields({
        name: "Autor",
        value: `${interaction.member?.displayName ?? interaction.user.displayName} (${interaction.user.id})`,
        inline: true,
      });
      embed.setThumbnail(interaction.user.displayAvatarURL({ size: 64 }));
    } else {
      embed.setFooter({ text: "Enviado anonimamente" });
    }

    // ── Enviar para canal de admin ──
    try {
      const adminChannel = await client.channels.fetch(process.env.ADMIN_CHANNEL_ID);
      if (adminChannel) {
        await adminChannel.send({ embeds: [embed] });
      } else {
        console.error("Canal de admin nao encontrado.");
      }
    } catch (err) {
      console.error("Erro ao enviar para canal de admin:", err);
    }

    // ── Enviar para webhook (log externo - todos os dados sempre) ──
    try {
      if (process.env.WEBHOOK_URL) {
        const timestamp = Math.floor(Date.now() / 1000);
        const anonTag = isAnonimo ? "  ⚠️ `ANONIMO`" : "";

        const logEmbed = new EmbedBuilder()
          .setAuthor({
            name: `${interaction.member?.displayName ?? interaction.user.displayName}`,
            iconURL: interaction.user.displayAvatarURL({ size: 128 }),
          })
          .setTitle(`${cfg.emoji}  ${cfg.label.toUpperCase()}${anonTag}`)
          .setDescription(
            `### ${titulo}\n` +
            `\`\`\`\n${descricao}\n\`\`\``
          )
          .setColor(cfg.embedColor)
          .setThumbnail(interaction.user.displayAvatarURL({ size: 256 }))
          .addFields(
            {
              name: "👤  Usuario",
              value:
                `> **Nick:** ${interaction.member?.displayName ?? interaction.user.displayName}\n` +
                `> **ID:** \`${interaction.user.id}\`\n` +
                `> **Mencao:** <@${interaction.user.id}>`,
              inline: false,
            },
            {
              name: "🏠  Servidor",
              value:
                `> **Nome:** ${interaction.guild?.name ?? "DM"}\n` +
                `> **ID:** \`${interaction.guild?.id ?? "N/A"}\``,
              inline: true,
            },
            {
              name: "💬  Canal",
              value:
                `> **Nome:** #${interaction.channel?.name ?? "N/A"}\n` +
                `> **ID:** \`${interaction.channelId}\``,
              inline: true,
            },
            {
              name: "📋  Detalhes",
              value:
                `> **Tipo:** ${cfg.emoji} ${cfg.label}\n` +
                `> **Anonimo:** ${isAnonimo ? "✅ Sim" : "❌ Nao"}\n` +
                `> **Data:** <t:${timestamp}:F> (<t:${timestamp}:R>)`,
              inline: false,
            },
          )
          .setFooter({
            text: `ID: ${interaction.user.id} • ${interaction.guild?.name ?? "DM"}`,
            iconURL: interaction.guild?.iconURL({ size: 64 }) ?? undefined,
          })
          .setTimestamp();

        await fetch(process.env.WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: "📋 Central de Logs",
            embeds: [logEmbed.toJSON()],
          }),
        });
      }
    } catch (err) {
      console.error("Erro ao enviar webhook:", err);
    }

    // Confirmacao para o usuario
    await interaction.reply({
      content: `${cfg.emoji} Seu **${cfg.label.toLowerCase()}** foi enviado com sucesso! ${isAnonimo ? "(anonimamente)" : ""}`,
      flags: MessageFlags.Ephemeral,
    });
  }
});

// ── Login ──────────────────────────────────────────────────
client.login(process.env.BOT_TOKEN);
