import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server } from 'socket.io';
import { WebSocketServer, WebSocket as RawWs } from 'ws';
import { IncomingMessage } from 'http';
import { spawn, exec } from 'child_process';
import dotenv from 'dotenv';
import os from 'os';

dotenv.config();

const fastify = Fastify({ logger: true });

// ─── CORS ─────────────────────────────────────────────────────────────────────
fastify.register(cors, { origin: '*' });

// ─── Health check (Render/Railway keep-alive) ─────────────────────────────────
fastify.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

// ─── Socket.IO ────────────────────────────────────────────────────────────────
const io = new Server(fastify.server, {
  cors: { origin: '*' },
});

// In-memory device registry (will be replaced by Redis/Postgres later)
const connectedDevices: Map<string, { socketId: string; info: any; rawWs?: RawWs }> = new Map();

// Histórico de mensagens (recebidas e enviadas) do WhatsApp e outros mensageiros
interface WhatsAppMessage {
  app: string;
  sender: string;
  message: string;
  timestamp: number;
  isIncoming: boolean;
  recipient?: string;
}
const whatsappMessages: Array<WhatsAppMessage> = [];

// Histórico de contatos salvos na memória
interface Contact {
  id: string;
  name: string;
  app: string;
  lastMessage: string;
  timestamp: number;
}
const contactsList: Array<Contact> = [];

// Gerenciador de fila de respostas do chatbot para agrupar mensagens e simular digitação
interface PendingChatbotReply {
  evaluationTimeout: NodeJS.Timeout;
  typingTimeout?: NodeJS.Timeout;
  accumulatedMessages: string[];
}
const pendingChatbotReplies = new Map<string, PendingChatbotReply>();

function cancelPendingChatbotReply(chatbotKey: string, deviceId: string) {
  const pending = pendingChatbotReplies.get(chatbotKey);
  if (pending) {
    clearTimeout(pending.evaluationTimeout);
    if (pending.typingTimeout) {
      clearTimeout(pending.typingTimeout);
    }
    pendingChatbotReplies.delete(chatbotKey);
    const [sender, app] = chatbotKey.split('|');
    io.to('panel').emit('whatsapp_typing', { deviceId, app, sender, isTyping: false });
  }
}

// Estruturas e controle do Disparador em Massa (Bulk Sender)
interface BulkMessage {
  recipient: string;
  message: string;
}
interface BulkSenderState {
  active: boolean;
  queue: BulkMessage[];
  currentIndex: number;
  logs: string[];
  delayMin: number;
  delayMax: number;
  app: string;
  deviceId?: string;
  waitingForResult: boolean;
}
let bulkState: BulkSenderState = {
  active: false,
  queue: [],
  currentIndex: 0,
  logs: [],
  delayMin: 5,
  delayMax: 15,
  app: 'WhatsApp',
  waitingForResult: false
};
let bulkTimeout: NodeJS.Timeout | null = null;
let bulkResultTimeout: NodeJS.Timeout | null = null;

// Histórico de notificações gerais do sistema
interface SystemNotification {
  packageName: string;
  title: string;
  text: string;
  timestamp: number;
}
const systemNotifications: Array<SystemNotification> = [];

// Configurações de comportamento e skills do agente (Chatbot)
interface AgentSettings {
  fallbackResponse: string;
  signature: string;
  delayMs: number;
  enableFallback: boolean;
  delayType: 'fixed' | 'dynamic';
  ignoredContacts: string;
  foregroundAutoReply: boolean;
}
let agentSettings: AgentSettings = {
  fallbackResponse: "Olá! Recebemos sua mensagem, mas no momento estou indisponível. Em breve retorno!",
  signature: "\n— Atendimento Automático",
  delayMs: 1000,
  enableFallback: false,
  delayType: 'dynamic',
  ignoredContacts: "5573991422872, 73991422872",
  foregroundAutoReply: false
};

function sendSettingsToDevice(deviceId: string) {
  const device = connectedDevices.get(deviceId);
  if (device) {
    const cmd = {
      command: 'SET_FOREGROUND_AUTOREPLY',
      payload: { enabled: !!agentSettings.foregroundAutoReply }
    };
    if (device.rawWs && device.rawWs.readyState === RawWs.OPEN) {
      device.rawWs.send(JSON.stringify(cmd));
    } else if (device.socketId) {
      io.to(device.socketId).emit('execute_command', cmd);
    }
  }
}

function shouldIgnore(sender: string, ignoredList: string): boolean {
  if (!ignoredList) return false;
  const cleanSender = sender.replace(/[^0-9a-zA-Z]/g, "").toLowerCase();
  const items = ignoredList.split(",").map(i => i.trim().toLowerCase());
  
  for (const item of items) {
    if (!item) continue;
    const cleanItem = item.replace(/[^0-9a-zA-Z]/g, "");
    if (cleanSender.includes(cleanItem) || sender.toLowerCase().includes(item)) {
      return true;
    }
  }
  return false;
}

function calculateTypingDelay(message: string): number {
  if (agentSettings.delayType === 'fixed') {
    return agentSettings.delayMs || 1000;
  }
  // Dinâmico: Simula digitação humana
  // Tempo de leitura/reação: entre 1.5 e 2.5 segundos
  const baseReactionMs = 1500 + Math.random() * 1000;
  // Velocidade de digitação: ~40ms a 75ms por caractere
  const typingMsPerChar = 40 + Math.random() * 35;
  const computedDelay = baseReactionMs + (message.length * typingMsPerChar);
  
  // Limita o delay entre 2 e 10 segundos para não demorar demais
  return Math.min(Math.max(computedDelay, 2000), 10000);
}


