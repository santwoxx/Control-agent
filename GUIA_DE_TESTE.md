# 🚀 Guia de Teste Rápido — Controle Manual do Android

## Visão Geral do Fluxo

```
[Painel Web] ←→ [Servidor Node.js] ←→ [App Android (Agent)]
   :3000            :3001               (WebSocket)
```

---

## 1. Configurar o IP do Servidor

Antes de compilar o app Android, abra o arquivo:

**`android-agent/app/src/main/java/com/remotecontrol/agent/service/AgentService.kt`**

E altere a linha:
```kotlin
const val SERVER_URL = "ws://192.168.1.100:3001" // ← Coloque o IP do seu PC aqui
```

Para descobrir o IP do seu PC na rede local, execute no terminal:
```powershell
ipconfig
```
Procure por `IPv4 Address` da sua interface Wi-Fi ou Ethernet.

---

## 2. Iniciar o Servidor Backend

```powershell
cd backend-server
npm run dev
```

O servidor rodará em: `http://localhost:3001`

> **Nota:** O servidor usa armazenamento em memória para esta fase de testes. Nenhum banco de dados é necessário ainda!

---

## 3. Iniciar o Painel Web

Em outro terminal:
```powershell
cd web-panel
npm run dev
```

O painel estará disponível em: `http://localhost:3000`

---

## 4. Compilar e Instalar o App Android

### Via Android Studio (recomendado):
1. Abra o Android Studio
2. Clique em **File → Open**
3. Selecione a pasta `android-agent/`
4. Aguarde o Gradle sincronizar
5. Conecte o celular via USB com **Depuração USB ativada**
6. Clique em ▶ **Run**

### Via ADB (linha de comando):
```bash
# Instalar o APK após build
adb install app-debug.apk
```

---

## 5. Configurar o App no Celular

Após instalar e abrir o app, ele irá **redirecionar automaticamente** para as Configurações de Acessibilidade.

1. No celular: **Configurações → Acessibilidade → Remote Control Agent → Ativar**
2. Aceite a confirmação de permissão

> ⚠️ Sem a Acessibilidade ativa, os comandos de toque e texto não funcionarão.

---

## 6. Testar o Fluxo de Notas

No Painel Web (`http://localhost:3000`):

1. ✅ O dispositivo deve aparecer na barra lateral com status **Online**
2. Clique em **"Abrir Aplicativo"** → selecione **📝 Google Keep (Notas)**
3. Clique em **▶ Abrir**
4. Aguarde o app abrir no celular
5. No campo **"Toque em Coordenada"**, coloque as coordenadas do botão "nova nota" (ex: X: 1000, Y: 1900) e clique em **👆 Tap**
6. No campo **"Digitar Texto"**, escreva sua mensagem e clique em **⌨ Enviar**

---

## Comandos WebSocket Disponíveis

| Comando | Payload | Descrição |
|---|---|---|
| `PRESS_BACK` | - | Botão Voltar |
| `PRESS_HOME` | - | Botão Home |
| `PRESS_RECENTS` | - | Botão Recentes |
| `TAP` | `{ x, y }` | Toque em coordenada |
| `SWIPE` | `{ direction: "up/down/left/right" }` | Swipe |
| `SCROLL` | `{ direction: "up/down" }` | Scroll |
| `TYPE_TEXT` | `{ text }` | Digitar texto |
| `OPEN_APP` | `{ package }` | Abrir app por pacote |
| `VOLUME_UP` | - | Aumentar volume |
| `VOLUME_DOWN` | - | Diminuir volume |
| `SCREENSHOT` | - | Tirar print (Fase 2) |
| `START_SCREEN_STREAM` | - | Stream de tela (Fase 2) |

---

## Estrutura de Arquivos Criados

```
Script Controle Total Andoid/
├── docker-compose.yml         # PostgreSQL + Redis (para produção)
├── backend-server/
│   ├── src/index.ts           # Servidor Fastify + Socket.IO
│   ├── prisma/schema.prisma   # Esquema do banco
│   ├── .env                   # Configurações de ambiente
│   └── package.json
├── web-panel/
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx     # Layout raiz com SocketProvider
│   │   │   ├── page.tsx       # Página principal
│   │   │   └── globals.css    # Design system dark
│   │   ├── components/
│   │   │   ├── DeviceSidebar.tsx  # Lista de dispositivos
│   │   │   └── ControlPanel.tsx   # Painel de controle manual
│   │   └── context/
│   │       └── SocketContext.tsx  # WebSocket state management
│   └── package.json
└── android-agent/
    └── app/src/main/
        ├── AndroidManifest.xml
        ├── java/com/remotecontrol/agent/
        │   ├── RemoteControlApp.kt          # Application (Hilt)
        │   ├── accessibility/
        │   │   └── RemoteAccessibilityService.kt  # Toque, Swipe, Texto
        │   ├── service/
        │   │   └── AgentService.kt          # WebSocket + Command Router
        │   ├── ui/
        │   │   └── MainActivity.kt          # Setup screen
        │   └── receiver/
        │       └── BootReceiver.kt          # Auto-start no boot
        └── res/
            ├── values/strings.xml
            └── xml/accessibility_service_config.xml
```
