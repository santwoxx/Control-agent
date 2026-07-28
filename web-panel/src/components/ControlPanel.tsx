"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useSocket } from "@/context/SocketContext";
import QrConnect from "./QrConnect";

interface Btn { icon: string; label: string; command: string; payload?: any; }

export default function ControlPanel() {
  const { socket, sendCommand, selectedDevice, screenFrame, setScreenFrame, commandResult } = useSocket();
  const [textInput, setTextInput] = useState("");
  const [automationPrompt, setAutomationPrompt] = useState("");
  const [appPackage, setAppPackage] = useState("com.google.android.keep");
  const [log, setLog] = useState<string[]>([]);
  const [deviceWidth, setDeviceWidth] = useState(1080);
  const [deviceHeight, setDeviceHeight] = useState(2400);

  // J.A.R.V.I.S. Voice Interface
  const [isListening, setIsListening] = useState<"prompt" | "reply" | null>(null);
  const [jarvisTranscript, setJarvisTranscript] = useState("");
  const recognitionRef = useRef<any>(null);
  const transcriptTimeoutRef = useRef<any>(null);

  const stopListening = useCallback(() => {
    try { recognitionRef.current?.stop(); } catch {}
    setIsListening(null);
    setJarvisTranscript("");
    if (transcriptTimeoutRef.current) clearTimeout(transcriptTimeoutRef.current);
  }, []);

  const startVoiceInput = useCallback((target: "prompt" | "reply") => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("J.A.R.V.I.S. não está disponível neste navegador. Use Chrome ou Edge.");
      return;
    }
    if (isListening) {
      stopListening();
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "pt-BR";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      let finalTranscript = "";
      let interimTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += t;
        } else {
          interimTranscript += t;
        }
      }
      setJarvisTranscript(interimTranscript || finalTranscript);
      if (finalTranscript) {
        if (transcriptTimeoutRef.current) clearTimeout(transcriptTimeoutRef.current);
        if (target === "prompt") {
          setAutomationPrompt((prev) => prev + (prev ? " " : "") + finalTranscript);
        } else {
          setManualReplyText((prev) => prev + (prev ? " " : "") + finalTranscript);
        }
        transcriptTimeoutRef.current = setTimeout(() => setIsListening(null), 800);
      }
    };
    recognition.onerror = (e: any) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      stopListening();
    };
    recognition.onend = () => {
      if (isListening) setIsListening(null);
      setJarvisTranscript("");
    };
    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(target);
    setJarvisTranscript("🎤 Ouvindo...");
  }, [isListening, stopListening]);

  // Screen interaction state
  const screenRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ x: number; y: number } | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [ripple, setRipple] = useState<{ x: number; y: number } | null>(null);
  const [screenPolling, setScreenPolling] = useState(false);

  // WhatsApp & Chatbot integration state
  const [activeTab, setActiveTab] = useState<"controls" | "whatsapp" | "skills" | "bulk" | "humanizado">("controls");
  const [whatsappMessages, setWhatsappMessages] = useState<any[]>([]);
  const [chatbotRules, setChatbotRules] = useState<any[]>([]);
  const [newRuleKeyword, setNewRuleKeyword] = useState("");
  const [newRuleResponse, setNewRuleResponse] = useState("");
  const [selectedChatContact, setSelectedChatContact] = useState<any | null>(null);
  const [manualReplyText, setManualReplyText] = useState("");
  const [contacts, setContacts] = useState<any[]>([]);
  const [typingContacts, setTypingContacts] = useState<Record<string, boolean>>({});

  // Atendimento Humanizado States
  const [humanizedEnabled, setHumanizedEnabled] = useState(false);
  const [humanizedDelayMin, setHumanizedDelayMin] = useState(3000);
  const [humanizedDelayMax, setHumanizedDelayMax] = useState(7000);
  interface HumanizedCategory { id: string; name: string; keywords: string[]; responses: string[]; }
  const [humanizedCategories, setHumanizedCategories] = useState<HumanizedCategory[]>([]);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [humanizedPrompt, setHumanizedPrompt] = useState(`Você é um assistente de atendimento humanizado via WhatsApp.

Seu objetivo é responder clientes de forma natural, clara, educada e conversacional, como um atendente humano experiente.

REGRAS DE COMPORTAMENTO:
- Escreva como uma pessoa real, evitando linguagem robótica ou excessivamente formal.
- Nunca use respostas idênticas repetidas. Sempre varie a estrutura das frases.
- Adapte o tom ao contexto do cliente (curioso, interessado, com dúvida, indeciso, etc.).
- Seja direto, mas sem parecer automático ou "scriptado".
- Use linguagem simples, brasileira, e natural.
- Se necessário, faça pequenas perguntas para manter a conversa fluindo.
- Demonstre atenção ao que o cliente disse antes de responder.
- Não seja agressivo nem insistente.
- Evite mensagens longas demais; prefira respostas curtas e conversacionais.

ESTILO DE RESPOSTA:
- Tom amigável, humano e leve.
- Pode usar expressões naturais como "entendi", "boa", "perfeito", "deixa comigo", "vamos lá".
- Pode usar emojis com moderação (0 a 2 por mensagem, quando fizer sentido).
- Evite excesso de emojis ou textos promocionais exagerados.`);

  // Bulk Sender States
  const [bulkContactsText, setBulkContactsText] = useState("");
  const [bulkMessageMode, setBulkMessageMode] = useState<"single" | "personalized">("single");
  const [bulkCommonMessage, setBulkCommonMessage] = useState("");
  const [bulkDelayMin, setBulkDelayMin] = useState(5);
  const [bulkDelayMax, setBulkDelayMax] = useState(15);
  const [bulkApp, setBulkApp] = useState("WhatsApp");
  const [bulkStatus, setBulkStatus] = useState<any>({
    active: false,
    queue: [],
    currentIndex: 0,
    logs: [],
    delayMin: 5,
    delayMax: 15,
    app: "WhatsApp",
    waitingForResult: false
  });

  // General system notifications and agent behavior states
  const [notifications, setNotifications] = useState<any[]>([]);
  const [agentSettings, setAgentSettings] = useState({
    fallbackResponse: "Olá! Recebemos sua mensagem, mas no momento estou indisponível. Em breve retorno!",
    signature: "\n— Atendimento Automático",
    delayMs: 1000,
    enableFallback: false,
    delayType: "dynamic" as "fixed" | "dynamic",
    ignoredContacts: "",
    foregroundAutoReply: false
  });

  const chatEndRef = useRef<HTMLDivElement>(null);


  // Manage screen stream start/stop
  useEffect(() => {
    if (!socket || !selectedDevice || !screenPolling) {
      if (socket && selectedDevice) {
        socket.emit("stop_stream", { deviceId: selectedDevice });
      }
      return;
    }

    // Start stream
    socket.emit("start_stream", { deviceId: selectedDevice });

    return () => {
      if (socket && selectedDevice) {
        socket.emit("stop_stream", { deviceId: selectedDevice });
      }
    };
  }, [socket, selectedDevice, screenPolling]);

  // Handle WhatsApp, chatbot rules, system notifications, contacts and agent settings events
  useEffect(() => {
    if (!socket || !selectedDevice) return;

    socket.emit("get_whatsapp_messages");
    socket.emit("get_chatbot_rules");
    socket.emit("get_notifications");
    socket.emit("get_agent_settings");
    socket.emit("get_contacts");
    socket.emit("get_bulk_status");
    socket.emit("get_humanized_config");

    const handleMessagesList = (data: { messages: any[] }) => {
      setWhatsappMessages(data.messages);
    };

    const handleRulesList = (data: { rules: any[] }) => {
      setChatbotRules(data.rules);
    };

    const handleNotificationsList = (data: { notifications: any[] }) => {
      setNotifications(data.notifications);
    };

    const handleContactsList = (data: { contacts: any[] }) => {
      setContacts(data.contacts);
    };

    const handleMsgReceived = (msg: any) => {
      if (msg.deviceId === selectedDevice) {
        setWhatsappMessages((prev) => {
          const next = [...prev, msg];
          return next.slice(-200);
        });
      }
    };

    const handleMsgSent = (msg: any) => {
      if (msg.deviceId === selectedDevice) {
        setWhatsappMessages((prev) => {
          const next = [...prev, msg];
          return next.slice(-200);
        });
      }
    };

    const handleRulesUpdated = (data: { rules: any[] }) => {
      setChatbotRules(data.rules);
    };

    const handleNotificationReceived = (notif: any) => {
      if (notif.deviceId === selectedDevice) {
        setNotifications((prev) => {
          const next = [notif, ...prev];
          return next.slice(0, 100);
        });
      }
    };

    const handleAgentSettingsUpdated = (settings: any) => {
      setAgentSettings(settings);
    };

    const handleTyping = (data: { deviceId: string; app: string; sender: string; isTyping: boolean }) => {
      if (data.deviceId === selectedDevice) {
        const contactKey = `${data.sender}-${data.app}`;
        setTypingContacts((prev) => ({
          ...prev,
          [contactKey]: data.isTyping
        }));
      }
    };

    const handleBulkStatusUpdate = (status: any) => {
      setBulkStatus(status);
    };

    const handleHumanizedConfig = (data: { enabled: boolean; delayMin: number; delayMax: number; categories: any[] }) => {
      setHumanizedEnabled(data.enabled);
      setHumanizedDelayMin(data.delayMin);
      setHumanizedDelayMax(data.delayMax);
      if (data.categories && data.categories.length > 0) {
        setHumanizedCategories(data.categories);
      }
    };

    socket.on("whatsapp_messages_list", handleMessagesList);
    socket.on("chatbot_rules_list", handleRulesUpdated);
    socket.on("whatsapp_received", handleMsgReceived);
    socket.on("whatsapp_sent", handleMsgSent);
    socket.on("notifications_list", handleNotificationsList);
    socket.on("notification_received", handleNotificationReceived);
    socket.on("agent_settings_updated", handleAgentSettingsUpdated);
    socket.on("contacts_list", handleContactsList);
    socket.on("whatsapp_typing", handleTyping);
    socket.on("bulk_status_update", handleBulkStatusUpdate);
    socket.on("humanized_config", handleHumanizedConfig);

    return () => {
      socket.off("whatsapp_messages_list", handleMessagesList);
      socket.off("chatbot_rules_list", handleRulesUpdated);
      socket.off("whatsapp_received", handleMsgReceived);
      socket.off("whatsapp_sent", handleMsgSent);
      socket.off("notifications_list", handleNotificationsList);
      socket.off("notification_received", handleNotificationReceived);
      socket.off("agent_settings_updated", handleAgentSettingsUpdated);
      socket.off("contacts_list", handleContactsList);
      socket.off("whatsapp_typing", handleTyping);
      socket.off("bulk_status_update", handleBulkStatusUpdate);
      socket.off("humanized_config", handleHumanizedConfig);
    };
  }, [socket, selectedDevice]);

  // Set initial selected contact
  useEffect(() => {
    if (!selectedChatContact && contacts.length > 0) {
      setSelectedChatContact(contacts[0]);
    }
  }, [contacts, selectedChatContact]);

  // Auto-scroll chat window
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [whatsappMessages, selectedChatContact]);

  const startBulkSend = () => {
    if (!socket || !selectedDevice) return;

    const lines = bulkContactsText.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    const queue = lines.map(line => {
      const parts = line.split(";");
      const recipient = parts[0].trim();
      let message = parts.slice(1).join(";").trim();

      if (bulkMessageMode === "single" || !message) {
        message = bulkCommonMessage;
      }
      return { recipient, message };
    });

    if (queue.length === 0) {
      alert("Por favor, insira pelo menos um contato/número válido.");
      return;
    }

    socket.emit("start_bulk_send", {
      deviceId: selectedDevice,
      queue,
      delayMin: Number(bulkDelayMin),
      delayMax: Number(bulkDelayMax),
      app: bulkApp
    });
  };

  const stopBulkSend = () => {
    if (!socket) return;
    socket.emit("stop_bulk_send");
  };

  const dispatch = (command: string, payload?: any) => {
    sendCommand(command, payload);
    setLog((prev) => [`[${new Date().toLocaleTimeString()}] → ${command}${payload ? " " + JSON.stringify(payload) : ""}`, ...prev].slice(0, 50));
  };

  const sendManualReply = () => {
    if (!selectedChatContact || !manualReplyText.trim()) return;
    dispatch("SEND_BACKGROUND_REPLY", {
      sender: selectedChatContact.name,
      app: selectedChatContact.app,
      message: manualReplyText.trim()
    });
    setManualReplyText("");
  };

  const handleAddRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleKeyword.trim() || !newRuleResponse.trim() || !socket) return;
    socket.emit("add_chatbot_rule", {
      keyword: newRuleKeyword.trim(),
      response: newRuleResponse.trim()
    });
    setNewRuleKeyword("");
    setNewRuleResponse("");
  };

  const handleDeleteRule = (id: string) => {
    if (!socket) return;
    socket.emit("delete_chatbot_rule", { id });
  };

  const saveAgentSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket) return;
    socket.emit("update_agent_settings", agentSettings);
  };

  const handleAutomation = () => {
    if (!automationPrompt.trim()) return;
    const trimmed = automationPrompt.trim();

    const cleanNumber = (raw: string) => raw.replace(/[\s\-\(\)\+]/g, "").replace(/^0+/, "");

    const removeFillers = (s: string) =>
      s
        .replace(/^(?:t[áa](?:\s+bem|\s+bom|\s+tudo|\s+joinha)?|n[ée]|tipo|assim|da[ií]?|a[ií]?|ent[ãa]o?|bom|bem|ó|ah|eh|ih|oh|uh|entendeu|sabe|viu|olha|veja|cara|mano|meu)\s+/i, "")
        .replace(/\s+(?:t[áa](?:\s+bem|\s+bom|\s+tudo)?|n[ée]|tipo|assim|da[ií]?|a[ií]?|ent[ãa]o?|bom|bem|sabe|viu|entendeu|cara|mano)\s*$/i, "")
        .trim();

    const removeCmdPrefix = (s: string) => {
      let r = s
        .replace(/(?:o\s+)?n[uú]mero\s+(?:dele|dela|dele\s+[ée]|dela\s+[ée]|d[oae]?\s+contato|d[oae]?\s+zap|d[oae]?\s+whatsapp|telefone|phone|celular|do\s+whatsapp|do\s+zap|do\s+contato)[\s:]*/gi, "")
        .replace(/^(?:voc[êe]\s+)?(?:pode|podes|poderia|poderiam)\s+(?:me\s+)?/i, "")
        .replace(/^(?:gostaria\s+de\s+)?(?:preciso\s+(?:de\s+)?)?(?:quero|quer[eo]?|queria|queríamos)\s+(?:que\s+(?:voc[êe]\s+)?)?/i, "")
        .replace(/^(?:vou|vai|vamos|vão)\s+/i, "")
        .replace(/^(?:mandei|mandou|mandamos|mandaram|manda|mande|mandar)\s+/i, "")
        .replace(/^(?:enviar|enviei|enviou|enviamos|enviaram|envia|envie)\s+/i, "")
        .replace(/^(?:essa|esta|uma|a)\s+(?:mensagem|whatsapp|zap|msg)\s+(?:para|pra|pro|ao|no|na)\s+(?:\w+\s+)*/i, "")
        .replace(/^(?:mensagem|whatsapp|zap|msg)\s+(?:para|pra|pro|ao|no|na)\s+(?:\w+\s+)*/i, "")
        .replace(/^(?:para|pra|pro|ao|no|na)\s+(?:\w+\s+)*?/i, "")
        .replace(/^(?:falando|dizendo|com\s+a\s+mensagem|dizendo\s+o\s+seguinte|falando\s+o\s+seguinte|dizer|diz|diga|seguinte|com\s+o\s+texto|texto|mensagem)[\s,:]*/i, "")
        .replace(/\s+/g, " ")
        .trim();
      return r;
    };

    // Detecta intenção de WhatsApp com concordância verbal
    // Cobre: enviar, envia, envie, enviei, enviou, mandar, manda, mande, mandei, mandou,
    //        vou enviar, quero mandar, pode enviar, gostaria de enviar, preciso mandar,
    //        whatsapp, zap, mensagem pra, msg pra, falar com, manda zap
    const whatsappIntentVerbs = /(?:(?:envi|mand)(?:[aeiou]|[aeiou]r|[aeiou]m|[aei]ei?|ar|ou|amos|aram|ei)|whatsapp|zap|msg\s+para|mensagem\s+(?:para|pra|pro)|fal(?:ar|a|o|ei|e)\s+com|mandei|mandou)/i;
    const hasMsgKeyword = /(?:mensagem|whatsapp|zap|msg|n[uú]mero|telefone|celular|contato|fal(?:ar|a|o|e)\s+com)/i;
    const hasLongNumber = /(\d[\d\s\-\(\)]{7,}\d)/.test(trimmed);

    const isWhatsApp = whatsappIntentVerbs.test(trimmed) || (hasLongNumber && hasMsgKeyword.test(trimmed));

    if (isWhatsApp) {
      const allNumbers = trimmed.match(/(\d[\d\s\-\(\)]{7,}\d)/g);
      if (allNumbers) {
        const number = cleanNumber(allNumbers[0]);
        if (number.length >= 8) {
          let message = trimmed
            .replace(/(\d[\d\s\-\(\)]{7,}\d)/g, "")
            .trim();

          message = removeCmdPrefix(message);
          message = removeFillers(message);
          message = removeCmdPrefix(message);

          // Se vazio ou muito curto, tenta texto ANTES do número
          if (!message || message.length < 3) {
            const numIdx = trimmed.search(/(\d[\d\s\-\(\)]{7,}\d)/);
            if (numIdx > 0) {
              message = trimmed.slice(0, numIdx).trim();
              message = removeCmdPrefix(message);
              message = removeFillers(message);
            }
          }

          // Se ainda vazio, tenta texto DEPOIS do número
          if (!message || message.length < 3) {
            const numMatch = trimmed.match(/(\d[\d\s\-\(\)]{7,}\d)/);
            if (numMatch) {
              const idx = trimmed.indexOf(numMatch[0]);
              message = trimmed.slice(idx + numMatch[0].length).trim();
              message = message.replace(/^(?:falando|dizendo|mensagem|texto|com\s+a\s+mensagem|dizer|diga|diz)[\s,:]*/i, "").trim();
              message = removeFillers(message);
            }
          }

          dispatch("AUTOMATION_WHATSAPP", { number, message: message || "(sem mensagem)" });
          setAutomationPrompt("");
          return;
        }
      }
    }

    // 2. Open URL
    const urlMatch = trimmed.match(/^(?:abrir\s+)?site\s+(https?:\/\/\S+)$/i);
    if (urlMatch) {
      dispatch("OPEN_URL", { url: urlMatch[1] });
      setAutomationPrompt("");
      return;
    }

    // 3. Fallback geral: qualquer número longo no texto
    const fallbackNums = trimmed.match(/(\d[\d\s\-\(\)]{7,}\d)/);
    if (fallbackNums) {
      const number = cleanNumber(fallbackNums[0]);
      if (number.length >= 8) {
        let message = trimmed.replace(/(\d[\d\s\-\(\)]{7,}\d)/, "").replace(/\s+/g, " ").trim();
        message = removeFillers(message);
        if (!message || message.length < 3) {
          const numIdx = trimmed.search(/(\d[\d\s\-\(\)]{7,}\d)/);
          if (numIdx > 0) message = trimmed.slice(0, numIdx).trim();
        }
        dispatch("AUTOMATION_WHATSAPP", { number, message: message || "(sem mensagem)" });
        setAutomationPrompt("");
        return;
      }
    }

    setLog((prev) => [
      `[${new Date().toLocaleTimeString()}] ✗ Comando não reconhecido. Use: 'whatsapp [numero] [mensagem]' ou 'site [url]'`,
      ...prev
    ].slice(0, 50));
  };

  useEffect(() => {
    if (commandResult) {
      const icon = commandResult.result === "success" ? "✓" : "✗";
      setLog((prev) => [`[${new Date(commandResult.timestamp).toLocaleTimeString()}] ${icon} ${commandResult.command}: ${commandResult.result}`, ...prev].slice(0, 50));
    }
  }, [commandResult]);

  const getDeviceCoords = useCallback((clientX: number, clientY: number) => {
    const el = screenRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const scaleX = deviceWidth / rect.width;
    const scaleY = deviceHeight / rect.height;
    const x = Math.round((clientX - rect.left) * scaleX);
    const y = Math.round((clientY - rect.top) * scaleY);
    return { x: Math.max(0, Math.min(deviceWidth, x)), y: Math.max(0, Math.min(deviceHeight, y)) };
  }, [deviceWidth, deviceHeight]);

  const handleScreenDown = (e: React.MouseEvent) => {
    const coords = getDeviceCoords(e.clientX, e.clientY);
    if (!coords) return;
    setIsDragging(true);
    setDragStart(coords);
    setDragEnd(null);
  };

  const handleScreenMove = (e: React.MouseEvent) => {
    const coords = getDeviceCoords(e.clientX, e.clientY);
    if (!coords) return;
    setHoverPos(coords);
    if (isDragging) {
      setDragEnd(coords);
    }
  };

  const handleScreenUp = (e: React.MouseEvent) => {
    const coords = getDeviceCoords(e.clientX, e.clientY);
    if (!coords) return;
    setIsDragging(false);

    if (dragStart) {
      const dx = coords.x - dragStart.x;
      const dy = coords.y - dragStart.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 30) {
        dispatch("TAP", { x: coords.x, y: coords.y });
        setRipple(coords);
        setTimeout(() => setRipple(null), 600);
      } else {
        dispatch("SWIPE", { x1: dragStart.x, y1: dragStart.y, x2: coords.x, y2: coords.y });
      }
    }
    setDragStart(null);
    setDragEnd(null);
  };

  const handleScreenLeave = () => {
    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
    setHoverPos(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.deltaY < 0) dispatch("SCROLL", { direction: "up" });
    else dispatch("SCROLL", { direction: "down" });
  };

  // Contacts loaded from memory state variables

  if (!selectedDevice) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 64 }}>📡</div>
        <p style={{ color: "var(--text-muted)", fontSize: 16 }}>Nenhum dispositivo selecionado</p>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Conecte o app Android e selecione um dispositivo na barra lateral</p>
        <div style={{ width: 300, marginTop: 8 }}>
          <QrConnect />
        </div>
      </div>
    );
  }

  return (
    <>
    <div style={{ flex: 1, display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Left: Control Toolbar (main area) */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        
        {/* Tab Selector */}
        <div style={{ display: "flex", gap: 8, background: "var(--surface)", padding: 4, borderRadius: 8, border: "1px solid var(--border)" }}>
          <button
            onClick={() => setActiveTab("controls")}
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: "6px",
              border: "none",
              background: activeTab === "controls" ? "var(--accent)" : "transparent",
              color: activeTab === "controls" ? "white" : "var(--text-muted)",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "12px",
              transition: "all 0.15s"
            }}
          >
            🕹️ Controle
          </button>
          <button
            onClick={() => setActiveTab("whatsapp")}
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: "6px",
              border: "none",
              background: activeTab === "whatsapp" ? "var(--accent)" : "transparent",
              color: activeTab === "whatsapp" ? "white" : "var(--text-muted)",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "12px",
              transition: "all 0.15s"
            }}
          >
            💬 WhatsApp
          </button>
          <button
            onClick={() => setActiveTab("humanizado")}
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: "6px",
              border: "none",
              background: activeTab === "humanizado" ? "var(--accent)" : "transparent",
              color: activeTab === "humanizado" ? "white" : "var(--text-muted)",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "12px",
              transition: "all 0.15s"
            }}
          >
            🎯 Atendimento
          </button>
          <button
            onClick={() => setActiveTab("skills")}
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: "6px",
              border: "none",
              background: activeTab === "skills" ? "var(--accent)" : "transparent",
              color: activeTab === "skills" ? "white" : "var(--text-muted)",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "12px",
              transition: "all 0.15s"
            }}
          >
            ⚙️ Comportamento
          </button>
          <button
            onClick={() => setActiveTab("bulk")}
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: "6px",
              border: "none",
              background: activeTab === "bulk" ? "var(--accent)" : "transparent",
              color: activeTab === "bulk" ? "white" : "var(--text-muted)",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "12px",
              transition: "all 0.15s"
            }}
          >
            📢 Disparador
          </button>
        </div>

        {activeTab === "controls" && (
          <>
            {/* System Navigation */}
            <section className="glass-card" style={{ padding: 14 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10, display: "block", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Navegação
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  { icon: "◀", label: "Voltar", command: "PRESS_BACK" },
                  { icon: "🏠", label: "Home", command: "PRESS_HOME" },
                  { icon: "📋", label: "Recentes", command: "PRESS_RECENTS" },
                ].map((b) => (
                  <button key={b.command} className="ctrl-btn" style={{ flex: 1, padding: "10px 6px" }} onClick={() => dispatch(b.command)}>
                    <span style={{ fontSize: 18 }}>{b.icon}</span>
                    <span style={{ fontSize: 10 }}>{b.label}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* Quick Tap Pad */}
            <section className="glass-card" style={{ padding: 14 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10, display: "block", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Toque Rápido
              </span>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 6 }}>
                {[
                  { icon: "⬆", label: "Topo", command: "TAP", payload: { x: 540, y: 200 } },
                  { icon: "⬅", label: "Esq", command: "TAP", payload: { x: 60, y: 1200 } },
                  { icon: "⬤", label: "Centro", command: "TAP", payload: { x: 540, y: 1200 } },
                  { icon: "➡", label: "Dir", command: "TAP", payload: { x: 1020, y: 1200 } },
                  { icon: "⬇", label: "Base", command: "TAP", payload: { x: 540, y: 2200 } },
                ].map((b) => (
                  <button key={b.label} className="ctrl-btn" style={{ padding: "10px 4px", fontSize: 10 }} onClick={() => dispatch(b.command, b.payload)}>
                    <span>{b.icon}</span>
                    <span>{b.label}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* Type Text */}
            <section className="glass-card" style={{ padding: 14 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10, display: "block", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Digitar Texto
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { dispatch("TYPE_TEXT", { text: textInput }); setTextInput(""); } }}
                  placeholder="Digite algo..."
                  style={{ flex: 1, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", color: "var(--text)", fontSize: 13 }}
                />
                <button className="ctrl-btn" style={{ padding: "8px 14px", background: "rgba(124,58,237,0.2)", borderColor: "var(--accent)" }} onClick={() => { dispatch("TYPE_TEXT", { text: textInput }); setTextInput(""); }}>
                  ⌨ Enviar
                </button>
              </div>
            </section>

            {/* Open App */}
            <section className="glass-card" style={{ padding: 14 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10, display: "block", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Abrir App
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <select
                  value={appPackage}
                  onChange={(e) => setAppPackage(e.target.value)}
                  style={{ flex: 1, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", color: "var(--text)", fontSize: 12 }}
                >
                  <option value="com.google.android.keep">📝 Keep</option>
                  <option value="com.whatsapp">💬 WhatsApp</option>
                  <option value="com.instagram.android">📸 Instagram</option>
                  <option value="com.google.android.youtube">▶️ YouTube</option>
                  <option value="com.android.settings">⚙️ Config</option>
                  <option value="com.android.chrome">🌐 Chrome</option>
                </select>
                <button className="ctrl-btn" style={{ padding: "8px 12px", background: "rgba(124,58,237,0.2)", borderColor: "var(--accent)" }} onClick={() => dispatch("OPEN_APP", { package: appPackage })}>
                  ▶
                </button>
              </div>
            </section>

            {/* J.A.R.V.I.S. — Automação por Voz */}
            <section className="jarvis-card glass-card">
              <div className="jarvis-card-header">
                <div className="jarvis-logo">
                  <div className="jarvis-logo-inner">J</div>
                </div>
                <div className="jarvis-title-group">
                  <span className="jarvis-title">J.A.R.V.I.S.</span>
                  <span className="jarvis-subtitle">Automação por Voz</span>
                </div>
                {isListening === "prompt" && (
                  <span className="jarvis-listening-badge">
                    <span className="jarvis-dot" />
                    Ouvindo...
                  </span>
                )}
              </div>

              <div className="jarvis-input-row">
                <div className="jarvis-input-wrap">
                  <input
                    value={automationPrompt}
                    onChange={(e) => setAutomationPrompt(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAutomation(); }}
                    placeholder="ex: manda um zap pro 5511999999999 dizendo olá"
                    className={isListening === "prompt" ? "jarvis-input jarvis-active-input" : "jarvis-input"}
                  />
                  {isListening === "prompt" && (
                    <>
                      <div className="jarvis-ring" />
                      <div className="jarvis-ring jarvis-ring-delay" />
                    </>
                  )}
                </div>
                <button
                  className={`jarvis-mic-btn ${isListening === "prompt" ? "is-listening" : ""}`}
                  onClick={() => startVoiceInput("prompt")}
                  title={isListening === "prompt" ? "J.A.R.V.I.S. está ouvindo..." : "J.A.R.V.I.S. — Comando de Voz"}
                >
                  {isListening === "prompt" ? "🎤" : "🎤"}
                  {isListening === "prompt" && <span className="jarvis-mic-ring" />}
                </button>
                <button className="jarvis-exec-btn" onClick={handleAutomation}>
                  ⚡ Executar
                </button>
              </div>

              <div className="jarvis-examples">
                <span className="jarvis-examples-title">📌 Exemplos de voz</span>
                <div className="jarvis-examples-list">
                  <span className="jarvis-example-item">"envie zap pra 5511999999999 falando olá, tudo bem?"</span>
                  <span className="jarvis-example-item">"manda mensagem pro 557399428872 quero marcar um horário"</span>
                  <span className="jarvis-example-item">"abrir site https://google.com"</span>
                </div>
              </div>
            </section>

            {/* Actions row */}
            <section className="glass-card" style={{ padding: 14 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10, display: "block", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Ações
              </span>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr", gap: 6 }}>
                {[
                  { icon: "📷", label: "Print", command: "SCREENSHOT" },
                  { icon: "🔒", label: "Bloquear", command: "PRESS_POWER" },
                  { icon: "🔊", label: "Vol+", command: "VOLUME_UP" },
                  { icon: "🔉", label: "Vol-", command: "VOLUME_DOWN" },
                  { icon: "⬆", label: "Scroll↑", command: "SCROLL", payload: { direction: "up" } },
                  { icon: "⬇", label: "Scroll↓", command: "SCROLL", payload: { direction: "down" } },
                ].map((b) => (
                  <button key={b.command + (b.payload?.direction || "")} className="ctrl-btn" style={{ padding: "10px 4px", fontSize: 10 }} onClick={() => dispatch(b.command, b.payload)}>
                    <span>{b.icon}</span>
                    <span>{b.label}</span>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}

        {activeTab === "whatsapp" && (
          <>
            {/* WhatsApp Chat Section */}
            <div className="glass-card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12, height: "420px" }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Chat em Tempo Real (WhatsApp, Telegram, SMS, etc.)
              </span>
              
              <div style={{ display: "flex", flex: 1, gap: 12, minHeight: 0 }}>
                 {/* Contacts List Sidebar */}
                 <div style={{ width: "140px", borderRight: "1px solid var(--border)", paddingRight: 8, display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" }}>
                   <button 
                     onClick={() => {
                       const name = prompt("Digite o nome do contato (ex: João Silva) ou o número com DDD (ex: 5573981618161):");
                       if (!name) return;
                       const app = prompt("Digite o aplicativo (WhatsApp, Telegram, SMS):", "WhatsApp");
                       if (!app) return;
                       
                       const newContact = {
                         id: `${name}-${app}`,
                         name: name,
                         app: app,
                         lastMessage: "",
                         timestamp: Date.now()
                       };
                       setContacts(prev => {
                         if (prev.some(c => c.id === newContact.id)) return prev;
                         return [newContact, ...prev];
                       });
                       setSelectedChatContact(newContact);
                     }}
                     style={{
                       width: "100%",
                       padding: "6px",
                       borderRadius: "6px",
                       border: "1px dashed var(--accent)",
                       background: "rgba(124,58,237,0.1)",
                       color: "var(--text)",
                       cursor: "pointer",
                       fontSize: "10px",
                       fontWeight: "bold",
                       marginBottom: "6px",
                       textAlign: "center"
                     }}
                   >
                     ➕ Nova Conversa
                   </button>

                   {contacts.length === 0 ? (
                     <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", padding: "20px 0" }}>Nenhuma conversa</div>
                   ) : (
                    contacts.map(contact => {
                      const isActive = selectedChatContact?.id === contact.id;
                      
                      return (
                        <button
                          key={contact.id}
                          onClick={() => setSelectedChatContact(contact)}
                          style={{
                            width: "100%",
                            padding: "8px",
                            borderRadius: "6px",
                            border: "1px solid " + (isActive ? "var(--accent)" : "transparent"),
                            background: isActive ? "rgba(124,58,237,0.15)" : "var(--surface-2)",
                            color: "var(--text)",
                            textAlign: "left",
                            cursor: "pointer",
                            fontSize: "11px",
                            transition: "all 0.15s",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                          }}
                        >
                          <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>{contact.name}</div>
                          <div style={{ fontSize: "9px", color: "var(--accent)", marginTop: 1, fontWeight: "bold" }}>
                            📱 {contact.app}
                          </div>
                          {contact.lastMessage && (
                            <div style={{ fontSize: "9px", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
                              {contact.lastMessage}
                            </div>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>

                {/* Chat Message feed */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                  {selectedChatContact ? (
                    <>
                      <div style={{ paddingBottom: 6, borderBottom: "1px solid var(--border)", fontSize: "12px", fontWeight: "bold", color: "var(--text)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>👤 {selectedChatContact.name}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: "10px", background: "var(--accent-glow)", padding: "2px 6px", borderRadius: 4 }}>{selectedChatContact.app}</span>
                          <button
                            onClick={() => {
                              if (confirm(`Tem certeza que deseja apagar a conversa com ${selectedChatContact.name}?`)) {
                                socket?.emit("delete_contact", { id: selectedChatContact.id });
                                setSelectedChatContact(null);
                              }
                            }}
                            style={{
                              background: "none",
                              border: "none",
                              color: "var(--danger)",
                              fontSize: "12px",
                              cursor: "pointer",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              transition: "background 0.2s"
                            }}
                            onMouseOver={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.15)")}
                            onMouseOut={(e) => (e.currentTarget.style.background = "none")}
                            title="Apagar Conversa"
                          >
                            🗑️ Apagar
                          </button>
                        </div>
                      </div>
                      
                      {/* Messages scroll area */}
                      <div style={{ flex: 1, overflowY: "auto", padding: "10px 0", display: "flex", flexDirection: "column", gap: 8 }}>
                        {whatsappMessages
                          .filter(m => (m.isIncoming && m.sender === selectedChatContact.name && m.app === selectedChatContact.app) || 
                                       (!m.isIncoming && m.recipient === selectedChatContact.name && m.app === selectedChatContact.app))
                          .map((m, idx) => {
                            const isMe = !m.isIncoming;
                            const isChatbot = m.sender === "Chatbot";
                            
                            return (
                              <div
                                key={idx}
                                style={{
                                  alignSelf: isMe ? "flex-end" : "flex-start",
                                  maxWidth: "80%",
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: isMe ? "flex-end" : "flex-start"
                                }}
                              >
                                <div
                                  style={{
                                    padding: "8px 12px",
                                    borderRadius: "12px",
                                    borderBottomRightRadius: isMe ? "2px" : "12px",
                                    borderBottomLeftRadius: isMe ? "12px" : "2px",
                                    background: isMe ? (isChatbot ? "rgba(6,182,212,0.15)" : "var(--accent)") : "var(--surface-2)",
                                    border: "1px solid " + (isMe ? (isChatbot ? "var(--accent)" : "var(--accent)") : "var(--border)"),
                                    color: "var(--text)",
                                    fontSize: "12px",
                                    wordBreak: "break-word"
                                  }}
                                >
                                  {m.message}
                                </div>
                                <span style={{ fontSize: "9px", color: "var(--text-muted)", marginTop: 2, padding: "0 4px" }}>
                                  {isChatbot ? "🤖 Chatbot" : (isMe ? "Você" : m.sender)} · {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            );
                          })}
                        {typingContacts[`${selectedChatContact.name}-${selectedChatContact.app}`] && (
                          <div style={{ alignSelf: "flex-end", maxWidth: "80%", display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                            <div style={{
                              padding: "8px 12px",
                              borderRadius: "12px",
                              borderBottomRightRadius: "2px",
                              background: "rgba(6,182,212,0.1)",
                              border: "1px dashed rgba(6,182,212,0.4)",
                              color: "var(--text-muted)",
                              fontSize: "11px",
                              display: "flex",
                              alignItems: "center"
                            }}>
                              <span className="pulse-dots">🤖 Chatbot está digitando</span>
                            </div>
                          </div>
                        )}
                        <div ref={chatEndRef} />
                      </div>

                      {/* Reply field */}
                      <div style={{ display: "flex", gap: 6, paddingTop: 6, borderTop: "1px solid var(--border)" }}>
                        <div style={{ flex: 1, position: "relative" }}>
                          <input
                            value={manualReplyText}
                            onChange={(e) => setManualReplyText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") sendManualReply(); }}
                            placeholder={`Responder para ${selectedChatContact.name} via ${selectedChatContact.app}...`}
                            className={isListening === "reply" ? "jarvis-active" : ""}
                            style={{
                              width: "100%",
                              background: "var(--surface-2)",
                              border: "1px solid var(--border)",
                              borderRadius: 8,
                              padding: "8px 12px",
                              color: "var(--text)",
                              fontSize: 12,
                              outline: "none",
                              transition: "all 0.3s",
                            }}
                          />
                          {isListening === "reply" && (
                            <>
                              <div className="jarvis-ring" />
                              <div className="jarvis-ring jarvis-ring-delay" />
                            </>
                          )}
                        </div>
                        <button
                          className={`ctrl-btn ${isListening === "reply" ? "jarvis-active" : ""}`}
                          onClick={() => startVoiceInput("reply")}
                          style={{
                            padding: "8px 10px",
                            fontSize: 16,
                            position: "relative",
                          }}
                          title={isListening === "reply" ? "J.A.R.V.I.S. está ouvindo..." : "J.A.R.V.I.S. — Comando de Voz"}
                        >
                          🎤
                        </button>
                        <button
                          className="ctrl-btn"
                          style={{ padding: "8px 12px", background: "rgba(124,58,237,0.2)", borderColor: "var(--accent)", flexDirection: "row", gap: 4 }}
                          onClick={sendManualReply}
                        >
                          🚀 Enviar
                        </button>
                      </div>
                    </>
                  ) : (
                    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "11px" }}>
                      Selecione uma conversa para começar
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Chatbot Rules Section */}
            <div className="glass-card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Regras de Auto-Resposta (Chatbot)
              </span>

              {/* Add Rule Form */}
              <form onSubmit={handleAddRule} style={{ display: "flex", flexDirection: "column", gap: 8, background: "var(--surface)", padding: 10, borderRadius: 8, border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 9, color: "var(--text-muted)" }}>Se a mensagem contiver:</label>
                    <input
                      value={newRuleKeyword}
                      onChange={(e) => setNewRuleKeyword(e.target.value)}
                      placeholder="ex: olá"
                      style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", color: "var(--text)", fontSize: 11 }}
                      required
                    />
                  </div>
                  <div style={{ flex: 2, display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 9, color: "var(--text-muted)" }}>Responder automaticamente:</label>
                    <input
                      value={newRuleResponse}
                      onChange={(e) => setNewRuleResponse(e.target.value)}
                      placeholder="ex: Olá! Como posso ajudar?"
                      style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", color: "var(--text)", fontSize: 11 }}
                      required
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="ctrl-btn"
                  style={{ padding: "6px", background: "rgba(16,185,129,0.15)", borderColor: "var(--success)", flexDirection: "row", gap: 4, alignSelf: "flex-end", width: "100%" }}
                >
                  ➕ Adicionar Regra
                </button>
              </form>

              {/* Rules List container */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: "150px", overflowY: "auto" }}>
                {chatbotRules.length === 0 ? (
                  <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", padding: "10px 0" }}>Nenhuma regra configurada</div>
                ) : (
                  chatbotRules.map(rule => (
                    <div
                      key={rule.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 10px",
                        background: "var(--surface-2)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: "11px",
                        gap: 10
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          <span style={{ color: "var(--text-muted)", fontSize: "9px" }}>Se contiver: </span>
                          <strong style={{ color: "var(--accent)" }}>{rule.keyword}</strong>
                        </div>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
                          <span style={{ color: "var(--text-muted)", fontSize: "9px" }}>Responder: </span>
                          <span style={{ color: "var(--text)" }}>{rule.response}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        style={{
                          background: "rgba(239,68,68,0.15)",
                          border: "1px solid var(--danger)",
                          color: "var(--danger)",
                          borderRadius: 6,
                          padding: "3px 6px",
                          fontSize: "10px",
                          cursor: "pointer",
                          transition: "all 0.15s"
                        }}
                      >
                        Excluir
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}

        {activeTab === "humanizado" && (
          <>
            <div className="humanizado-container">
              {/* Header */}
              <section className="glass-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: "50%",
                      background: "linear-gradient(135deg, rgba(16,185,129,0.3), rgba(6,182,212,0.1))",
                      border: "1.5px solid rgba(16,185,129,0.5)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 16, boxShadow: "0 0 20px rgba(16,185,129,0.15)",
                    }}>🎯</div>
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", letterSpacing: "0.05em" }}>
                        Atendimento Humanizado
                      </span>
                      <span style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginTop: 1 }}>
                        Respostas automáticas com tom natural e humano
                      </span>
                    </div>
                  </div>
                  <label className="toggle-wrapper" title={humanizedEnabled ? "Desativar" : "Ativar"}>
                    <input
                      type="checkbox"
                      checked={humanizedEnabled}
                      onChange={(e) => {
                        setHumanizedEnabled(e.target.checked);
                        socket?.emit("update_humanized_config", { enabled: e.target.checked });
                      }}
                    />
                    <span className="toggle-slider" />
                    <span style={{ fontSize: 10, color: humanizedEnabled ? "#10b981" : "var(--text-muted)", fontWeight: 600, marginLeft: 6, minWidth: 50 }}>
                      {humanizedEnabled ? "ATIVO" : "INATIVO"}
                    </span>
                  </label>
                </div>

                <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Delay mínimo</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="range"
                        min={1000}
                        max={8000}
                        step={500}
                        value={humanizedDelayMin}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setHumanizedDelayMin(v);
                          socket?.emit("update_humanized_config", { delayMin: v });
                        }}
                        style={{ width: 80 }}
                      />
                      <span style={{ fontSize: 11, color: "var(--text)", minWidth: 35 }}>{(humanizedDelayMin / 1000).toFixed(1)}s</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Delay máximo</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="range"
                        min={3000}
                        max={15000}
                        step={500}
                        value={humanizedDelayMax}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setHumanizedDelayMax(v);
                          socket?.emit("update_humanized_config", { delayMax: v });
                        }}
                        style={{ width: 80 }}
                      />
                      <span style={{ fontSize: 11, color: "var(--text)", minWidth: 35 }}>{(humanizedDelayMax / 1000).toFixed(1)}s</span>
                    </div>
                  </div>
                </div>

                {humanizedEnabled && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "rgba(16,185,129,0.08)", borderRadius: 8, border: "1px solid rgba(16,185,129,0.2)", fontSize: 11, color: "#10b981" }}>
                    <span>●</span>
                    <span>Modo Humanizado ativo — todas as mensagens recebidas serão respondidas automaticamente com tom natural e delay humano.</span>
                  </div>
                )}
              </section>

              {/* Categorias de Resposta */}
              <section className="glass-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    🗂️ Categorias de Resposta ({humanizedCategories.length})
                  </span>
                  <button
                    className="ctrl-btn"
                    style={{ padding: "4px 10px", fontSize: 10 }}
                    onClick={() => {
                      const name = prompt("Nome da nova categoria:");
                      if (!name) return;
                      const newCat = {
                        id: `cat-${Date.now()}`,
                        name,
                        keywords: [] as string[],
                        responses: ["[Edite esta resposta]"],
                      };
                      const updated = [...humanizedCategories, newCat];
                      setHumanizedCategories(updated);
                      socket?.emit("update_humanized_config", { categories: updated });
                    }}
                  >
                    + Nova Categoria
                  </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 400, overflowY: "auto" }}>
                  {humanizedCategories.map((cat) => (
                    <div key={cat.id} className="humanizado-cat-card">
                      <div
                        className="humanizado-cat-header"
                        onClick={() => setExpandedCat(expandedCat === cat.id ? null : cat.id)}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{expandedCat === cat.id ? "▾" : "▸"}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{cat.name}</span>
                          <span style={{ fontSize: 10, color: "var(--text-muted)", opacity: 0.6 }}>
                            {cat.keywords.length} palavras-chave · {cat.responses.length} respostas
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            className="humanizado-del-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!confirm(`Excluir categoria "${cat.name}"?`)) return;
                              const updated = humanizedCategories.filter(c => c.id !== cat.id);
                              setHumanizedCategories(updated);
                              socket?.emit("update_humanized_config", { categories: updated });
                            }}
                            title="Excluir categoria"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {expandedCat === cat.id && (
                        <div className="humanizado-cat-body">
                          {/* Palavras-chave */}
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <span style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.04em" }}>
                              PALAVRAS-CHAVE
                            </span>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                              {cat.keywords.map((kw, ki) => (
                                <span key={ki} className="humanizado-keyword-tag">
                                  {kw}
                                  <button
                                    className="humanizado-keyword-remove"
                                    onClick={() => {
                                      const updated = humanizedCategories.map(c =>
                                        c.id === cat.id ? { ...c, keywords: c.keywords.filter((_, i) => i !== ki) } : c
                                      );
                                      setHumanizedCategories(updated);
                                      socket?.emit("update_humanized_config", { categories: updated });
                                    }}
                                  >
                                    ✕
                                  </button>
                                </span>
                              ))}
                              <input
                                className="humanizado-keyword-input"
                                placeholder="+ palavra"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && (e.target as HTMLInputElement).value.trim()) {
                                    const val = (e.target as HTMLInputElement).value.trim().toLowerCase();
                                    const updated = humanizedCategories.map(c =>
                                      c.id === cat.id ? { ...c, keywords: [...c.keywords, val] } : c
                                    );
                                    setHumanizedCategories(updated);
                                    socket?.emit("update_humanized_config", { categories: updated });
                                    (e.target as HTMLInputElement).value = "";
                                  }
                                }}
                              />
                            </div>
                          </div>

                          {/* Variações de Resposta */}
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <span style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.04em" }}>
                              VARIAÇÕES DE RESPOSTA ({cat.responses.length})
                            </span>
                            {cat.responses.map((resp, ri) => (
                              <div key={ri} className="humanizado-response-row">
                                <textarea
                                  value={resp}
                                  onChange={(e) => {
                                    const updated = humanizedCategories.map(c =>
                                      c.id === cat.id
                                        ? { ...c, responses: c.responses.map((r, i) => i === ri ? e.target.value : r) }
                                        : c
                                    );
                                    setHumanizedCategories(updated);
                                  }}
                                  onBlur={() => socket?.emit("update_humanized_config", { categories: humanizedCategories })}
                                  className="humanizado-response-textarea"
                                  rows={2}
                                />
                                <button
                                  className="humanizado-del-btn"
                                  style={{ alignSelf: "flex-start", marginTop: 4 }}
                                  onClick={() => {
                                    const updated = humanizedCategories.map(c =>
                                      c.id === cat.id ? { ...c, responses: c.responses.filter((_, i) => i !== ri) } : c
                                    );
                                    setHumanizedCategories(updated);
                                    socket?.emit("update_humanized_config", { categories: updated });
                                  }}
                                  title="Remover variação"
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                            <button
                              className="ctrl-btn"
                              style={{ padding: "4px 10px", fontSize: 10, alignSelf: "flex-start" }}
                              onClick={() => {
                                const updated = humanizedCategories.map(c =>
                                  c.id === cat.id ? { ...c, responses: [...c.responses, "[Edite esta resposta]"] } : c
                                );
                                setHumanizedCategories(updated);
                                socket?.emit("update_humanized_config", { categories: updated });
                              }}
                            >
                              + Variação
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {/* Skill Prompt */}
              <section className="glass-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  📋 Estilo de Atendimento
                </span>
                <textarea
                  value={humanizedPrompt}
                  onChange={(e) => setHumanizedPrompt(e.target.value)}
                  style={{
                    width: "100%",
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "10px 12px",
                    color: "var(--text)",
                    fontSize: 11,
                    fontFamily: "monospace",
                    lineHeight: 1.6,
                    resize: "vertical",
                    minHeight: 100,
                    outline: "none",
                  }}
                  rows={6}
                />
                <span style={{ fontSize: 10, color: "var(--text-muted)", opacity: 0.7 }}>
                  Este prompt define o estilo de todas as respostas. Edite à vontade para personalizar o tom.
                </span>
              </section>
            </div>

            <style>{`
              .humanizado-container { display: flex; flex-direction: column; gap: 12; }
              .humanizado-cat-card {
                background: rgba(19,19,26,0.6);
                border: 1px solid var(--border);
                border-radius: 10px;
                overflow: hidden;
                transition: border-color 0.2s;
              }
              .humanizado-cat-card:hover { border-color: rgba(124,58,237,0.3); }
              .humanizado-cat-header {
                display: flex; align-items: center; justify-content: space-between;
                padding: 10px 12px; cursor: pointer;
                transition: background 0.15s;
              }
              .humanizado-cat-header:hover { background: rgba(124,58,237,0.05); }
              .humanizado-cat-body { display: flex; flex-direction: column; gap: 10; padding: 4px 12px 12px; }
              .humanizado-keyword-tag {
                display: inline-flex; align-items: center; gap: 4px;
                padding: 2px 8px;
                background: rgba(124,58,237,0.12);
                border: 1px solid rgba(124,58,237,0.25);
                border-radius: 12px;
                font-size: 10px;
                color: #a78bfa;
              }
              .humanizado-keyword-remove {
                background: none; border: none; color: #64748b; cursor: pointer;
                font-size: 9px; padding: 0; line-height: 1;
              }
              .humanizado-keyword-remove:hover { color: #ef4444; }
              .humanizado-keyword-input {
                background: transparent; border: 1px dashed var(--border);
                border-radius: 12px; padding: 2px 8px; font-size: 10px;
                color: var(--text); outline: none; width: 90px;
              }
              .humanizado-keyword-input:focus { border-color: rgba(124,58,237,0.5); }
              .humanizado-response-row {
                display: flex; align-items: flex-start; gap: 6px;
              }
              .humanizado-response-textarea {
                flex: 1;
                background: var(--surface-2);
                border: 1px solid var(--border);
                border-radius: 6px;
                padding: 6px 8px;
                color: var(--text);
                font-size: 11px;
                line-height: 1.5;
                resize: vertical;
                outline: none;
                font-family: inherit;
              }
              .humanizado-response-textarea:focus { border-color: rgba(16,185,129,0.5); }
              .humanizado-del-btn {
                background: none; border: none; color: #64748b; cursor: pointer;
                font-size: 11px; padding: 2px 4px; border-radius: 4px;
              }
              .humanizado-del-btn:hover { color: #ef4444; background: rgba(239,68,68,0.1); }
              .toggle-wrapper {
                display: inline-flex; align-items: center; cursor: pointer; gap: 0;
              }
              .toggle-wrapper input { display: none; }
              .toggle-slider {
                width: 36px; height: 20px;
                background: var(--surface-2);
                border: 1px solid var(--border);
                border-radius: 10px;
                position: relative;
                transition: all 0.25s;
              }
              .toggle-slider::after {
                content: "";
                position: absolute;
                width: 14px; height: 14px;
                background: #64748b;
                border-radius: 50%;
                top: 2px; left: 2px;
                transition: all 0.25s;
              }
              .toggle-wrapper input:checked + .toggle-slider {
                background: rgba(16,185,129,0.2);
                border-color: #10b981;
              }
              .toggle-wrapper input:checked + .toggle-slider::after {
                background: #10b981;
                left: 18px;
              }
            `}</style>
          </>
        )}

        {activeTab === "skills" && (
          <>
            {/* Comportamento/Skills Card */}
            <div className="glass-card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Comportamento & Skills do Agente (Chatbot)
              </span>
              
              <form onSubmit={saveAgentSettings} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {/* Fallback Checkbox */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-2)", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)" }}>
                  <input
                    type="checkbox"
                    id="enableFallback"
                    checked={agentSettings.enableFallback}
                    onChange={(e) => setAgentSettings(prev => ({ ...prev, enableFallback: e.target.checked }))}
                    style={{ width: 16, height: 16, cursor: "pointer" }}
                  />
                  <label htmlFor="enableFallback" style={{ fontSize: 12, cursor: "pointer", fontWeight: 500 }}>
                    Ativar resposta de Fallback (Padrão)
                  </label>
                </div>

                {/* Fallback Response Input */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 10, color: "var(--text-muted)" }}>Resposta Fallback (quando não houver palavra-chave correspondente):</label>
                  <textarea
                    rows={2}
                    value={agentSettings.fallbackResponse}
                    onChange={(e) => setAgentSettings(prev => ({ ...prev, fallbackResponse: e.target.value }))}
                    placeholder="Olá! Não entendi sua dúvida..."
                    style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", color: "var(--text)", fontSize: 12, resize: "vertical" }}
                  />
                </div>

                {/* Signature Input */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 10, color: "var(--text-muted)" }}>Assinatura (Anexada ao fim de todas as respostas automáticas):</label>
                  <input
                    type="text"
                    value={agentSettings.signature}
                    onChange={(e) => setAgentSettings(prev => ({ ...prev, signature: e.target.value }))}
                    placeholder="ex: \n— Atendimento Automático"
                    style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", color: "var(--text)", fontSize: 12 }}
                  />
                </div>

                {/* Tipo de Delay */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 10, color: "var(--text-muted)" }}>Tipo de Delay:</label>
                  <select
                    value={agentSettings.delayType}
                    onChange={(e) => setAgentSettings(prev => ({ ...prev, delayType: e.target.value as "fixed" | "dynamic" }))}
                    style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", color: "var(--text)", fontSize: 12, outline: "none", cursor: "pointer" }}
                  >
                    <option value="dynamic">⚡ Simular Digitação Humana (Dinâmico por caractere)</option>
                    <option value="fixed">⏱️ Atraso Fixo (em milissegundos)</option>
                  </select>
                  <span style={{ fontSize: "9px", color: "var(--text-muted)", marginTop: 2 }}>
                    {agentSettings.delayType === "dynamic" 
                      ? "O delay será calculado automaticamente baseado no tamanho da mensagem (simulando tempo de leitura e digitação realista de 2 a 10 segundos)."
                      : "O chatbot aguardará exatamente o tempo configurado abaixo antes de responder."}
                  </span>
                </div>

                {/* Delay Input */}
                {agentSettings.delayType === "fixed" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 10, color: "var(--text-muted)" }}>Delay de Digitação (em milissegundos):</label>
                    <input
                      type="number"
                      value={agentSettings.delayMs}
                      onChange={(e) => setAgentSettings(prev => ({ ...prev, delayMs: Number(e.target.value) }))}
                      placeholder="1000"
                      style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", color: "var(--text)", fontSize: 12 }}
                    />
                  </div>
                )}

                {/* Ignored Contacts (Blacklist) */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 10, color: "var(--text-muted)" }}>Contatos/Números Bloqueados no Chatbot (separados por vírgula):</label>
                  <input
                    type="text"
                    value={agentSettings.ignoredContacts}
                    onChange={(e) => setAgentSettings(prev => ({ ...prev, ignoredContacts: e.target.value }))}
                    placeholder="ex: 5573991422872, NomeDoContato"
                    style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", color: "var(--text)", fontSize: 12 }}
                  />
                  <span style={{ fontSize: "9px", color: "var(--text-muted)", marginTop: 2 }}>
                    Contatos ou números nesta lista continuarão enviando notificações e aparecendo no painel, mas o chatbot nunca responderá a eles automaticamente.
                  </span>
                </div>

                <button
                  type="submit"
                  className="ctrl-btn"
                  style={{ padding: "8px 14px", background: "rgba(124,58,237,0.2)", borderColor: "var(--accent)", flexDirection: "row", gap: 6, fontWeight: "bold" }}
                >
                  💾 Salvar Configurações do Agente
                </button>
              </form>
            </div>

            {/* System Notifications Card */}
            <div className="glass-card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12, height: "400px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Notificações Recebidas do Celular
                </span>
                <span style={{ fontSize: 9, color: "var(--text-muted)" }}>
                  Total: {notifications.length}
                </span>
              </div>
              
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                {notifications.length === 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)", gap: 4 }}>
                    <div style={{ fontSize: 24 }}>🔔</div>
                    <p style={{ fontSize: 11 }}>Nenhuma notificação recebida</p>
                  </div>
                ) : (
                  notifications.map((notif, index) => (
                    <div
                      key={index}
                      style={{
                        padding: "10px",
                        background: "var(--surface-2)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: "12px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 4
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "10px", color: "var(--accent)", fontWeight: "bold", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }}>
                          📦 {notif.packageName.replace("com.android.", "").replace("com.google.android.", "")}
                        </span>
                        <span style={{ fontSize: "8.5px", color: "var(--text-muted)" }}>
                          {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                      <div style={{ fontWeight: 600, color: "var(--text)" }}>{notif.title}</div>
                      <div style={{ color: "var(--text-muted)", fontSize: "11px", wordBreak: "break-all" }}>{notif.text}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}

        {activeTab === "bulk" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 14, minHeight: 0, flex: 1 }}>
              {/* Col 1: Configurações & Importação */}
              <div className="glass-card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Configurações do Disparador
                </span>

                {/* Target App */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500 }}>Aplicativo de Envio:</label>
                  <select
                    value={bulkApp}
                    onChange={(e) => setBulkApp(e.target.value)}
                    disabled={bulkStatus.active}
                    style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", color: "var(--text)", fontSize: 12, cursor: "pointer", outline: "none" }}
                  >
                    <option value="WhatsApp">💬 WhatsApp</option>
                    <option value="WhatsApp Business">💼 WhatsApp Business</option>
                    <option value="SMS">📱 SMS</option>
                  </select>
                </div>

                {/* Mode Select */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500 }}>Modo de Mensagem:</label>
                  <select
                    value={bulkMessageMode}
                    onChange={(e) => setBulkMessageMode(e.target.value as "single" | "personalized")}
                    disabled={bulkStatus.active}
                    style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", color: "var(--text)", fontSize: 12, cursor: "pointer", outline: "none" }}
                  >
                    <option value="single">✉️ Mesma mensagem para todos</option>
                    <option value="personalized">👤 Mensagem personalizada por linha</option>
                  </select>
                </div>

                {/* Destinatários Textarea */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minHeight: 120 }}>
                  <label style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500 }}>
                    Lista de Contatos:
                  </label>
                  <textarea
                    rows={8}
                    value={bulkContactsText}
                    onChange={(e) => setBulkContactsText(e.target.value)}
                    disabled={bulkStatus.active}
                    placeholder={
                      bulkMessageMode === "single"
                        ? "Um número ou nome por linha, ex:\n5573981618161\n5573991422872\nNome do Contato"
                        : "Número/Nome e mensagem separados por ';', ex:\n5573981618161;Olá João, tudo bem?\n5573991422872;Oi Maria, segue o boleto"
                    }
                    style={{ flex: 1, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px", color: "var(--text)", fontSize: 11, resize: "none", fontFamily: "monospace" }}
                  />
                  <span style={{ fontSize: "9px", color: "var(--text-muted)" }}>
                    💡 Dica: Números novos (que não estão em conversas recentes) abrirão o app no celular usando Deep Link para disparar.
                  </span>
                </div>

                {/* Common Message (for Single Mode) */}
                {bulkMessageMode === "single" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500 }}>Mensagem Comum:</label>
                    <textarea
                      rows={3}
                      value={bulkCommonMessage}
                      onChange={(e) => setBulkCommonMessage(e.target.value)}
                      disabled={bulkStatus.active}
                      placeholder="Olá! Digite sua mensagem aqui..."
                      style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", color: "var(--text)", fontSize: 12, resize: "vertical" }}
                    />
                  </div>
                )}
              </div>

              {/* Col 2: Status & Log */}
              <div className="glass-card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Status de Disparo & Logs
                </span>

                {/* Delays Configuration */}
                <div style={{ display: "flex", gap: 10, background: "var(--surface-2)", padding: 10, borderRadius: 8, border: "1px solid var(--border)" }}>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 9, color: "var(--text-muted)" }}>Delay Mínimo: {bulkDelayMin}s</label>
                    <input
                      type="range"
                      min={2}
                      max={60}
                      value={bulkDelayMin}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setBulkDelayMin(val);
                        if (val > bulkDelayMax) setBulkDelayMax(val);
                      }}
                      disabled={bulkStatus.active}
                      style={{ cursor: "pointer", accentColor: "var(--accent)" }}
                    />
                  </div>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 9, color: "var(--text-muted)" }}>Delay Máximo: {bulkDelayMax}s</label>
                    <input
                      type="range"
                      min={2}
                      max={60}
                      value={bulkDelayMax}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setBulkDelayMax(val);
                        if (val < bulkDelayMin) setBulkDelayMin(val);
                      }}
                      disabled={bulkStatus.active}
                      style={{ cursor: "pointer", accentColor: "var(--accent)" }}
                    />
                  </div>
                </div>

                {/* Progress Panel */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6, background: "var(--surface-2)", padding: 10, borderRadius: 8, border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
                    <span style={{ color: "var(--text)", fontWeight: "bold" }}>
                      {bulkStatus.active ? "🟢 Executando disparos..." : "⚪ Aguardando início"}
                    </span>
                    <span style={{ color: "var(--text-muted)" }}>
                      {bulkStatus.queue.length > 0
                        ? `${bulkStatus.currentIndex} de ${bulkStatus.queue.length} (${Math.round((bulkStatus.currentIndex / bulkStatus.queue.length) * 100)}%)`
                        : "0 de 0 (0%)"}
                    </span>
                  </div>

                  {/* Progress Bar container */}
                  <div style={{ width: "100%", height: 8, background: "var(--surface)", borderRadius: 4, overflow: "hidden", border: "1px solid var(--border)" }}>
                    <div
                      style={{
                        width: `${bulkStatus.queue.length > 0 ? (bulkStatus.currentIndex / bulkStatus.queue.length) * 100 : 0}%`,
                        height: "100%",
                        background: "linear-gradient(90deg, var(--accent), var(--success))",
                        transition: "width 0.3s ease"
                      }}
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div style={{ display: "flex", gap: 8 }}>
                  {!bulkStatus.active ? (
                    <button
                      onClick={startBulkSend}
                      className="ctrl-btn"
                      style={{ flex: 1, padding: "10px", background: "rgba(16,185,129,0.2)", borderColor: "var(--success)", flexDirection: "row", gap: 6, fontSize: 12, fontWeight: "bold" }}
                    >
                      🚀 Iniciar Disparos
                    </button>
                  ) : (
                    <button
                      onClick={stopBulkSend}
                      className="ctrl-btn"
                      style={{ flex: 1, padding: "10px", background: "rgba(239,68,68,0.2)", borderColor: "var(--danger)", flexDirection: "row", gap: 6, fontSize: 12, fontWeight: "bold" }}
                    >
                      🛑 Parar Disparos
                    </button>
                  )}
                </div>

                {/* Live Console Logs */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minHeight: 140 }}>
                  <label style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500 }}>Live Logs:</label>
                  <div
                    style={{
                      flex: 1,
                      background: "#050508",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: 10,
                      fontFamily: "monospace",
                      fontSize: 10,
                      color: "#38bdf8",
                      overflowY: "auto",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4
                    }}
                  >
                    {bulkStatus.logs.length === 0 ? (
                      <span style={{ color: "var(--text-muted)" }}>[Sem logs de envio]</span>
                    ) : (
                      bulkStatus.logs.map((logStr: string, idx: number) => {
                        let color = "#38bdf8"; // default blue
                        if (logStr.includes("✓ Sucesso") || logStr.includes("finalizado")) {
                          color = "#10b981"; // green
                        } else if (logStr.includes("✗ Falha") || logStr.includes("erro") || logStr.includes("⚠️")) {
                          color = "#ef4444"; // red
                        } else if (logStr.includes("⏱️ Aguardando")) {
                          color = "#fbbf24"; // yellow/orange
                        }
                        return (
                          <div key={idx} style={{ color, wordBreak: "break-all" }}>
                            {logStr}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Right: Screen Preview (responsivo) */}
      <div style={{ width: "clamp(300px, 35vw, 480px)", minWidth: 300, borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, padding: "14px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Tela do Dispositivo</span>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {deviceWidth}×{deviceHeight}
              {hoverPos && ` · ${hoverPos.x},${hoverPos.y}`}
            </span>
          </div>
          <div
            ref={screenRef}
            className="phone-screen"
            style={{ flex: 1, position: "relative", cursor: "crosshair", overflow: "hidden", userSelect: "none", minHeight: 300, maxHeight: "calc(100vh - 280px)" }}
            onMouseDown={handleScreenDown}
            onMouseMove={handleScreenMove}
            onMouseUp={handleScreenUp}
            onMouseLeave={handleScreenLeave}
            onWheel={handleWheel}
          >
            {screenFrame ? (
              <img
                src={screenFrame.startsWith('/9j/') ? `data:image/jpeg;base64,${screenFrame}` : `data:image/png;base64,${screenFrame}`}
                alt="screen"
                draggable={false}
                style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }}
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)", gap: 4 }}>
                <div style={{ fontSize: 28 }}>🖥️</div>
                <p style={{ fontSize: 12 }}>Stream ausente</p>
                <p style={{ fontSize: 11, opacity: 0.6 }}>Clique em Capturar</p>
              </div>
            )}

            {hoverPos && !isDragging && (
              <div style={{ position: "absolute", pointerEvents: "none", left: 0, top: 0, width: "100%", height: "100%" }}>
                <div style={{ position: "absolute", left: `${(hoverPos.x / deviceWidth) * 100}%`, top: `${(hoverPos.y / deviceHeight) * 100}%`, width: 18, height: 18, transform: "translate(-50%,-50%)", border: "2px solid rgba(124,58,237,0.7)", borderRadius: "50%", boxShadow: "0 0 6px rgba(124,58,237,0.4)" }} />
              </div>
            )}

            {isDragging && dragStart && dragEnd && (
              <svg style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
                <line x1={`${(dragStart.x / deviceWidth) * 100}%`} y1={`${(dragStart.y / deviceHeight) * 100}%`} x2={`${(dragEnd.x / deviceWidth) * 100}%`} y2={`${(dragEnd.y / deviceHeight) * 100}%`} stroke="rgba(6,182,212,0.8)" strokeWidth={3} strokeLinecap="round" strokeDasharray="6 4" />
                <circle cx={`${(dragStart.x / deviceWidth) * 100}%`} cy={`${(dragStart.y / deviceHeight) * 100}%`} r={5} fill="rgba(6,182,212,0.9)" />
                <circle cx={`${(dragEnd.x / deviceWidth) * 100}%`} cy={`${(dragEnd.y / deviceHeight) * 100}%`} r={5} fill="rgba(6,182,212,0.9)" />
              </svg>
            )}

            {ripple && (
              <div style={{ position: "absolute", left: `${(ripple.x / deviceWidth) * 100}%`, top: `${(ripple.y / deviceHeight) * 100}%`, transform: "translate(-50%,-50%)", width: 0, height: 0, borderRadius: "50%", background: "rgba(124,58,237,0.4)", animation: "rippleAnim 0.6s ease-out forwards", pointerEvents: "none" }} />
            )}
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              className="ctrl-btn"
              style={{ padding: "6px 14px", fontSize: 11, flex: 1, flexDirection: "row", gap: 6, background: screenPolling ? "rgba(16,185,129,0.15)" : "var(--surface-2)", borderColor: screenPolling ? "var(--success)" : "var(--border)" }}
              onClick={() => setScreenPolling((v) => !v)}
            >
              {screenPolling ? "📡" : "📷"} {screenPolling ? "Capturando" : "Capturar Tela"}
            </button>
            <input type="number" value={deviceWidth} onChange={(e) => setDeviceWidth(Number(e.target.value))} style={{ width: 60, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 4, padding: "4px 6px", color: "var(--text)", fontSize: 11 }} />
            <span style={{ color: "var(--text-muted)", fontSize: 11 }}>×</span>
            <input type="number" value={deviceHeight} onChange={(e) => setDeviceHeight(Number(e.target.value))} style={{ width: 60, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 4, padding: "4px 6px", color: "var(--text)", fontSize: 11 }} />
          </div>
        </div>

        {/* QR Code */}
        <div style={{ borderTop: "1px solid var(--border)" }}>
          <QrConnect />
        </div>

        {/* Command Log */}
        <div style={{ height: 180, borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px 4px" }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Log de Comandos</span>
            <button onClick={() => setLog([])} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 11, padding: "2px 6px", borderRadius: 4 }}>Limpar</button>
          </div>
          <div style={{ overflowY: "auto", padding: "0 14px 8px", fontFamily: "monospace", fontSize: 11, height: 140 }}>
            {log.length === 0 ? (
              <p style={{ color: "var(--text-muted)", paddingTop: 4 }}>Nenhum comando enviado.</p>
            ) : (
              log.map((entry, i) => {
                const isResult = entry.includes("✓") || entry.includes("✗");
                return (
                  <div key={i} style={{ color: i === 0 ? (isResult ? "#10b981" : "#06b6d4") : "var(--text-muted)", paddingBottom: 2 }}>
                    {entry}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>

      {isListening && (
        <JarvisOverlay
          target={isListening}
          transcript={jarvisTranscript}
          onDismiss={stopListening}
        />
      )}
    </>
  );
}

/* J.A.R.V.I.S. Fullscreen Overlay */
function JarvisOverlay({
  target,
  transcript,
  onDismiss,
}: {
  target: "prompt" | "reply";
  transcript: string;
  onDismiss: () => void;
}) {
  return (
    <div
      onClick={onDismiss}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(10,10,15,0.92)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        cursor: "pointer",
        animation: "fadeIn 0.3s ease",
        backdropFilter: "blur(4px)",
      }}
    >
      {/* JARVIS Logo / Name */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <div style={{
          width: 80, height: 80,
          borderRadius: "50%",
          background: "linear-gradient(135deg, rgba(124,58,237,0.3), rgba(6,182,212,0.1))",
          border: "2px solid rgba(124,58,237,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 32, fontWeight: "bold",
          color: "#7c3aed",
          animation: "jarvisPulse 2s ease-in-out infinite",
          boxShadow: "0 0 60px rgba(124,58,237,0.3)",
        }}>
          J
        </div>
      </div>

      {/* Pulsing Rings */}
      <div style={{ position: "relative", width: 200, height: 200, margin: "-40px 0" }}>
        <div style={{ position: "absolute", top: "50%", left: "50%", width: "100%", height: "100%", borderRadius: "50%", border: "2px solid rgba(124,58,237,0.4)", animation: "jarvisRing 2.5s ease-out infinite", transform: "translate(-50%,-50%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: "50%", left: "50%", width: "100%", height: "100%", borderRadius: "50%", border: "2px solid rgba(124,58,237,0.3)", animation: "jarvisRing 2.5s ease-out infinite 0.8s", transform: "translate(-50%,-50%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: "50%", left: "50%", width: "100%", height: "100%", borderRadius: "50%", border: "2px solid rgba(124,58,237,0.2)", animation: "jarvisRing 2.5s ease-out infinite 1.6s", transform: "translate(-50%,-50%)", pointerEvents: "none" }} />
      </div>

      {/* J.A.R.V.I.S. Title */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <span style={{
          fontSize: 28,
          fontWeight: 800,
          background: "linear-gradient(135deg, #7c3aed, #06b6d4)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          letterSpacing: "0.15em",
        }}>
          J.A.R.V.I.S.
        </span>
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          color: "#94a3b8",
          letterSpacing: "0.05em",
        }}>
          <span className="jarvis-dot" />
          {target === "prompt" ? "COMANDO DE VOZ" : "RESPOSTA DE VOZ"}
        </span>
      </div>

      {/* Live Transcript */}
      <div style={{
        maxWidth: 480,
        padding: "16px 24px",
        borderRadius: 12,
        background: "rgba(124,58,237,0.08)",
        border: "1px solid rgba(124,58,237,0.2)",
        fontSize: 18,
        color: "#e2e8f0",
        textAlign: "center",
        minHeight: 24,
        minWidth: 200,
        lineHeight: 1.5,
      }}>
        {transcript || "🎤 Aguardando..."}
      </div>

      {/* Hint */}
      <span style={{ fontSize: 11, color: "#475569", marginTop: 8 }}>
        Clique em qualquer lugar para cancelar
      </span>
    </div>
  );
}