// Regras predefinidas de chatbot (Auto-Reply)
interface AutoReplyRule {
  id: string;
  keyword: string;
  response: string;
}
const autoReplyRules: AutoReplyRule[] = [
  { id: '1', keyword: 'preço', response: 'Olá! Nosso plano básico custa R$ 49,90/mês e o completo R$ 89,90/mês.' },
  { id: '2', keyword: 'ola', response: 'Olá! Tudo bem? Como posso te ajudar hoje?' },
  { id: '3', keyword: 'suporte', response: 'Para falar com o suporte, acesse: https://suporte.exemplo.com' }
];

// ─── Atendimento Humanizado ──────────────────────────────────────────────────
interface HumanizedCategory {
  id: string;
  name: string;
  keywords: string[];
  responses: string[];
}

let humanizedEnabled = false;
let humanizedDelayMin = 3000;
let humanizedDelayMax = 7000;

const defaultHumanizedCategories: HumanizedCategory[] = [
  {
    id: 'cat-greeting',
    name: 'Saudação / Boas-vindas',
    keywords: ['ola', 'oie', 'bom dia', 'boa tarde', 'boa noite', 'tudo bem', 'olá', 'oi', 'eai', 'e aí', 'hey', 'fala'],
    responses: [
      'Olá! Tudo bem por aqui? Como posso te ajudar hoje?',
      'Oi! Tudo certo? Em que posso ser útil?',
      'Olá! Prazer em falar com você. Me conta, qual a sua dúvida?',
      'Oie! Como você está? Pode ficar à vontade para perguntar.',
    ],
  },
  {
    id: 'cat-pricing',
    name: 'Preços / Orçamento',
    keywords: ['preço', 'preco', 'quanto custa', 'valor', 'orçamento', 'orcamento', 'investimento', 'quanto é', 'precisa', 'tabela', 'mensalidade', 'plano', 'assinatura'],
    responses: [
      'Vamos lá! Nossos valores começam em R$ 49,90 para o plano básico. O plano completo sai por R$ 89,90 por mês. Qual deles você acha que se encaixa melhor no que precisa?',
      'Claro! O plano básico é R$ 49,90/mês e o completo R$ 89,90/mês. Os dois têm funcionalidades bem interessantes — quer que eu detalhe as diferenças?',
      'Fico feliz que você perguntou! Trabalhamos com duas opções: a partir de R$ 49,90/mês. Se quiser, posso te explicar direitinho o que cada uma inclui.',
    ],
  },
  {
    id: 'cat-hours',
    name: 'Horários / Localização',
    keywords: ['horário', 'horario', 'funciona', 'aberto', 'abre', 'fecha', 'endereço', 'endereco', 'local', 'onde fica', 'atendimento', 'funcionamento'],
    responses: [
      'Nosso atendimento funciona de segunda a sexta, das 8h às 18h, e aos sábados das 8h ao meio-dia. Fora desse horário, a gente respende assim que possível!',
      'Funcionamos em horário comercial: segunda a sexta 8h–18h, sábado 8h–12h. Fora isso, pode deixar sua mensagem que respondemos em seguida.',
      'Estamos prontos para atender de segunda a sexta, 8h às 18h, e sábado até 12h. Fora desse horário, a equipe responde assim que possível.',
    ],
  },
  {
    id: 'cat-support',
    name: 'Suporte Técnico',
    keywords: ['suporte', 'ajuda', 'socorro', 'problema', 'não funciona', 'nao funciona', 'erro', 'defeito', 'quebrou', 'bug', 'falha', 'travou', 'lento'],
    responses: [
      'Entendo, isso deve ser frustrante! Me explica melhor o que está acontecendo que vou tentar te ajudar ou passar pra equipe certa.',
      'Vamos ver isso juntos! Pode me contar mais detalhes do problema? Quanto mais informações, melhor consigo direcionar.',
      'Poxa, sinto muito por isso! Me conta exatamente o que apareceu ou o que aconteceu, que já vou ver a melhor forma de resolver.',
    ],
  },
  {
    id: 'cat-product',
    name: 'Informações do Produto',
    keywords: ['produto', 'serviço', 'servico', 'como funciona', 'detalhes', 'quero saber', 'me explica', 'o que é', 'oque é', 'diferença', 'diferenca', 'características', 'caracteristicas', 'benefícios'],
    responses: [
      'Claro! Nossas soluções foram pensadas para facilitar o dia a dia. Você tem interesse em algum serviço específico? Posso detalhar para você.',
      'Boa pergunta! Basicamente, oferecemos [descrição resumida]. Mas me conta mais sobre o que você está buscando, aí posso te dar uma explicação bem direcionada.',
      'Fico feliz em explicar! Nossos serviços incluem [descrição]. Tem algo mais específico que você gostaria de saber?',
    ],
  },
  {
    id: 'cat-complaint',
    name: 'Reclamação',
    keywords: ['reclamação', 'reclamacao', 'reclamar', 'insatisfeito', 'péssimo', 'pessimo', 'horrível', 'horrivel', 'decepcionado', 'chateado', 'raiva', 'absurdo'],
    responses: [
      'Sinto muito por essa experiência! Isso não é o que queremos para nossos clientes. Pode me passar mais detalhes? Vou garantir que chegue ao setor responsável.',
      'Poxa, lamento muito que isso tenha acontecido. Quero entender melhor para resolver da melhor forma possível. Me conta o que houve?',
      'Oi, sinto muito! Essa situação não é legal mesmo. Me explica direitinho o que rolou que vou dar o encaminhamento certo.',
    ],
  },
  {
    id: 'cat-schedule',
    name: 'Agendamento',
    keywords: ['agendar', 'marcar', 'agendamento', 'visita', 'consulta', 'horário', 'horario', 'quando', 'pode ser', 'agenda', 'marcar uma', 'agendar uma'],
    responses: [
      'Perfeito! Vamos agendar. Qual dia e horário seriam melhores para você? Normalmente temos disponibilidade pela manhã e à tarde.',
      'Claro! Me diz qual dia e horário você prefere, e também se tem alguma preferência de período (manhã ou tarde), que confirmamos rapidinho.',
      'Bora marcar! Me passa a melhor data pra você e um horário ideal que eu encaixo na agenda.',
    ],
  },
  {
    id: 'cat-goodbye',
    name: 'Despedida',
    keywords: ['tchau', 'obrigado', 'brigado', 'valeu', 'até', 'ate', 'flw', 'falou', 'abrigado', 'agradecido', 'agradeço', 'obrigada'],
    responses: [
      'Imagina! Foi um prazer ajudar. Se precisar de mais algo, é só chamar. Até mais!',
      'Disponha! Qualquer dúvida que surgir, pode me procurar. Tenha um ótimo dia!',
      'Por nada! Estou aqui para isso. Se surgir qualquer outra coisa, é só falar. Até logo!',
    ],
  },
  {
    id: 'cat-fallback',
    name: 'Fallback (não identificado)',
    keywords: [],
    responses: [
      'Entendi! Me conta um pouco mais para eu entender direitinho e poder te ajudar melhor?',
      'Obrigado pela mensagem! Pode me dar mais alguns detalhes para eu direcionar da melhor forma?',
      'Perfeito! Você pode me explicar melhor o que precisa? Assim consigo te ajudar direitinho.',
    ],
  },
];

// Clona os defaults ao iniciar
let humanizedCategories: HumanizedCategory[] = JSON.parse(JSON.stringify(defaultHumanizedCategories));

function getHumanizedResponse(message: string): string | null {
  const normalized = message.toLowerCase().trim();
  
  // Verifica cada categoria por palavras-chave
  for (const cat of humanizedCategories) {
    if (cat.id === 'cat-fallback') continue; // fallback é verificado por último
    for (const kw of cat.keywords) {
      if (normalized.includes(kw)) {
        // Pega uma resposta aleatória da categoria
        const idx = Math.floor(Math.random() * cat.responses.length);
        return cat.responses[idx];
      }
    }
  }
  
  // Fallback
  const fallbackCat = humanizedCategories.find(c => c.id === 'cat-fallback');
  if (fallbackCat && fallbackCat.responses.length > 0) {
    const idx = Math.floor(Math.random() * fallbackCat.responses.length);
    return fallbackCat.responses[idx];
  }
  
  return null;
}

function calculateHumanizedDelay(response: string): number {
  // 2-4s de reação + 40-70ms por caractere
  const reactionMs = 2000 + Math.random() * 2000;
  const typingMs = response.length * (40 + Math.random() * 35);
  const total = reactionMs + typingMs;
  
  // Limita entre os delays configurados
  return Math.min(Math.max(total, humanizedDelayMin), humanizedDelayMax);
}

function processNextBulkMessage(deviceId: string) {
  if (bulkTimeout) {
    clearTimeout(bulkTimeout);
    bulkTimeout = null;
  }
  if (bulkResultTimeout) {
    clearTimeout(bulkResultTimeout);
    bulkResultTimeout = null;
  }

  if (!bulkState.active) return;

  if (bulkState.currentIndex >= bulkState.queue.length) {
    bulkState.logs.push(`[${new Date().toLocaleTimeString()}] ✅ Disparo em massa finalizado com sucesso!`);
    bulkState.active = false;
    bulkState.waitingForResult = false;
    io.to('panel').emit('bulk_status_update', bulkState);
    return;
  }

  const item = bulkState.queue[bulkState.currentIndex];
  bulkState.logs.push(`[${new Date().toLocaleTimeString()}] 📤 Enviando (${bulkState.currentIndex + 1}/${bulkState.queue.length}) para ${item.recipient}...`);
  bulkState.waitingForResult = true;
  bulkState.deviceId = deviceId;
  io.to('panel').emit('bulk_status_update', bulkState);

  const device = connectedDevices.get(deviceId);
  if (!device) {
    bulkState.logs.push(`[${new Date().toLocaleTimeString()}] ✗ Falha: Dispositivo desconectado.`);
    bulkState.active = false;
    bulkState.waitingForResult = false;
    io.to('panel').emit('bulk_status_update', bulkState);
    return;
  }

  const cmd = {
    command: 'SEND_BACKGROUND_REPLY',
    payload: {
      sender: item.recipient,
      app: bulkState.app || 'WhatsApp',
      message: item.message
    }
  };

  // Envia a resposta manual do "Você" para aparecer no chat log
  const manualReply: WhatsAppMessage = {
    app: bulkState.app || 'WhatsApp',
    sender: 'Você',
    recipient: item.recipient,
    message: item.message,
    timestamp: Date.now(),
    isIncoming: false
  };
  whatsappMessages.push(manualReply);
  if (whatsappMessages.length > 500) whatsappMessages.shift();
  io.to('panel').emit('whatsapp_sent', {
    deviceId,
    ...manualReply
  });

  if (device.rawWs && device.rawWs.readyState === RawWs.OPEN) {
    device.rawWs.send(JSON.stringify(cmd));
  } else if (device.socketId) {
    io.to(device.socketId).emit('execute_command', cmd);
  } else {
    bulkState.logs.push(`[${new Date().toLocaleTimeString()}] ✗ Falha: Sem canal de comunicação ativo.`);
    bulkState.active = false;
    bulkState.waitingForResult = false;
    io.to('panel').emit('bulk_status_update', bulkState);
    return;
  }

  // Safety timeout of 30 seconds
  bulkResultTimeout = setTimeout(() => {
    if (bulkState.active && bulkState.waitingForResult) {
      bulkState.logs.push(`[${new Date().toLocaleTimeString()}] ⚠️ Sem resposta do celular (Timeout 30s). Pulando para o próximo...`);
      bulkState.waitingForResult = false;
      bulkState.currentIndex++;
      scheduleNextBulkMessage(deviceId);
    }
  }, 30000);
}

function scheduleNextBulkMessage(deviceId: string) {
  if (!bulkState.active) return;

  const min = bulkState.delayMin || 5;
  const max = bulkState.delayMax || 15;
  const delaySec = Math.floor(Math.random() * (max - min + 1)) + min;
  
  bulkState.logs.push(`[${new Date().toLocaleTimeString()}] ⏱️ Aguardando ${delaySec} segundos antes do próximo envio...`);
  io.to('panel').emit('bulk_status_update', bulkState);

  bulkTimeout = setTimeout(() => {
    processNextBulkMessage(deviceId);
  }, delaySec * 1000);
}

function handleBulkCommandResult(deviceId: string, command: string, result: string) {
  if (!bulkState.active || !bulkState.waitingForResult || bulkState.deviceId !== deviceId) {
    return;
  }

  if (command === 'SEND_BACKGROUND_REPLY') {
    if (bulkResultTimeout) {
      clearTimeout(bulkResultTimeout);
      bulkResultTimeout = null;
    }

    bulkState.waitingForResult = false;
    
    if (result.startsWith('success')) {
      const isFallback = result.includes('fallback');
      const statusText = isFallback ? 'Enviado via Fallback Acessibilidade' : 'Enviado via Notificação';
      bulkState.logs.push(`[${new Date().toLocaleTimeString()}] ✓ Sucesso: ${statusText}.`);
    } else {
      bulkState.logs.push(`[${new Date().toLocaleTimeString()}] ✗ Falha: ${result}.`);
    }

    bulkState.currentIndex++;
    scheduleNextBulkMessage(deviceId);
  }
}

// ─── Raw WebSocket Bridge (for Android OkHttp client) ────────────────────────
// Em ambiente de nuvem (como Render), compartilhamos a mesma porta do Fastify.
// Anexamos o WebSocketServer ao servidor HTTP do Fastify.
const wss = new WebSocketServer({ noServer: true });

fastify.ready().then(() => {
  fastify.server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    // Se for rota do socket.io, deixa o socket.io tratar
    if (url.pathname.startsWith('/socket.io/')) {
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });
});

wss.on('connection', (rawWs: RawWs, req: IncomingMessage) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const deviceId = url.searchParams.get('deviceId') || `android-${Date.now()}`;
  fastify.log.info(`[RAW WS] Android device connected: ${deviceId}`);

  connectedDevices.set(deviceId, { socketId: '', info: { status: 'online' }, rawWs });

  // Notify panel via Socket.IO
  io.to('panel').emit('device_connected', { deviceId });

  // Sync settings with newly connected device
  sendSettingsToDevice(deviceId);

  rawWs.on('message', (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString());
      const event = msg.event;

      if (event === 'device_info') {
        const existing = connectedDevices.get(deviceId);
        if (existing) {
          existing.info = { ...existing.info, ...msg };
          connectedDevices.set(deviceId, existing);
          io.to('panel').emit('device_info_updated', { deviceId, ...msg });
        }
      } else if (event === 'command_result') {
        fastify.log.info(`[CMD RESULT] from ${deviceId}:`, msg);
        io.to('panel').emit('command_result', { deviceId, command: msg.command, result: msg.result });
        
        // Trata resultado para o Disparador em Massa
        handleBulkCommandResult(deviceId, msg.command, msg.result);

        if (msg.command === 'START_SCREEN_STREAM' && msg.result !== 'success') {
          fastify.log.warn(`[STREAM] Native stream failed on ${deviceId} (${msg.result}). Falling back to ADB.`);
          if (!capturing) {
            capturing = true;
            chainCapture();
          }
        }
      } else if (event === 'screen_frame') {
        io.to('panel').emit('screen_frame', { deviceId, frame: msg.frame });
      } else if (event === 'notification_received') {
        const { packageName, title, text, timestamp } = msg;
        const notif: SystemNotification = { packageName, title, text, timestamp };
        systemNotifications.push(notif);
        if (systemNotifications.length > 100) systemNotifications.shift();
        io.to('panel').emit('notification_received', { deviceId, ...notif });
      } else if (event === 'message_received') {
        const { app, sender, message, timestamp } = msg;
        fastify.log.info(`[MESSAGE RCVD] [${app}] from ${sender}: ${message}`);
        
        // Salva na memória
        const chatMsg: WhatsAppMessage = { app, sender, message, timestamp, isIncoming: true };
        whatsappMessages.push(chatMsg);
        if (whatsappMessages.length > 500) whatsappMessages.shift();

        // Salva/Atualiza o contato na memória
        const contactId = `${sender}-${app}`;
        const existingContactIndex = contactsList.findIndex(c => c.id === contactId);
        if (existingContactIndex !== -1) {
          contactsList[existingContactIndex].lastMessage = message;
          contactsList[existingContactIndex].timestamp = timestamp;
        } else {
          contactsList.push({
            id: contactId,
            name: sender,
            app,
            lastMessage: message,
            timestamp
          });
        }
        contactsList.sort((a, b) => b.timestamp - a.timestamp);

        // Emite para o painel web em tempo real (compatível com os eventos de whatsapp)
        io.to('panel').emit('whatsapp_received', { deviceId, ...chatMsg });
        io.to('panel').emit('contacts_list', { contacts: contactsList });

        // --- LÓGICA DE COALESCÊNCIA DO CHATBOT ---
        const chatbotKey = `${sender}|${app}`;

        if (shouldIgnore(sender, agentSettings.ignoredContacts)) {
          fastify.log.info(`[CHATBOT] Contato "${sender}" ignorado (Blacklist)`);
          return;
        }
        
        // Cancela qualquer timer pendente (de avaliação ou de digitação)
        const existingPending = pendingChatbotReplies.get(chatbotKey);
        let accumulated = [message];
        if (existingPending) {
          clearTimeout(existingPending.evaluationTimeout);
          if (existingPending.typingTimeout) {
            clearTimeout(existingPending.typingTimeout);
          }
          accumulated = [...existingPending.accumulatedMessages, message];
          // Reseta o status de digitando no painel
          io.to('panel').emit('whatsapp_typing', { deviceId, app, sender, isTyping: false });
        }

        // Aguarda 6 segundos de silêncio do usuário antes de processar a resposta
        const silenceTimeoutMs = 6000;
        
        const evaluationTimeout = setTimeout(() => {
          const pending = pendingChatbotReplies.get(chatbotKey);
          if (!pending) return;

          const combinedMessage = pending.accumulatedMessages.join(" ");
          const normalizedMsg = combinedMessage.toLowerCase().trim();
          let matched = false;
          let targetResponse = "";

          // ─── MODO ATENDIMENTO HUMANIZADO ───
          if (humanizedEnabled) {
            const humanizedResponse = getHumanizedResponse(combinedMessage);
            if (humanizedResponse) {
              matched = true;
              targetResponse = humanizedResponse;
              fastify.log.info(`[HUMANIZADO] Resposta gerada para "${combinedMessage}": "${humanizedResponse}"`);
            }
          }

          // ─── MODO CHATBOT PADRÃO (só executa se humanizado não respondeu) ───
          if (!matched) {
            for (const rule of autoReplyRules) {
              const ruleKeyword = rule.keyword.toLowerCase().trim();
              if (normalizedMsg.includes(ruleKeyword)) {
                matched = true;
                targetResponse = rule.response;
                fastify.log.info(`[CHATBOT] Match na regra "${rule.keyword}" para "${combinedMessage}"`);
                break;
              }
            }
          }

          // Fallback geral
          if (!matched && agentSettings.enableFallback && !humanizedEnabled) {
            targetResponse = agentSettings.fallbackResponse;
            matched = true;
            fastify.log.info(`[CHATBOT] Sem match de regra. Resposta fallback acionada para "${combinedMessage}"`);
          }

          if (matched && targetResponse) {
            const senderLabel = humanizedEnabled ? 'Atendente' : 'Chatbot';
            const fullResponse = targetResponse + (humanizedEnabled ? '' : (agentSettings.signature || ""));
            const typingDelay = humanizedEnabled
              ? calculateHumanizedDelay(fullResponse)
              : calculateTypingDelay(fullResponse);
            
            fastify.log.info(`[${humanizedEnabled ? 'HUMANIZADO' : 'CHATBOT'}] Delay calculado: ${typingDelay}ms`);

            io.to('panel').emit('whatsapp_typing', { deviceId, app, sender, isTyping: true });

            const typingTimeout = setTimeout(() => {
              if (rawWs.readyState === RawWs.OPEN) {
                rawWs.send(JSON.stringify({
                  command: 'SEND_BACKGROUND_REPLY',
                  payload: { sender, app, message: fullResponse }
                }));

                const reply: WhatsAppMessage = {
                  app,
                  sender: senderLabel,
                  recipient: sender,
                  message: fullResponse,
                  timestamp: Date.now(),
                  isIncoming: false
                };
                whatsappMessages.push(reply);
                if (whatsappMessages.length > 500) whatsappMessages.shift();

                io.to('panel').emit('whatsapp_sent', {
                  deviceId,
                  ...reply
                });
              }

              io.to('panel').emit('whatsapp_typing', { deviceId, app, sender, isTyping: false });
              pendingChatbotReplies.delete(chatbotKey);
            }, typingDelay);

            const updatedPending = pendingChatbotReplies.get(chatbotKey);
            if (updatedPending) {
              updatedPending.typingTimeout = typingTimeout;
            }
          } else {
            pendingChatbotReplies.delete(chatbotKey);
          }
        }, silenceTimeoutMs);

        pendingChatbotReplies.set(chatbotKey, {
          evaluationTimeout,
          accumulatedMessages: accumulated
        });
      }
    } catch (err) {
      fastify.log.error(`[RAW WS] Error parsing message: ${err}`);
    }
  });

  rawWs.on('close', () => {
    fastify.log.info(`[RAW WS] Android device disconnected: ${deviceId}`);
    connectedDevices.delete(deviceId);
    io.to('panel').emit('device_disconnected', { deviceId });
  });

  rawWs.on('error', (err) => {
    fastify.log.error(`[RAW WS] Error: ${err.message}`);
  });
});

fastify.log.info(`[RAW WS] Bridge listening on port ${RAW_WS_PORT}`);

// ─── REST ROUTES ──────────────────────────────────────────────────────────────
fastify.get('/', async () => ({ status: 'ok', message: 'Remote Control API v1.0' }));

fastify.get('/api/devices', async () => {
  const devices = Array.from(connectedDevices.entries()).map(([id, d]) => ({
    id,
    socketId: d.socketId,
    ...d.info,
  }));
  return { devices };
});

// ─── Screenshot via ADB (spawn em cadeia) ────────────────────────────────────
const ADB_PATH = 'C:\\Users\\marke\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';
let lastFrame: string | null = null;
let captureProc: any = null;
let capturing = false;

function chainCapture() {
  if (!capturing) return;
  captureProc = spawn(ADB_PATH, ['exec-out', 'screencap', '-p'], {
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const chunks: Buffer[] = [];
  captureProc.stdout.on('data', (d: Buffer) => chunks.push(d));
  captureProc.on('exit', () => {
    if (chunks.length > 0) {
      const buf = Buffer.concat(chunks);
      if (buf.length > 100) {
        const b64 = buf.toString('base64');
        lastFrame = b64;
        const activeDeviceId = Array.from(connectedDevices.keys())[0] || 'adb';
        io.to('panel').emit('screen_frame', { deviceId: activeDeviceId, frame: b64 });
        io.to('panel').emit('screen_frame', { deviceId: 'adb', frame: b64 });
      }
    }
    if (capturing) chainCapture();
  });
  captureProc.on('error', () => {
    if (capturing) setTimeout(chainCapture, 200);
  });
}

fastify.get('/api/screenshot/start', async () => {
  if (capturing) return { status: 'already_running' };
  capturing = true;
  chainCapture();
  return { status: 'started' };
});

fastify.get('/api/screenshot/stop', async () => {
  capturing = false;
  if (captureProc) { captureProc.kill(); captureProc = null; }
  return { status: 'stopped' };
});

fastify.get('/api/screenshot', async () => {
  return lastFrame ? { frame: lastFrame } : { error: 'no_frame' };
});

// ─── WebSocket Events ─────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  fastify.log.info(`[WS] New connection: ${socket.id}`);
  const deviceId = socket.handshake.query.deviceId as string;
  const role = socket.handshake.query.role as string; // 'device' or 'panel'

  if (role === 'device' && deviceId) {
    // Android Agent connected
    fastify.log.info(`[WS] Android Agent registered: deviceId=${deviceId}`);
    connectedDevices.set(deviceId, { socketId: socket.id, info: { status: 'online' } });

    // Notify all panel clients
    io.to('panel').emit('device_connected', { deviceId, socketId: socket.id });

    // Sync settings with newly connected device
    sendSettingsToDevice(deviceId);

    // Device sends its hardware info
    socket.on('device_info', (data) => {
      try {
        const existing = connectedDevices.get(deviceId);
        if (existing) {
          existing.info = { ...existing.info, ...data };
          connectedDevices.set(deviceId, existing);
          io.to('panel').emit('device_info_updated', { deviceId, ...data });
        }
      } catch (err) {
        fastify.log.error(`[WS] Error in device_info: ${err}`);
      }
    });

    // Device sends result of a command execution
    socket.on('command_result', (data) => {
      try {
        fastify.log.info(`[CMD RESULT] from ${deviceId}:`, data);
        io.to('panel').emit('command_result', { deviceId, ...data });
        
        // Trata resultado para o Disparador em Massa
        handleBulkCommandResult(deviceId, data.command, data.result);
      } catch (err) {
        fastify.log.error(`[WS] Error in command_result: ${err}`);
      }
    });

    // Device sends screenshot frame
    socket.on('screen_frame', (data) => {
      try {
        io.to('panel').emit('screen_frame', { deviceId, frame: data.frame });
      } catch (err) {
        fastify.log.error(`[WS] Error in screen_frame: ${err}`);
      }
    });

    socket.on('disconnect', () => {
      fastify.log.info(`[WS] Android Agent disconnected: ${deviceId}`);
      connectedDevices.delete(deviceId);
      io.to('panel').emit('device_disconnected', { deviceId });
    });
  } else if (role === 'panel') {
    // Web Panel connected
    socket.join('panel');
    fastify.log.info(`[WS] Panel client connected`);

    // Panel sends a command to a specific device
    socket.on('send_command', (data: { deviceId: string; command: string; payload?: any }) => {
      try {
        const device = connectedDevices.get(data.deviceId);
        if (device) {
          fastify.log.info(`[CMD] Routing command "${data.command}" to device ${data.deviceId}`);
          
          if (data.command === 'SEND_BACKGROUND_REPLY') {
            const { sender, app, message } = data.payload || {};
            if (sender && message) {
              // Cancela qualquer chatbot agendado para esta conversa devido a intervenção manual
              const chatbotKey = `${sender}|${app || 'WhatsApp'}`;
              cancelPendingChatbotReply(chatbotKey, data.deviceId);

              const manualReply: WhatsAppMessage = {
                app: app || 'WhatsApp',
                sender: 'Você',
                recipient: sender,
                message,
                timestamp: Date.now(),
                isIncoming: false
              };
              whatsappMessages.push(manualReply);
              if (whatsappMessages.length > 500) whatsappMessages.shift();
              
              io.to('panel').emit('whatsapp_sent', {
                deviceId: data.deviceId,
                ...manualReply
              });
            }
          }

          const cmd = { command: data.command, payload: data.payload ?? {} };
          if (device.rawWs && device.rawWs.readyState === RawWs.OPEN) {
            device.rawWs.send(JSON.stringify(cmd));
          } else if (device.socketId) {
            io.to(device.socketId).emit('execute_command', cmd);
          } else {
            socket.emit('error', { message: `Device ${data.deviceId} has no active transport` });
          }
        } else {
          socket.emit('error', { message: `Device ${data.deviceId} not found or offline` });
        }
      } catch (err) {
        fastify.log.error(`[WS] Error in send_command: ${err}`);
        socket.emit('error', { message: 'Internal error processing command' });
      }
    });

    // Panel requests server IP info (for QR Code connection)
    socket.on('get_server_info', () => {
      try {
        // Se estiver no Render, RENDER_EXTERNAL_URL estará disponível
        const renderUrl = process.env.RENDER_EXTERNAL_URL;
        if (renderUrl) {
          // Converte https://... para wss://...
          const wsUrl = renderUrl.replace(/^http/, 'ws');
          socket.emit('server_info', { addresses: [wsUrl], isCloud: true });
          return;
        }

        const interfaces = os.networkInterfaces();
        const addresses: string[] = [];
        for (const name of Object.keys(interfaces)) {
          const iface = interfaces[name];
          if (iface) {
            for (const addr of iface) {
              if (addr.family === 'IPv4' && !addr.internal) {
                addresses.push(addr.address);
              }
            }
          }
        }
        const port = parseInt(process.env.PORT || '3001', 10);
        socket.emit('server_info', { addresses, port, isCloud: false });
      } catch (err) {
        fastify.log.error(`[WS] Error in get_server_info: ${err}`);
      }
    });

    // Panel requests current device list
    socket.on('get_devices', () => {
      try {
        const devices = Array.from(connectedDevices.entries()).map(([id, d]) => ({
          id,
          socketId: d.socketId,
          ...d.info,
        }));
        socket.emit('device_list', { devices });
      } catch (err) {
        fastify.log.error(`[WS] Error in get_devices: ${err}`);
      }
    });

    // Panel sends command to raw-WS device
    socket.on('send_command_raw', (data: { deviceId: string; command: string; payload?: any }) => {
      try {
        const device = connectedDevices.get(data.deviceId);
        if (device && device.rawWs && device.rawWs.readyState === RawWs.OPEN) {
          device.rawWs.send(JSON.stringify({ command: data.command, payload: data.payload ?? {} }));
        } else {
          socket.emit('error', { message: `Device ${data.deviceId} not found or offline` });
        }
      } catch (err) {
        fastify.log.error(`[WS] Error in send_command_raw: ${err}`);
        socket.emit('error', { message: 'Internal error' });
      }
    });

    // Panel requests to start screen streaming
    socket.on('start_stream', (data: { deviceId: string }) => {
      try {
        const device = connectedDevices.get(data.deviceId);
        if (device && device.rawWs && device.rawWs.readyState === RawWs.OPEN) {
          fastify.log.info(`[STREAM] Starting native stream on device ${data.deviceId}`);
          device.rawWs.send(JSON.stringify({ command: 'START_SCREEN_STREAM', payload: {} }));
        } else {
          fastify.log.info(`[STREAM] Device ${data.deviceId} offline or no raw WebSocket. Falling back to ADB screencap.`);
          if (!capturing) {
            capturing = true;
            chainCapture();
          }
        }
      } catch (err) {
        fastify.log.error(`[WS] Error in start_stream: ${err}`);
      }
    });

    socket.on('stop_stream', (data: { deviceId: string }) => {
      try {
        const device = connectedDevices.get(data.deviceId);
        if (device && device.rawWs && device.rawWs.readyState === RawWs.OPEN) {
          fastify.log.info(`[STREAM] Stopping native stream on device ${data.deviceId}`);
          device.rawWs.send(JSON.stringify({ command: 'STOP_SCREEN_STREAM', payload: {} }));
        }
        // Stop ADB capture if it was running
        if (capturing) {
          fastify.log.info(`[STREAM] Stopping ADB capture`);
          capturing = false;
          if (captureProc) {
            captureProc.kill();
            captureProc = null;
          }
        }
      } catch (err) {
        fastify.log.error(`[WS] Error in stop_stream: ${err}`);
      }
    });

    // Panel requests current received messages
    socket.on('get_whatsapp_messages', () => {
      socket.emit('whatsapp_messages_list', { messages: whatsappMessages });
    });

    socket.on('get_contacts', () => {
      socket.emit('contacts_list', { contacts: contactsList });
    });

    socket.on('get_bulk_status', () => {
      socket.emit('bulk_status_update', bulkState);
    });

    socket.on('start_bulk_send', (data: {
      deviceId: string;
      queue: BulkMessage[];
      delayMin: number;
      delayMax: number;
      app: string;
    }) => {
      try {
        if (bulkTimeout) {
          clearTimeout(bulkTimeout);
          bulkTimeout = null;
        }
        if (bulkResultTimeout) {
          clearTimeout(bulkResultTimeout);
          bulkResultTimeout = null;
        }

        bulkState = {
          active: true,
          queue: data.queue,
          currentIndex: 0,
          logs: [`[${new Date().toLocaleTimeString()}] 🚀 Iniciando disparo em massa para ${data.queue.length} contatos.`],
          delayMin: data.delayMin,
          delayMax: data.delayMax,
          app: data.app || 'WhatsApp',
          deviceId: data.deviceId,
          waitingForResult: false
        };

        fastify.log.info(`[BULK SENDER] Started for device ${data.deviceId} with ${data.queue.length} tasks.`);
        io.to('panel').emit('bulk_status_update', bulkState);
        
        // Start processing the first message
        processNextBulkMessage(data.deviceId);
      } catch (err) {
        fastify.log.error(`Error starting bulk send: ${err}`);
      }
    });

    socket.on('stop_bulk_send', () => {
      try {
        if (bulkTimeout) {
          clearTimeout(bulkTimeout);
          bulkTimeout = null;
        }
        if (bulkResultTimeout) {
          clearTimeout(bulkResultTimeout);
          bulkResultTimeout = null;
        }

        bulkState.active = false;
        bulkState.waitingForResult = false;
        bulkState.logs.push(`[${new Date().toLocaleTimeString()}] 🛑 Disparo em massa interrompido pelo usuário.`);
        
        fastify.log.info(`[BULK SENDER] Stopped by user.`);
        io.to('panel').emit('bulk_status_update', bulkState);
      } catch (err) {
        fastify.log.error(`Error stopping bulk send: ${err}`);
      }
    });

    socket.on('delete_contact', (data: { id: string }) => {
      try {
        const index = contactsList.findIndex(c => c.id === data.id);
        if (index !== -1) {
          const contact = contactsList[index];
          fastify.log.info(`[CHAT] Deleting contact and messages for ${contact.name} (${contact.app})`);
          
          // Remove do array de contatos
          contactsList.splice(index, 1);
          
          // Remove todas as mensagens associadas a esse contato
          for (let i = whatsappMessages.length - 1; i >= 0; i--) {
            const m = whatsappMessages[i];
            const isAssociated = (m.isIncoming && m.sender === contact.name && m.app === contact.app) ||
                                 (!m.isIncoming && m.recipient === contact.name && m.app === contact.app);
            if (isAssociated) {
              whatsappMessages.splice(i, 1);
            }
          }

          // Cancela qualquer chatbot pendente
          cancelPendingChatbotReply(`${contact.name}|${contact.app}`, deviceId);

          // Emite listas atualizadas para o painel
          io.to('panel').emit('contacts_list', { contacts: contactsList });
          io.to('panel').emit('whatsapp_messages_list', { messages: whatsappMessages });
        }
      } catch (err) {
        fastify.log.error(`Error deleting contact: ${err}`);
      }
    });

    // Panel requests chatbot rules list
    socket.on('get_chatbot_rules', () => {
      socket.emit('chatbot_rules_list', { rules: autoReplyRules });
    });

    // Panel adds a new rule
    socket.on('add_chatbot_rule', (data: { keyword: string; response: string }) => {
      try {
        const newRule: AutoReplyRule = {
          id: `rule-${Date.now()}`,
          keyword: data.keyword,
          response: data.response
        };
        autoReplyRules.push(newRule);
        fastify.log.info(`[CHATBOT] Added rule: ${JSON.stringify(newRule)}`);
        io.to('panel').emit('chatbot_rules_list', { rules: autoReplyRules });
      } catch (err) {
        fastify.log.error(`Error adding chatbot rule: ${err}`);
      }
    });

    // Panel deletes a rule
    socket.on('delete_chatbot_rule', (data: { id: string }) => {
      try {
        const index = autoReplyRules.findIndex(r => r.id === data.id);
        if (index !== -1) {
          autoReplyRules.splice(index, 1);
          fastify.log.info(`[CHATBOT] Deleted rule ID: ${data.id}`);
          io.to('panel').emit('chatbot_rules_list', { rules: autoReplyRules });
        }
      } catch (err) {
        fastify.log.error(`Error deleting chatbot rule: ${err}`);
      }
    });

    // Panel requests notifications list
    socket.on('get_notifications', () => {
      socket.emit('notifications_list', { notifications: systemNotifications });
    });

    // Panel requests current agent settings
    socket.on('get_agent_settings', () => {
      socket.emit('agent_settings_updated', agentSettings);
    });

    // Panel updates agent settings
    socket.on('update_agent_settings', (data: AgentSettings) => {
      try {
        agentSettings = { ...agentSettings, ...data };
        fastify.log.info(`[AGENT SETTINGS] Updated: ${JSON.stringify(agentSettings)}`);
        io.to('panel').emit('agent_settings_updated', agentSettings);

        // Propaga a configuração de auto-resposta em tela para os dispositivos
        for (const deviceId of connectedDevices.keys()) {
          sendSettingsToDevice(deviceId);
        }
      } catch (err) {
        fastify.log.error(`Error updating agent settings: ${err}`);
      }
    });

    // ─── Atendimento Humanizado ───
    socket.on('get_humanized_config', () => {
      socket.emit('humanized_config', {
        enabled: humanizedEnabled,
        delayMin: humanizedDelayMin,
        delayMax: humanizedDelayMax,
        categories: humanizedCategories,
      });
    });

    socket.on('update_humanized_config', (data: {
      enabled?: boolean;
      delayMin?: number;
      delayMax?: number;
      categories?: HumanizedCategory[];
    }) => {
      try {
        if (data.enabled !== undefined) humanizedEnabled = data.enabled;
        if (data.delayMin !== undefined) humanizedDelayMin = data.delayMin;
        if (data.delayMax !== undefined) humanizedDelayMax = data.delayMax;
        if (data.categories) humanizedCategories = data.categories;

        fastify.log.info(`[HUMANIZADO] Config atualizada. enabled=${humanizedEnabled}`);
        io.to('panel').emit('humanized_config', {
          enabled: humanizedEnabled,
          delayMin: humanizedDelayMin,
          delayMax: humanizedDelayMax,
          categories: humanizedCategories,
        });
      } catch (err) {
        fastify.log.error(`Error updating humanized config: ${err}`);
      }
    });

    socket.on('disconnect', () => {
      fastify.log.info(`[WS] Panel client disconnected`);
      if (capturing) {
        capturing = false;
        if (captureProc) {
          captureProc.kill();
          captureProc = null;
        }
      }
    });
  } else {
    fastify.log.warn(`[WS] Unknown connection role: ${role} — disconnecting`);
    socket.disconnect();
  }
});

// ─── START ────────────────────────────────────────────────────────────────────
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3001', 10);
    await fastify.listen({ port, host: '0.0.0.0' });
    fastify.log.info(`🚀 Server running at http://0.0.0.0:${port}`);

    // Configura o adb reverse para encaminhar conexões do dispositivo via USB automaticamente
    exec(`"${ADB_PATH}" reverse tcp:3002 tcp:${port}`, (err) => {
      if (err) {
        fastify.log.warn(`[ADB] Falha ao configurar adb reverse (USB): ${err.message}`);
      } else {
        fastify.log.info(`[ADB] Redirecionamento USB configurado com sucesso (adb reverse tcp:3002 tcp:${port})`);
      }
    });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
